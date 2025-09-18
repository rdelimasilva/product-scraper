import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Usar stealth plugin
puppeteer.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Lista de proxies gratuitos (você pode obter do Webshare ou outros serviços)
// Formato: http://username:password@proxy-server:port
const PROXIES = [
  // Adicione seus proxies aqui
  // 'http://user:pass@proxy1.webshare.io:8080',
  // 'http://user:pass@proxy2.webshare.io:8080',
];

// Proxy rotativo
let currentProxyIndex = 0;
function getNextProxy() {
  if (PROXIES.length === 0) return null;
  const proxy = PROXIES[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length;
  return proxy;
}

// Stats
const stats = {
  startTime: new Date(),
  totalProducts: 0,
  totalSaved: 0,
  totalPages: 0,
  errors: 0,
  cloudflareBlocks: 0
};

// Logging
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  fs.appendFileSync('scraper-proxy.log', `[${new Date().toISOString()}] ${message}\n`);
}

// Inferir subcategoria
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
  } else if (category === 'Móveis') {
    if (nameLower.includes('cadeira')) return 'Cadeiras';
    if (nameLower.includes('poltrona')) return 'Poltronas';
    if (nameLower.includes('sofá') || nameLower.includes('sofa')) return 'Sofás';
    if (nameLower.includes('mesa')) return 'Mesas';
    if (nameLower.includes('banco')) return 'Bancos';
    if (nameLower.includes('estante')) return 'Estantes';
    if (nameLower.includes('armário')) return 'Armários';
    if (nameLower.includes('aparador')) return 'Aparadores';
    if (nameLower.includes('buffet')) return 'Buffets';
    if (nameLower.includes('cristaleira')) return 'Cristaleiras';
    if (nameLower.includes('cômoda')) return 'Cômodas';
  } else if (category === 'Acessórios de Decoração') {
    if (nameLower.includes('vaso')) return 'Vasos';
    if (nameLower.includes('quadro')) return 'Quadros';
    if (nameLower.includes('espelho')) return 'Espelhos';
    if (nameLower.includes('tapete')) return 'Tapetes';
    if (nameLower.includes('almofada')) return 'Almofadas';
    if (nameLower.includes('cortina')) return 'Cortinas';
    if (nameLower.includes('relógio')) return 'Relógios';
  }

  return 'Outros';
}

// Criar browser com proxy
async function createBrowser(useProxy = true) {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1080'
  ];

  if (useProxy && PROXIES.length > 0) {
    const proxy = getNextProxy();
    if (proxy) {
      log(`🔄 Usando proxy: ${proxy.split('@')[1] || proxy}`);
      args.push(`--proxy-server=${proxy}`);
    }
  }

  return await puppeteer.launch({
    headless: 'new',
    args
  });
}

// Tentar acessar página com retry e rotação de proxy
async function accessPageWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const browser = await createBrowser(attempt > 1); // Usar proxy após primeira tentativa

    try {
      const page = await browser.newPage();

      // Anti-detecção
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });

      log(`  Tentativa ${attempt}/${maxRetries}: ${url}`);

      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Verificar se tem Cloudflare
      const title = await page.title();
      if (title.includes('Just a moment')) {
        log(`    ⚠️ Cloudflare detectado, aguardando...`);
        stats.cloudflareBlocks++;

        // Aguardar bypass
        await new Promise(resolve => setTimeout(resolve, 10000));

        const newTitle = await page.title();
        if (newTitle.includes('Just a moment')) {
          throw new Error('Cloudflare não foi contornado');
        }
      }

      // Aguardar produtos
      await page.waitForSelector('.product', { timeout: 10000 }).catch(() => {});
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
      }, url.includes('iluminacao') ? 'Iluminação' :
         url.includes('moveis') ? 'Móveis' :
         'Acessórios de Decoração');

      await browser.close();
      return products;

    } catch (error) {
      await browser.close();

      if (attempt === maxRetries) {
        log(`    ❌ Falha após ${maxRetries} tentativas: ${error.message}`);
        stats.errors++;
        return [];
      }

      log(`    ⚠️ Erro na tentativa ${attempt}: ${error.message}`);

      // Aguardar antes de tentar novamente
      const waitTime = attempt * 5000;
      log(`    ⏳ Aguardando ${waitTime/1000}s antes de tentar novamente...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return [];
}

// Salvar produtos no Supabase
async function saveProducts(products, category) {
  let saved = 0;

  for (const product of products) {
    product.subcategory = inferSubcategory(product.name, category);

    try {
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('link', product.link)
        .single();

      if (existing) {
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
        const { error } = await supabase
          .from('products')
          .insert(product);

        if (!error) {
          saved++;
          stats.totalSaved++;
        }
      }
    } catch (err) {
      // Ignorar erros individuais
    }
  }

  return saved;
}

// Scraping principal
async function scrapeWithProxy() {
  log('🚀 SCRAPER COM PROXY E STEALTH');
  log('════════════════════════════════');

  if (PROXIES.length === 0) {
    log('⚠️ AVISO: Nenhum proxy configurado!');
    log('  Acesse https://proxy.webshare.io para obter proxies gratuitos');
    log('  Ou use outros serviços de proxy');
    log('');
  }

  const categories = [
    { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' },
    { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
    { name: 'Acessórios de Decoração', url: 'https://casoca.com.br/acessorios-de-decoracao.html' },
  ];

  for (const category of categories) {
    log(`\n📁 CATEGORIA: ${category.name}`);

    let pageNum = 1;
    let consecutiveEmpty = 0;
    let categoryProducts = 0;

    while (pageNum <= 500 && consecutiveEmpty < 5) {
      const url = pageNum === 1 ? category.url : `${category.url}?p=${pageNum}`;

      const products = await accessPageWithRetry(url);

      if (products.length === 0) {
        consecutiveEmpty++;
        log(`    ⚠️ Página vazia (${consecutiveEmpty} consecutivas)`);
      } else {
        consecutiveEmpty = 0;
        log(`    ✅ ${products.length} produtos encontrados`);

        const saved = await saveProducts(products, category.name);
        categoryProducts += products.length;
        stats.totalProducts += products.length;

        log(`    💾 ${saved} novos produtos salvos`);
      }

      stats.totalPages++;
      pageNum++;

      // Status a cada 10 páginas
      if (pageNum % 10 === 1) {
        log(`  📊 Progresso: ${pageNum-1} páginas, ${categoryProducts} produtos`);
      }

      // Aguardar entre páginas
      const waitTime = 3000 + Math.random() * 3000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    log(`✅ ${category.name} COMPLETO: ${categoryProducts} produtos`);
  }

  // Relatório final
  const runTime = Math.floor((new Date() - stats.startTime) / 1000 / 60);

  log('\n════════════════════════════════');
  log('📊 RESUMO FINAL:');
  log(`  ⏱️ Tempo: ${runTime} minutos`);
  log(`  📄 Páginas: ${stats.totalPages}`);
  log(`  📦 Produtos: ${stats.totalProducts}`);
  log(`  💾 Novos salvos: ${stats.totalSaved}`);
  log(`  ❌ Erros: ${stats.errors}`);
  log(`  🛡️ Bloqueios Cloudflare: ${stats.cloudflareBlocks}`);
  log('════════════════════════════════');

  if (PROXIES.length === 0) {
    log('\n💡 DICA: Configure proxies para melhor performance!');
    log('  1. Crie conta gratuita em https://proxy.webshare.io');
    log('  2. Copie os proxies no formato http://user:pass@host:port');
    log('  3. Adicione na variável PROXIES deste arquivo');
  }
}

// Executar
scrapeWithProxy();