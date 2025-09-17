import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class CasocaHierarchicalScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.bucketName = 'product-images';
    this.baseUrl = 'https://casoca.com.br';
    this.totalProductsSaved = 0;

    // Estrutura hierárquica do site baseada em análise manual
    this.categoryStructure = {
      'Móveis': {
        url: 'moveis.html',
        subcategories: {
          'Poltronas': ['poltrona'],
          'Cadeiras': ['cadeira'],
          'Mesas': ['mesa'],
          'Sofás': ['sofá', 'sofa'],
          'Banquetas': ['banqueta'],
          'Racks': ['rack'],
          'Estantes': ['estante'],
          'Camas': ['cama'],
          'Armários': ['armário', 'armario', 'guarda-roupa']
        }
      },
      'Iluminação': {
        url: 'iluminacao.html',
        subcategories: {
          'Luminárias': ['luminária', 'luminaria'],
          'Pendentes': ['pendente'],
          'Arandelas': ['arandela'],
          'Plafons': ['plafon'],
          'Abajures': ['abajur']
        }
      },
      'Decoração': {
        url: 'decoracao.html',
        subcategories: {
          'Vasos': ['vaso'],
          'Quadros': ['quadro'],
          'Espelhos': ['espelho'],
          'Esculturas': ['escultura'],
          'Objetos': ['objeto', 'adorno']
        }
      }
    };
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(30000);

    // Bloquear recursos desnecessários
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

  determineSubcategory(productName, subcategories) {
    const nameLower = productName.toLowerCase();

    for (const [subcategoryName, keywords] of Object.entries(subcategories)) {
      for (const keyword of keywords) {
        if (nameLower.includes(keyword)) {
          return subcategoryName;
        }
      }
    }

    return 'Geral';
  }

  async extractProductsFromPage() {
    return await this.page.evaluate(() => {
      const products = [];

      // Seletores específicos do site
      const productSelectors = [
        '.col-md-4.col-sm-6.detail-product',
        '.product-container',
        '.detail-product'
      ];

      let productElements = [];
      for (const selector of productSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          productElements = elements;
          break;
        }
      }

      productElements.forEach(element => {
        // Nome
        let name = '';
        const nameSelectors = ['h3', 'h4', '.product-name', 'a'];
        for (const selector of nameSelectors) {
          const nameEl = element.querySelector(selector);
          if (nameEl && nameEl.textContent.trim()) {
            name = nameEl.textContent.trim();
            break;
          }
        }

        // Imagem
        let imageUrl = '';
        const img = element.querySelector('img');
        if (img) {
          imageUrl = img.src || img.dataset.src || '';
        }

        // Link
        let productLink = '';
        const link = element.querySelector('a[href]');
        if (link) {
          productLink = link.href;
        }

        if (name && imageUrl && productLink) {
          products.push({
            name: name,
            image_url: imageUrl,
            link: productLink
          });
        }
      });

      return products;
    });
  }

  async saveProductToSupabase(product) {
    try {
      // Salvar produto
      const productData = {
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
        image_url: product.image_url,
        link: product.link
      };

      const { data: savedProduct, error: saveError } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single();

      if (saveError) {
        console.error('   ❌ Erro ao salvar:', saveError.message);
        return null;
      }

      // Upload da imagem
      if (product.image_url && savedProduct.id) {
        try {
          const response = await fetch(product.image_url);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(buffer);
            const fileName = `${savedProduct.id}.jpg`;

            const { error: uploadError } = await supabase.storage
              .from(this.bucketName)
              .upload(fileName, imageBuffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true
              });

            if (!uploadError) {
              await supabase
                .from('products')
                .update({ image_path: fileName })
                .eq('id', savedProduct.id);
            }
          }
        } catch (imgError) {
          console.error('   ⚠️ Erro com imagem:', imgError.message);
        }
      }

      this.totalProductsSaved++;
      return savedProduct;

    } catch (error) {
      console.error('   ❌ Erro ao processar:', error.message);
      return null;
    }
  }

  async scrapeCategoryWithSubcategories(categoryName, categoryData) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📁 CATEGORIA: ${categoryName.toUpperCase()}`);
    console.log(`${'═'.repeat(60)}`);

    const url = `${this.baseUrl}/${categoryData.url}`;
    console.log(`📍 URL: ${url}\n`);

    try {
      // Navegar para categoria
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 5000));

      // Extrair produtos
      const products = await this.extractProductsFromPage();
      console.log(`📦 ${products.length} produtos encontrados\n`);

      if (products.length > 0) {
        console.log('🔍 Classificando e salvando produtos:\n');

        // Classificar produtos por subcategoria
        const productsBySubcategory = {};

        products.forEach(product => {
          const subcategory = this.determineSubcategory(
            product.name,
            categoryData.subcategories
          );

          if (!productsBySubcategory[subcategory]) {
            productsBySubcategory[subcategory] = [];
          }

          productsBySubcategory[subcategory].push({
            ...product,
            category: categoryName,
            subcategory: subcategory
          });
        });

        // Exibir e salvar por subcategoria
        for (const [subcategory, subProducts] of Object.entries(productsBySubcategory)) {
          console.log(`\n📂 Subcategoria: ${subcategory}`);
          console.log(`   ${subProducts.length} produtos\n`);

          for (const product of subProducts.slice(0, 5)) { // Limitar a 5 por subcategoria para teste
            console.log(`   💾 Salvando: ${product.name}`);
            const saved = await this.saveProductToSupabase(product);
            if (saved) {
              console.log(`      ✅ ID: ${saved.id}`);
            }
          }
        }
      }

      return products.length;

    } catch (error) {
      console.error(`❌ Erro na categoria ${categoryName}:`, error.message);
      return 0;
    }
  }

  async scrapeAll() {
    console.log('🚀 INICIANDO SCRAPING COM SUBCATEGORIAS\n');
    console.log(`Categorias a processar: ${Object.keys(this.categoryStructure).length}\n`);

    const startTime = new Date();
    let totalProducts = 0;

    for (const [categoryName, categoryData] of Object.entries(this.categoryStructure)) {
      const productsInCategory = await this.scrapeCategoryWithSubcategories(
        categoryName,
        categoryData
      );

      totalProducts += productsInCategory;

      // Pausa entre categorias
      if (Object.keys(this.categoryStructure).indexOf(categoryName) <
          Object.keys(this.categoryStructure).length - 1) {
        console.log('\n⏸️ Aguardando 5 segundos...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000 / 60;

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RELATÓRIO FINAL');
    console.log(`${'═'.repeat(60)}`);
    console.log(`Total de produtos processados: ${totalProducts}`);
    console.log(`Total de produtos salvos: ${this.totalProductsSaved}`);
    console.log(`Tempo total: ${duration.toFixed(2)} minutos`);
    console.log(`${'═'.repeat(60)}`);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function main() {
  const scraper = new CasocaHierarchicalScraper();

  try {
    await scraper.initialize();
    console.log('✅ Navegador iniciado\n');

    await scraper.scrapeAll();

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await scraper.close();
    console.log('\n👋 Scraper finalizado!');
  }
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { CasocaHierarchicalScraper };