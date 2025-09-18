import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar Puppeteer com Stealth
puppeteer.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configurações
const CONFIG = {
  USE_PROXY: false, // Mudar para true quando tiver proxies
  HEADLESS: 'new',  // Use 'new' for production server
  MAX_PAGES_PER_CATEGORY: 500,
  CONCURRENT_BROWSERS: 1, // Começar com 1
  WAIT_BETWEEN_PAGES: 3000,
  CLOUDFLARE_WAIT: 10000,
  SAVE_COOKIES: true
};

// Lista de proxies (adicionar quando tiver Webshare)
const PROXIES = [
  // Formato: 'http://usuario:senha@ip:porta'
  // Exemplo: 'http://user123:pass456@185.199.229.156:7492'
];

// Armazenar cookies do Cloudflare
let cloudfareCookies = null;
const cookiesFile = path.join(__dirname, 'cloudflare-cookies.json');

// Carregar cookies salvos
if (fs.existsSync(cookiesFile)) {
  try {
    cloudfareCookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
    console.log('🍪 Cookies do Cloudflare carregados');
  } catch (err) {
    console.log('⚠️ Erro ao carregar cookies');
  }
}

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  fs.appendFileSync('scraper-unflare.log', `[${timestamp}] ${message}\n`);
}

function getRandomProxy() {
  if (!CONFIG.USE_PROXY || PROXIES.length === 0) {
    return null;
  }
  return PROXIES[Math.floor(Math.random() * PROXIES.length)];
}

function inferSubcategory(productName, category) {
  const nameLower = productName.toLowerCase();
  
  if (category === 'Móveis') {
    if (nameLower.includes('poltrona')) return 'Poltronas';
    if (nameLower.includes('cadeira')) return 'Cadeiras';
    if (nameLower.includes('mesa')) return 'Mesas';
    if (nameLower.includes('sofá')) return 'Sofás';
    if (nameLower.includes('banqueta')) return 'Banquetas';
    if (nameLower.includes('banco')) return 'Bancos';
    if (nameLower.includes('estante')) return 'Estantes';
    if (nameLower.includes('cama')) return 'Camas';
    if (nameLower.includes('armário')) return 'Armários';
  }
  
  if (category === 'Iluminação') {
    if (nameLower.includes('pendente')) return 'Pendentes';
    if (nameLower.includes('luminária de mesa') || nameLower.includes('abajur')) return 'Luminárias de Mesa';
    if (nameLower.includes('luminária de piso')) return 'Luminárias de Piso';
    if (nameLower.includes('arandela')) return 'Arandelas';
    if (nameLower.includes('plafon')) return 'Plafons';
    if (nameLower.includes('lustre')) return 'Lustres';
    if (nameLower.includes('spot')) return 'Spots';
    if (nameLower.includes('poste')) return 'Postes';
  }
  
  return 'Outros';
}

async function createBrowserWithBypass(proxy = null) {
  log('🚀 Iniciando browser com stealth...');
  
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=site-per-process',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--window-size=1920,1080',
  ];
  
  if (proxy) {
    args.push(`--proxy-server=${proxy}`);
    log(`🌐 Usando proxy: ${proxy}`);
  }
  
  const browser = await puppeteer.launch({
    headless: CONFIG.HEADLESS,
    args,
    executablePath: process.platform === 'linux' ? '/usr/bin/chromium-browser' : undefined,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  // Configurações anti-detecção
  await page.evaluateOnNewDocument(() => {
    // Sobrescrever propriedades que revelam automação
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
    
    // Adicionar propriedades do Chrome
    window.chrome = { runtime: {} };
    
    // Sobrescrever permissões
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
  
  // User agent realista
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  // Se tiver cookies salvos, aplicar
  if (cloudfareCookies && cloudfareCookies.length > 0) {
    log('🍪 Aplicando cookies salvos...');
    await page.setCookie(...cloudfareCookies);
  }
  
  return { browser, page };
}

async function bypassCloudflare(page, url) {
  log('🔓 Tentando bypass do Cloudflare...');
  
  try {
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    // Aguardar um pouco
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verificar se está no Cloudflare
    const title = await page.title();
    const html = await page.content();
    
    if (title.includes('Just a moment') || html.includes('Checking your browser')) {
      log('⏳ Cloudflare detectado, aguardando...');
      
      // Aguardar o Cloudflare resolver
      await new Promise(resolve => setTimeout(resolve, CONFIG.CLOUDFLARE_WAIT));
      
      // Tentar aguardar navegação
      try {
        await page.waitForNavigation({ 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
      } catch (e) {
        // Pode não haver navegação explícita
      }
      
      // Verificar novamente
      const newTitle = await page.title();
      if (!newTitle.includes('Just a moment')) {
        log('✅ Cloudflare bypass bem-sucedido!');
        
        // Salvar cookies
        if (CONFIG.SAVE_COOKIES) {
          cloudfareCookies = await page.cookies();
          fs.writeFileSync(cookiesFile, JSON.stringify(cloudfareCookies, null, 2));
          log('💾 Cookies salvos para próximas sessões');
        }
        
        return true;
      } else {
        log('⚠️ Cloudflare ainda presente, tentando aguardar mais...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } else {
      log('✅ Página carregada sem Cloudflare');
      return true;
    }
    
  } catch (error) {
    log(`❌ Erro no bypass: ${error.message}`);
    return false;
  }
  
  return true;
}

async function extractProducts(page, categoryName) {
  try {
    // Aguardar produtos carregarem
    await page.waitForSelector('.product, .product-container', { timeout: 5000 }).catch(() => {});
    
    const products = await page.evaluate((category) => {
      const items = [];
      
      // Tentar seletor principal
      let productElements = document.querySelectorAll('.col-md-4.detail-product');
      
      // Se não encontrar, tentar alternativas
      if (productElements.length === 0) {
        productElements = document.querySelectorAll('.product');
      }
      
      productElements.forEach((element, index) => {
        const container = element.querySelector('.product-container') || element;
        
        // Nome do produto
        let name = '';
        const nameSelectors = [
          '.info h2',
          '.product-text strong',
          '.product-name',
          'h3',
          'h4',
          'strong'
        ];
        
        for (const selector of nameSelectors) {
          const el = container.querySelector(selector);
          if (el) {
            name = el.textContent?.trim();
            if (name) break;
          }
        }
        
        // Link do produto
        const linkEl = container.querySelector('a.product-item-photo, a[href*=".html"]');
        const link = linkEl?.href || '';
        
        // Imagem
        const img = container.querySelector('img');
        const imageUrl = img?.src || img?.dataset?.src || '';
        
        if (name && name.length > 0) {
          items.push({
            name: name.substring(0, 200),
            image_url: imageUrl,
            link: link || `https://casoca.com.br/p/${Date.now()}-${index}`,
            category: category
          });
        }
      });
      
      return items;
    }, categoryName);
    
    // Adicionar subcategorias
    products.forEach(product => {
      product.subcategory = inferSubcategory(product.name, product.category);
    });
    
    return products;
    
  } catch (error) {
    log(`❌ Erro ao extrair produtos: ${error.message}`);
    return [];
  }
}

async function saveProducts(products) {
  let saved = 0;
  let errors = 0;
  
  for (const product of products) {
    try {
      // Verificar se existe
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('link', product.link)
        .single();
      
      if (existing) {
        // Atualizar
        const { error } = await supabase
          .from('products')
          .update({
            name: product.name,
            image_url: product.image_url,
            category: product.category,
            subcategory: product.subcategory,
            updated_at: new Date().toISOString()
          })
          .eq('link', product.link);
        
        if (!error) saved++;
        else errors++;
      } else {
        // Inserir
        const { error } = await supabase
          .from('products')
          .insert(product);
        
        if (!error) saved++;
        else if (error.code === '23505') saved++; // Duplicado
        else errors++;
      }
    } catch (err) {
      errors++;
    }
  }
  
  return { saved, errors };
}

async function scrapeCategory(category) {
  log(`\n📁 INICIANDO CATEGORIA: ${category.name}`);
  log(`URL: ${category.url}`);
  
  const proxy = getRandomProxy();
  const { browser, page } = await createBrowserWithBypass(proxy);
  
  let totalProducts = 0;
  let totalSaved = 0;
  let consecutiveEmpty = 0;
  
  try {
    // Primeira página - fazer bypass
    const bypassSuccess = await bypassCloudflare(page, category.url);
    
    if (!bypassSuccess) {
      log('❌ Falha no bypass do Cloudflare');
      await browser.close();
      return { products: 0, saved: 0 };
    }
    
    // Começar extração
    for (let pageNum = 1; pageNum <= CONFIG.MAX_PAGES_PER_CATEGORY; pageNum++) {
      const url = pageNum === 1 ? category.url : `${category.url}?p=${pageNum}`;
      
      log(`  📄 Página ${pageNum}`);
      
      // Se não for a primeira página, navegar
      if (pageNum > 1) {
        try {
          await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (err) {
          log(`  ⚠️ Erro ao navegar: ${err.message}`);
          consecutiveEmpty++;
          if (consecutiveEmpty >= 5) break;
          continue;
        }
      }
      
      // Extrair produtos
      const products = await extractProducts(page, category.name);
      
      if (products.length === 0) {
        consecutiveEmpty++;
        log(`  ⚠️ Página vazia (${consecutiveEmpty} consecutivas)`);
        if (consecutiveEmpty >= 5) {
          log('  🛑 5 páginas vazias - finalizando categoria');
          break;
        }
      } else {
        consecutiveEmpty = 0;
        log(`  ✅ ${products.length} produtos encontrados`);
        
        // Salvar produtos
        const { saved, errors } = await saveProducts(products);
        totalProducts += products.length;
        totalSaved += saved;
        
        log(`  💾 Salvos: ${saved}, Erros: ${errors}`);
      }
      
      // Progresso
      if (pageNum % 10 === 0) {
        log(`  📊 Progresso: ${pageNum} páginas, ${totalProducts} produtos`);
      }
      
      // Aguardar entre páginas
      await new Promise(resolve => setTimeout(resolve, CONFIG.WAIT_BETWEEN_PAGES + Math.random() * 2000));
    }
    
  } catch (error) {
    log(`❌ Erro na categoria: ${error.message}`);
  } finally {
    await browser.close();
  }
  
  log(`✅ ${category.name} completo: ${totalProducts} produtos, ${totalSaved} salvos`);
  return { products: totalProducts, saved: totalSaved };
}

async function main() {
  log('🚀 SCRAPER UNFLARE - BYPASS CLOUDFLARE');
  log('════════════════════════════════');
  log('Configurações:');
  log(`  • Proxy: ${CONFIG.USE_PROXY ? 'Ativado' : 'Desativado'}`);
  log(`  • Headless: ${CONFIG.HEADLESS}`);
  log(`  • Max páginas: ${CONFIG.MAX_PAGES_PER_CATEGORY}`);
  log('');
  
  // Começar com categorias que ainda não foram feitas
  const categories = [
    { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' },
    { name: 'Acessórios de Decoração', url: 'https://casoca.com.br/acessorios-de-decoracao.html' },
    { name: 'Louças e Metais', url: 'https://casoca.com.br/loucas-e-metais.html' },
    { name: 'Eletros', url: 'https://casoca.com.br/eletros.html' },
    { name: 'Portas e Janelas', url: 'https://casoca.com.br/portas-e-janelas.html' },
    { name: 'Escritório', url: 'https://casoca.com.br/escritorio.html' },
    { name: 'Quarto Infantil', url: 'https://casoca.com.br/quarto-infantil.html' },
    { name: 'Móveis para Área Externa', url: 'https://casoca.com.br/moveis/moveis-para-area-externa.html' },
    { name: 'Cortinas e Persianas', url: 'https://casoca.com.br/acessorios-de-decoracao/cortinas-e-persianas.html' },
    { name: 'Vegetação', url: 'https://casoca.com.br/vegetacao.html' },
    { name: 'Papéis de Parede', url: 'https://casoca.com.br/revestimentos/revestimentos-de-parede/papeis-de-parede.html' },
    { name: 'Tapetes', url: 'https://casoca.com.br/acessorios-de-decoracao/tapetes.html' }
  ];
  
  const startTime = new Date();
  let grandTotal = 0;
  let grandSaved = 0;
  
  for (const category of categories) {
    const { products, saved } = await scrapeCategory(category);
    grandTotal += products;
    grandSaved += saved;
    
    // Pausa entre categorias
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  const elapsed = Math.floor((new Date() - startTime) / 1000 / 60);
  
  log('\n════════════════════════════════');
  log('📊 RESUMO FINAL:');
  log(`  ⏱️ Tempo total: ${elapsed} minutos`);
  log(`  📦 Total produtos: ${grandTotal}`);
  log(`  💾 Total salvos: ${grandSaved}`);
  log('════════════════════════════════');
  log('✅ SCRAPER FINALIZADO!');
}

// Executar
main().catch(err => {
  log(`❌ ERRO CRÍTICO: ${err.message}`);
  console.error(err);
  process.exit(1);
});