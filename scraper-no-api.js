import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const stats = {
  startTime: new Date(),
  totalProducts: 0,
  totalSaved: 0,
  totalPages: 0
};

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  fs.appendFileSync('scraper-no-api.log', `[${new Date().toISOString()}] ${message}\n`);
}

function inferSubcategory(productName, category) {
  const nameLower = productName.toLowerCase();
  
  if (category === 'Iluminação') {
    if (nameLower.includes('pendente')) return 'Pendentes';
    if (nameLower.includes('luminária de mesa') || nameLower.includes('abajur')) return 'Luminárias de Mesa';
    if (nameLower.includes('luminária de piso')) return 'Luminárias de Piso';
    if (nameLower.includes('arandela')) return 'Arandelas';
    if (nameLower.includes('plafon')) return 'Plafons';
    if (nameLower.includes('lustre')) return 'Lustres';
    if (nameLower.includes('spot')) return 'Spots';
    if (nameLower.includes('poste')) return 'Postes';
    if (nameLower.includes('refletor')) return 'Refletores';
  }
  
  return 'Outros';
}

async function scrapeWithPuppeteer() {
  let browser;
  
  try {
    log('🚀 SCRAPER SEM API - USANDO PUPPETEER DIRETO');
    log('════════════════════════════════');
    log('Iniciando browser...');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Configurações anti-detecção
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Interceptar requisições para economizar banda
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.resourceType() === 'font' || req.resourceType() === 'stylesheet') {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // Começar com Iluminação (já que Móveis foi feito)
    const categories = [
      { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' },
      { name: 'Acessórios de Decoração', url: 'https://casoca.com.br/acessorios-de-decoracao.html' },
    ];
    
    for (const category of categories) {
      log(`\n📁 CATEGORIA: ${category.name}`);
      
      let consecutiveEmpty = 0;
      let categoryProducts = 0;
      
      for (let pageNum = 1; pageNum <= 500; pageNum++) {
        const url = pageNum === 1 ? category.url : `${category.url}?p=${pageNum}`;
        log(`  Página ${pageNum}: ${url}`);
        
        try {
          await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 60000
          });
          
          // Aguardar produtos carregarem
          await page.waitForSelector('.product', { timeout: 10000 }).catch(() => {});
          
          // Extração esperar 2 segundos para garantir
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Extrair produtos
          const products = await page.evaluate((categoryName) => {
            const items = [];
            
            document.querySelectorAll('.col-md-4.detail-product').forEach((element, index) => {
              const container = element.querySelector('.product-container');
              if (!container) return;
              
              const name = container.querySelector('.info h2')?.textContent?.trim() ||
                          container.querySelector('.product-text strong')?.textContent?.trim();
              
              const link = container.querySelector('a.product-item-photo')?.href || '';
              const img = container.querySelector('img');
              const imageUrl = img?.src || img?.dataset?.src || '';
              
              if (name) {
                items.push({
                  name: name.substring(0, 200),
                  image_url: imageUrl,
                  link: link || `https://casoca.com.br/p/${Date.now()}-${index}`,
                  category: categoryName
                });
              }
            });
            
            return items;
          }, category.name);
          
          if (products.length === 0) {
            consecutiveEmpty++;
            log(`    ⚠️ Página vazia (${consecutiveEmpty} consecutivas)`);
            
            if (consecutiveEmpty >= 5) {
              log(`    🛑 5 páginas vazias - finalizando categoria`);
              break;
            }
          } else {
            consecutiveEmpty = 0;
            log(`    ✅ ${products.length} produtos encontrados`);
            
            // Salvar produtos
            for (const product of products) {
              product.subcategory = inferSubcategory(product.name, product.category);
              
              try {
                // Verificar se existe
                const { data: existing } = await supabase
                  .from('products')
                  .select('id')
                  .eq('link', product.link)
                  .single();
                
                if (existing) {
                  // Update
                  await supabase
                    .from('products')
                    .update({
                      name: product.name,
                      image_url: product.image_url,
                      category: product.category,
                      subcategory: product.subcategory,
                      updated_at: new Date().toISOString()
                    })
                    .eq('link', product.link);
                } else {
                  // Insert
                  const { error } = await supabase
                    .from('products')
                    .insert(product);
                  
                  if (!error) {
                    stats.totalSaved++;
                  }
                }
              } catch (err) {
                // Ignorar erros
              }
            }
            
            categoryProducts += products.length;
            stats.totalProducts += products.length;
            
            log(`    💾 Total salvos: ${stats.totalSaved}`);
          }
          
          stats.totalPages++;
          
          // Aguardar entre páginas (mais tempo para não ser detectado)
          const waitTime = 5000 + Math.random() * 5000; // 5-10 segundos
          log(`    ⏳ Aguardando ${Math.round(waitTime/1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
        } catch (error) {
          log(`    ❌ Erro: ${error.message}`);
          consecutiveEmpty++;
          
          if (consecutiveEmpty >= 5) {
            break;
          }
        }
        
        // Status a cada 10 páginas
        if (pageNum % 10 === 0) {
          log(`  📊 Progresso: ${pageNum} páginas, ${categoryProducts} produtos`);
        }
      }
      
      log(`\n✅ ${category.name} COMPLETO: ${categoryProducts} produtos`);
    }
    
  } catch (error) {
    log(`❌ Erro crítico: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    
    const runTime = Math.floor((new Date() - stats.startTime) / 1000 / 60);
    
    log('\n════════════════════════════════');
    log('📊 RESUMO FINAL:');
    log(`  ⏱️ Tempo: ${runTime} minutos`);
    log(`  📄 Páginas: ${stats.totalPages}`);
    log(`  📦 Produtos: ${stats.totalProducts}`);
    log(`  💾 Salvos: ${stats.totalSaved}`);
    log('════════════════════════════════');
  }
}

// Executar
scrapeWithPuppeteer();