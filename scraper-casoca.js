import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class CasocaScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.bucketName = 'product-images';
    this.baseUrl = 'https://casoca.com.br';
    this.categories = [
      'moveis',
      'iluminacao',
      'decoracao',
      'revestimentos',
      'loucas-e-metais',
      'eletros',
      'tapetes',
      'portas-e-janelas',
      'escritorio',
      'infantil',
      'area-externa',
      'cortinas-e-persianas',
      'cama-mesa-e-banho',
      'vegetacao',
      'papeis-de-parede'
    ];
    this.logs = [];
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();

    // Configurar timeout maior para páginas lentas
    this.page.setDefaultTimeout(60000);

    // Bloquear recursos desnecessários para acelerar
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'font' || resourceType === 'stylesheet') {
        req.abort();
      } else {
        req.continue();
      }
    });
  }

  async navigateToCategory(categorySlug) {
    const categoryUrl = `${this.baseUrl}/${categorySlug}`;
    console.log(`\n📂 Acessando categoria: ${categorySlug}`);
    console.log(`   URL: ${categoryUrl}`);

    try {
      await this.page.goto(categoryUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Aguardar produtos carregarem
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    } catch (error) {
      console.error(`❌ Erro ao acessar categoria ${categorySlug}:`, error.message);
      return false;
    }
  }

  async extractProductsFromPage() {
    try {
      // Aguardar produtos carregarem
      await this.page.waitForSelector('.product-item, .produto, .item, .card-product', {
        timeout: 10000
      }).catch(() => null);

      const products = await this.page.evaluate(() => {
        // Tentar diferentes seletores comuns
        let items = document.querySelectorAll('.product-item');
        if (items.length === 0) items = document.querySelectorAll('.produto');
        if (items.length === 0) items = document.querySelectorAll('.item');
        if (items.length === 0) items = document.querySelectorAll('.card-product');
        if (items.length === 0) items = document.querySelectorAll('[class*="product"]');

        return Array.from(items).map(item => {
          // Buscar nome do produto
          let name = null;
          const nameSelectors = ['h3', 'h4', '.title', '.name', '[class*="title"]', '[class*="name"]'];
          for (const selector of nameSelectors) {
            const el = item.querySelector(selector);
            if (el && el.textContent.trim()) {
              name = el.textContent.trim();
              break;
            }
          }

          // Buscar imagem
          let imageUrl = null;
          const img = item.querySelector('img');
          if (img) {
            imageUrl = img.src || img.dataset.src || img.dataset.lazySrc;
          }

          // Buscar link
          let link = null;
          const linkEl = item.querySelector('a[href]');
          if (linkEl) {
            link = linkEl.href;
          }

          return {
            name: name,
            image_url: imageUrl,
            link: link
          };
        }).filter(p => p.name && p.image_url && p.link);
      });

      return products;
    } catch (error) {
      console.error('Erro ao extrair produtos:', error.message);
      return [];
    }
  }

  async getNextPageButton() {
    try {
      // Tentar diferentes seletores de paginação
      const nextButtonSelectors = [
        'a[aria-label="Next"]',
        '.pagination .next',
        '.paginate .next',
        'button:has-text("Próxima")',
        'a:has-text("Próxima")',
        '.pagination a[rel="next"]',
        '[class*="pagination"] a[href*="page"]'
      ];

      for (const selector of nextButtonSelectors) {
        const button = await this.page.$(selector);
        if (button) {
          const isDisabled = await button.evaluate(el =>
            el.classList.contains('disabled') ||
            el.hasAttribute('disabled') ||
            el.getAttribute('aria-disabled') === 'true'
          );
          if (!isDisabled) {
            return button;
          }
        }
      }

      // Verificar se há links de paginação numerados
      const currentPage = await this.page.evaluate(() => {
        const active = document.querySelector('.pagination .active, .paginate .current');
        return active ? parseInt(active.textContent) : 1;
      });

      const nextPageLink = await this.page.$(`a[href*="page=${currentPage + 1}"]`);
      return nextPageLink;
    } catch (error) {
      return null;
    }
  }

  async downloadImage(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      console.error('Erro ao baixar imagem:', error.message);
      return null;
    }
  }

  async saveProductToSupabase(product, category) {
    try {
      // Primeiro salvar o produto sem a imagem para obter o ID
      const productData = {
        name: product.name,
        category: category,
        image_url: product.image_url,
        link: product.link
      };

      const { data: savedProduct, error: saveError } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single();

      if (saveError) {
        console.error('Erro ao salvar produto:', saveError);
        return null;
      }

      // Agora fazer download e upload da imagem usando o ID
      if (product.image_url && savedProduct.id) {
        const imageBuffer = await this.downloadImage(product.image_url);

        if (imageBuffer) {
          // Usar o ID como nome do arquivo
          const fileName = `${savedProduct.id}.jpg`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from(this.bucketName)
            .upload(fileName, imageBuffer, {
              contentType: 'image/jpeg',
              cacheControl: '3600',
              upsert: true // Permitir sobrescrever se já existir
            });

          if (!uploadError) {
            // Atualizar o produto com o caminho da imagem
            const { error: updateError } = await supabase
              .from('products')
              .update({ image_path: fileName })
              .eq('id', savedProduct.id);

            if (updateError) {
              console.error('Erro ao atualizar caminho da imagem:', updateError);
            }
          } else {
            console.error('Erro ao fazer upload da imagem:', uploadError);
          }
        }
      }

      return savedProduct;
    } catch (error) {
      console.error('Erro ao processar produto:', error);
      return null;
    }
  }

  async scrapeCategoryProducts(category) {
    const categoryLog = {
      category: category,
      totalProducts: 0,
      totalPages: 0,
      startTime: new Date(),
      errors: []
    };

    console.log(`\n${'='.repeat(50)}`);
    console.log(`🛍️ INICIANDO CATEGORIA: ${category.toUpperCase()}`);
    console.log(`${'='.repeat(50)}`);

    // Navegar para a categoria
    const navigationSuccess = await this.navigateToCategory(category);
    if (!navigationSuccess) {
      categoryLog.errors.push('Falha ao navegar para categoria');
      this.logs.push(categoryLog);
      return;
    }

    let currentPage = 1;
    let hasNextPage = true;
    const allProducts = [];

    while (hasNextPage) {
      console.log(`\n📄 Extraindo página ${currentPage}...`);

      // Extrair produtos da página atual
      const products = await this.extractProductsFromPage();
      console.log(`   Encontrados: ${products.length} produtos`);

      if (products.length > 0) {
        allProducts.push(...products);

        // Salvar produtos no Supabase
        console.log(`   Salvando produtos no Supabase...`);
        for (const product of products) {
          const saved = await this.saveProductToSupabase(product, category);
          if (saved) {
            categoryLog.totalProducts++;
          }
        }
      }

      // Verificar se há próxima página
      const nextButton = await this.getNextPageButton();

      if (nextButton && currentPage < 50) { // Limite de segurança de 50 páginas
        console.log(`   ➡️ Indo para próxima página...`);
        try {
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            nextButton.click()
          ]);
          await new Promise(resolve => setTimeout(resolve, 3000)); // Aguardar carregamento
          currentPage++;
          categoryLog.totalPages = currentPage;
        } catch (error) {
          console.log(`   ⚠️ Não há mais páginas ou erro na navegação`);
          hasNextPage = false;
        }
      } else {
        hasNextPage = false;
      }
    }

    categoryLog.endTime = new Date();
    categoryLog.duration = (categoryLog.endTime - categoryLog.startTime) / 1000;

    // Log final da categoria
    console.log(`\n✅ CATEGORIA FINALIZADA: ${category}`);
    console.log(`   - Produtos salvos: ${categoryLog.totalProducts}`);
    console.log(`   - Páginas navegadas: ${categoryLog.totalPages}`);
    console.log(`   - Tempo: ${categoryLog.duration.toFixed(2)}s`);
    console.log(`${'='.repeat(50)}`);

    this.logs.push(categoryLog);
  }

  async scrapeAllCategories() {
    console.log(`\n🚀 INICIANDO SCRAPING COMPLETO`);
    console.log(`   Categorias a processar: ${this.categories.length}`);

    const startTime = new Date();

    for (const category of this.categories) {
      await this.scrapeCategoryProducts(category);

      // Pequena pausa entre categorias para não sobrecarregar
      if (this.categories.indexOf(category) < this.categories.length - 1) {
        console.log(`\n⏸️ Aguardando 5 segundos antes da próxima categoria...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const endTime = new Date();
    const totalDuration = (endTime - startTime) / 1000 / 60;

    // Relatório final
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`📊 RELATÓRIO FINAL`);
    console.log(`${'#'.repeat(60)}`);

    let totalProducts = 0;
    let totalPages = 0;

    for (const log of this.logs) {
      console.log(`\n📁 ${log.category.toUpperCase()}`);
      console.log(`   Produtos: ${log.totalProducts}`);
      console.log(`   Páginas: ${log.totalPages}`);
      console.log(`   Tempo: ${log.duration ? log.duration.toFixed(2) : 'N/A'}s`);
      if (log.errors.length > 0) {
        console.log(`   ⚠️ Erros: ${log.errors.join(', ')}`);
      }

      totalProducts += log.totalProducts;
      totalPages += log.totalPages;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`TOTAIS:`);
    console.log(`   Total de produtos: ${totalProducts}`);
    console.log(`   Total de páginas: ${totalPages}`);
    console.log(`   Tempo total: ${totalDuration.toFixed(2)} minutos`);
    console.log(`${'#'.repeat(60)}`);

    // Salvar logs em arquivo
    await this.saveLogsToFile();
  }

  async saveLogsToFile() {
    const logFileName = `logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    try {
      await fs.writeFile(logFileName, JSON.stringify(this.logs, null, 2));
      console.log(`\n💾 Logs salvos em: ${logFileName}`);
    } catch (error) {
      console.error('Erro ao salvar logs:', error);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function main() {
  const scraper = new CasocaScraper();

  try {
    await scraper.initialize();
    console.log('🌐 Navegador iniciado...');

    // Executar scraping de todas as categorias
    await scraper.scrapeAllCategories();

  } catch (error) {
    console.error('❌ Erro na execução:', error);
  } finally {
    await scraper.close();
    console.log('\n👋 Scraper finalizado!');
  }
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { CasocaScraper };