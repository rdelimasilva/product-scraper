import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar Puppeteer com Stealth
puppeteer.use(StealthPlugin());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ============================================
// CONFIGURAÇÕES
// ============================================
const CONFIG = {
  // Paralelização
  MAX_PARALLEL_CATEGORIES: 2,  // Quantas categorias rodar em paralelo
  MAX_PARALLEL_PAGES: 1,       // Páginas por categoria em paralelo

  // Browser
  HEADLESS: 'new',
  MAX_PAGES_PER_CATEGORY: 500,

  // Delays
  WAIT_BETWEEN_PAGES: 2000,
  CLOUDFLARE_WAIT: 10000,

  // Checkpoint
  CHECKPOINT_FILE: 'scraper-checkpoint.json',
  SAVE_CHECKPOINT_EVERY: 10, // Salvar progresso a cada N páginas

  // Verificação inteligente
  MIN_PRODUCTS_TO_SKIP: 100,  // Se categoria tem mais que isso, considerar completa
  CHECK_EXISTING_PRODUCTS: true,

  // Logs
  LOG_FILE: 'scraper-advanced.log'
};

// ============================================
// SISTEMA DE CHECKPOINT
// ============================================
class CheckpointManager {
  constructor() {
    this.checkpointPath = path.join(__dirname, CONFIG.CHECKPOINT_FILE);
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.checkpointPath)) {
        const data = JSON.parse(fs.readFileSync(this.checkpointPath, 'utf8'));
        log('📁 Checkpoint carregado');
        return data;
      }
    } catch (error) {
      log('⚠️ Erro ao carregar checkpoint, iniciando novo');
    }
    return {
      categories: {},
      startedAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
  }

  save() {
    try {
      this.data.lastUpdate = new Date().toISOString();
      fs.writeFileSync(this.checkpointPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      log('❌ Erro ao salvar checkpoint');
    }
  }

  getCategoryProgress(categoryName) {
    return this.data.categories[categoryName] || {
      lastPage: 0,
      totalProducts: 0,
      completed: false,
      lastRun: null
    };
  }

  updateCategoryProgress(categoryName, progress) {
    this.data.categories[categoryName] = {
      ...this.getCategoryProgress(categoryName),
      ...progress,
      lastRun: new Date().toISOString()
    };
    this.save();
  }

  markCategoryComplete(categoryName, totalProducts) {
    this.updateCategoryProgress(categoryName, {
      completed: true,
      totalProducts
    });
  }

  shouldSkipCategory(categoryName) {
    const progress = this.getCategoryProgress(categoryName);
    return progress.completed;
  }

  reset() {
    this.data = {
      categories: {},
      startedAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
    this.save();
    log('🔄 Checkpoint resetado');
  }
}

// ============================================
// VERIFICAÇÃO INTELIGENTE
// ============================================
class CategoryChecker {
  async checkCategoryStatus(categoryName) {
    try {
      // Contar produtos existentes da categoria
      const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('category', categoryName);

      if (error) throw error;

      log(`📊 ${categoryName}: ${count || 0} produtos no banco`);

      return {
        existingCount: count || 0,
        shouldSkip: count >= CONFIG.MIN_PRODUCTS_TO_SKIP,
        isEmpty: count === 0
      };
    } catch (error) {
      log(`❌ Erro ao verificar categoria: ${error.message}`);
      return { existingCount: 0, shouldSkip: false, isEmpty: true };
    }
  }

  async getRecentProducts(categoryName, limit = 10) {
    try {
      const { data } = await supabase
        .from('products')
        .select('link')
        .eq('category', categoryName)
        .order('created_at', { ascending: false })
        .limit(limit);

      return new Set(data?.map(p => p.link) || []);
    } catch (error) {
      return new Set();
    }
  }
}

// ============================================
// LOGGING
// ============================================
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
  fs.appendFileSync(CONFIG.LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

// ============================================
// INFERIR SUBCATEGORIA
// ============================================
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
  } else if (category === 'Móveis') {
    if (nameLower.includes('cadeira')) return 'Cadeiras';
    if (nameLower.includes('poltrona')) return 'Poltronas';
    if (nameLower.includes('sofá') || nameLower.includes('sofa')) return 'Sofás';
    if (nameLower.includes('mesa')) return 'Mesas';
    if (nameLower.includes('banco')) return 'Bancos';
  }

  return 'Outros';
}

// ============================================
// CRIAR BROWSER
// ============================================
async function createBrowser() {
  return await puppeteer.launch({
    headless: CONFIG.HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security'
    ]
  });
}

// ============================================
// BYPASS CLOUDFLARE
// ============================================
async function bypassCloudflare(page, url) {
  try {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const title = await page.title();

    if (title.includes('Just a moment')) {
      log('⏳ Cloudflare detectado, aguardando bypass...');
      await new Promise(resolve => setTimeout(resolve, CONFIG.CLOUDFLARE_WAIT));

      const newTitle = await page.title();
      if (!newTitle.includes('Just a moment')) {
        log('✅ Cloudflare contornado');
        return true;
      }
    }

    return true;
  } catch (error) {
    log(`❌ Erro no bypass: ${error.message}`);
    return false;
  }
}

// ============================================
// EXTRAIR PRODUTOS DA PÁGINA
// ============================================
async function extractProducts(page, categoryName) {
  try {
    await page.waitForSelector('.product', { timeout: 5000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 2000));

    const products = await page.evaluate((category) => {
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
            category
          });
        }
      });

      return items;
    }, categoryName);

    return products;
  } catch (error) {
    log(`❌ Erro na extração: ${error.message}`);
    return [];
  }
}

// ============================================
// SALVAR PRODUTOS
// ============================================
async function saveProducts(products, categoryName) {
  let saved = 0;
  let errors = 0;

  for (const product of products) {
    product.subcategory = inferSubcategory(product.name, categoryName);

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

        if (!error) saved++;
        else errors++;
      }
    } catch (err) {
      errors++;
    }
  }

  return { saved, errors };
}

// ============================================
// SCRAPE DE UMA CATEGORIA (com checkpoint)
// ============================================
async function scrapeCategory(category, checkpoint, checker) {
  const startTime = new Date();
  const progress = checkpoint.getCategoryProgress(category.name);

  // Verificar se deve pular
  if (progress.completed) {
    log(`⏭️ ${category.name} já foi completada (${progress.totalProducts} produtos)`);
    return {
      category: category.name,
      totalProducts: progress.totalProducts,
      totalSaved: 0,
      skipped: true
    };
  }

  // Verificação inteligente
  if (CONFIG.CHECK_EXISTING_PRODUCTS) {
    const status = await checker.checkCategoryStatus(category.name);
    if (status.shouldSkip) {
      log(`⏭️ ${category.name} tem ${status.existingCount} produtos - pulando`);
      checkpoint.markCategoryComplete(category.name, status.existingCount);
      return {
        category: category.name,
        totalProducts: status.existingCount,
        totalSaved: 0,
        skipped: true
      };
    }
  }

  log(`\n📁 INICIANDO: ${category.name}`);
  log(`  ↩️ Continuando da página ${progress.lastPage + 1}`);

  let browser;
  let totalProducts = progress.totalProducts || 0;
  let totalSaved = 0;
  let consecutiveEmpty = 0;
  let currentPage = progress.lastPage || 0;

  try {
    browser = await createBrowser();
    const page = await browser.newPage();

    // Configurações anti-detecção
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Primeira página - bypass Cloudflare
    if (currentPage === 0) {
      await bypassCloudflare(page, category.url);
      currentPage = 1;
    }

    // Loop de páginas
    while (currentPage <= CONFIG.MAX_PAGES_PER_CATEGORY && consecutiveEmpty < 5) {
      const url = currentPage === 1 ? category.url : `${category.url}?p=${currentPage}`;

      log(`  📄 Página ${currentPage}`);

      if (currentPage > 1) {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      const products = await extractProducts(page, category.name);

      if (products.length === 0) {
        consecutiveEmpty++;
        log(`    ⚠️ Página vazia (${consecutiveEmpty} consecutivas)`);
      } else {
        consecutiveEmpty = 0;
        log(`    ✅ ${products.length} produtos encontrados`);

        const { saved, errors } = await saveProducts(products, category.name);
        totalProducts += products.length;
        totalSaved += saved;

        log(`    💾 Salvos: ${saved}, Erros: ${errors}`);
      }

      // Salvar checkpoint
      if (currentPage % CONFIG.SAVE_CHECKPOINT_EVERY === 0) {
        checkpoint.updateCategoryProgress(category.name, {
          lastPage: currentPage,
          totalProducts
        });
        log(`    📁 Checkpoint salvo`);
      }

      currentPage++;

      // Aguardar entre páginas
      await new Promise(resolve => setTimeout(resolve, CONFIG.WAIT_BETWEEN_PAGES + Math.random() * 1000));
    }

    // Marcar categoria como completa
    checkpoint.markCategoryComplete(category.name, totalProducts);

  } catch (error) {
    log(`❌ Erro na categoria ${category.name}: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }

  const elapsed = Math.floor((new Date() - startTime) / 1000 / 60);
  log(`✅ ${category.name} COMPLETO em ${elapsed} minutos: ${totalProducts} produtos (${totalSaved} novos)`);

  return {
    category: category.name,
    totalProducts,
    totalSaved,
    skipped: false
  };
}

// ============================================
// MAIN - COM PARALELIZAÇÃO
// ============================================
async function main() {
  log('🚀 SCRAPER AVANÇADO - v2.0');
  log('════════════════════════════════');
  log('Recursos:');
  log(`  ✅ Checkpoint/Resume`);
  log(`  ✅ Verificação inteligente`);
  log(`  ✅ Paralelização: ${CONFIG.MAX_PARALLEL_CATEGORIES} categorias simultâneas`);
  log('');

  const checkpoint = new CheckpointManager();
  const checker = new CategoryChecker();

  // Categorias para processar
  const categories = [
    { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' },
    { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
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

  // Filtrar categorias não completadas
  const pendingCategories = categories.filter(cat => !checkpoint.shouldSkipCategory(cat.name));

  if (pendingCategories.length === 0) {
    log('✅ Todas as categorias já foram processadas!');
    log('💡 Use --reset para recomeçar do zero');
    return;
  }

  log(`📋 ${pendingCategories.length} categorias pendentes`);
  log('');

  const startTime = new Date();

  // Criar limite de concorrência
  const limit = pLimit(CONFIG.MAX_PARALLEL_CATEGORIES);

  // Processar categorias em paralelo
  const results = await Promise.all(
    pendingCategories.map(category =>
      limit(() => scrapeCategory(category, checkpoint, checker))
    )
  );

  // Resumo final
  const elapsed = Math.floor((new Date() - startTime) / 1000 / 60);
  const totalProducts = results.reduce((sum, r) => sum + r.totalProducts, 0);
  const totalSaved = results.reduce((sum, r) => sum + r.totalSaved, 0);
  const skippedCount = results.filter(r => r.skipped).length;

  log('\n════════════════════════════════');
  log('📊 RESUMO FINAL:');
  log(`  ⏱️ Tempo total: ${elapsed} minutos`);
  log(`  📁 Categorias processadas: ${results.length}`);
  log(`  ⏭️ Categorias puladas: ${skippedCount}`);
  log(`  📦 Total produtos: ${totalProducts}`);
  log(`  💾 Novos produtos: ${totalSaved}`);
  log('════════════════════════════════');
  log('✅ Scraping completo!');
}

// ============================================
// COMANDOS CLI
// ============================================
const args = process.argv.slice(2);

if (args.includes('--reset')) {
  const checkpoint = new CheckpointManager();
  checkpoint.reset();
  log('✅ Checkpoint resetado. Execute novamente para começar do zero.');
} else if (args.includes('--status')) {
  const checkpoint = new CheckpointManager();
  log('📊 STATUS DO CHECKPOINT:');
  log(JSON.stringify(checkpoint.data, null, 2));
} else {
  // Executar scraper
  main().catch(error => {
    log(`❌ Erro fatal: ${error.message}`);
    process.exit(1);
  });
}