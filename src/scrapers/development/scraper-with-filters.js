import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class CasocaFilterScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.bucketName = 'product-images';
    this.baseUrl = 'https://casoca.com.br';
    this.totalProductsSaved = 0;
    this.logs = [];

    // Estrutura de categorias e suas URLs
    this.categories = [
      { name: 'Móveis', url: 'moveis.html' },
      { name: 'Iluminação', url: 'iluminacao.html' },
      { name: 'Decoração', url: 'decoracao.html' }
      // Adicionar mais conforme necessário
    ];
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

  async getTypeFilters() {
    // Clicar no botão "Tipo" para abrir os filtros
    try {
      console.log('   🔍 Abrindo filtros de Tipo...');

      // Tentar clicar no botão Tipo
      const typeButton = await this.page.$('button:has-text("Tipo"), button.filter-tipo, [class*="tipo" i]');
      if (typeButton) {
        await typeButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Extrair links de filtros de tipo
      const filters = await this.page.evaluate(() => {
        const typeFilters = [];

        // Buscar links que são filtros de tipo
        const filterLinks = document.querySelectorAll('a');

        filterLinks.forEach(link => {
          const text = link.textContent.trim();
          const href = link.href;

          // Identificar links de tipo (geralmente contêm número de produtos)
          if (text && href && text.match(/\(\d+\)$/)) {
            // Extrair nome e quantidade
            const match = text.match(/^(.+?)\s*\((\d+)\)$/);
            if (match) {
              typeFilters.push({
                name: match[1].trim(),
                count: parseInt(match[2]),
                url: href
              });
            }
          }
        });

        // Filtrar apenas os que parecem ser tipos de móveis
        const validTypes = [
          'poltrona', 'cadeira', 'mesa', 'sofá', 'sofa',
          'banqueta', 'rack', 'estante', 'cama', 'armário',
          'escrivaninha', 'criado', 'prateleira', 'painel'
        ];

        return typeFilters.filter(filter => {
          const nameLower = filter.name.toLowerCase();
          return validTypes.some(type => nameLower.includes(type));
        });
      });

      console.log(`   ✅ Encontrados ${filters.length} filtros de tipo`);
      return filters;

    } catch (error) {
      console.error('   ❌ Erro ao obter filtros:', error.message);
      return [];
    }
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
        console.error('      ❌ Erro ao salvar:', saveError.message);
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
          // Ignorar erro de imagem
        }
      }

      this.totalProductsSaved++;
      return savedProduct;

    } catch (error) {
      console.error('      ❌ Erro ao processar:', error.message);
      return null;
    }
  }

  async scrapeCategoryWithFilters(category) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📁 CATEGORIA: ${category.name.toUpperCase()}`);
    console.log(`${'═'.repeat(60)}`);

    const categoryLog = {
      category: category.name,
      subcategories: [],
      totalProducts: 0,
      startTime: new Date()
    };

    try {
      // Navegar para categoria
      const url = `${this.baseUrl}/${category.url}`;
      console.log(`📍 URL: ${url}\n`);

      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 5000));

      // Obter filtros de tipo (subcategorias)
      const typeFilters = await this.getTypeFilters();

      if (typeFilters.length === 0) {
        console.log('   ⚠️ Nenhum filtro de tipo encontrado');

        // Se não houver filtros, extrair todos os produtos
        console.log('   📦 Extraindo todos os produtos...');
        const products = await this.extractProductsFromPage();

        if (products.length > 0) {
          console.log(`   Encontrados: ${products.length} produtos\n`);

          // Salvar alguns produtos como teste
          for (const product of products.slice(0, 5)) {
            const productToSave = {
              ...product,
              category: category.name,
              subcategory: 'Geral'
            };

            console.log(`   💾 Salvando: ${product.name}`);
            const saved = await this.saveProductToSupabase(productToSave);
            if (saved) {
              console.log(`      ✅ ID: ${saved.id}`);
              categoryLog.totalProducts++;
            }
          }
        }
      } else {
        // Processar cada filtro de tipo
        console.log(`\n📂 Processando ${typeFilters.length} subcategorias:\n`);

        for (const filter of typeFilters.slice(0, 3)) { // Limitar a 3 para teste
          console.log(`\n   🔍 Subcategoria: ${filter.name} (${filter.count} produtos)`);

          // Navegar para o filtro
          await this.page.goto(filter.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });

          await new Promise(resolve => setTimeout(resolve, 3000));

          // Extrair produtos
          const products = await this.extractProductsFromPage();
          console.log(`      Encontrados: ${products.length} produtos`);

          // Salvar alguns produtos
          const productsToSave = products.slice(0, 3); // Limitar a 3 por subcategoria
          for (const product of productsToSave) {
            const productToSave = {
              ...product,
              category: category.name,
              subcategory: filter.name
            };

            console.log(`      💾 Salvando: ${product.name}`);
            const saved = await this.saveProductToSupabase(productToSave);
            if (saved) {
              console.log(`         ✅ ID: ${saved.id}`);
              categoryLog.totalProducts++;
            }
          }

          categoryLog.subcategories.push({
            name: filter.name,
            productsExtracted: products.length,
            productsSaved: productsToSave.length
          });

          // Voltar para a categoria principal para próximo filtro
          await this.page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      categoryLog.endTime = new Date();
      categoryLog.duration = (categoryLog.endTime - categoryLog.startTime) / 1000;

      console.log(`\n✅ Categoria ${category.name} finalizada`);
      console.log(`   Total de produtos salvos: ${categoryLog.totalProducts}`);
      console.log(`   Tempo: ${categoryLog.duration.toFixed(2)}s`);

      this.logs.push(categoryLog);

    } catch (error) {
      console.error(`❌ Erro na categoria ${category.name}:`, error.message);
      categoryLog.error = error.message;
      this.logs.push(categoryLog);
    }
  }

  async scrapeAll() {
    console.log('🚀 INICIANDO SCRAPING COM FILTROS DE TIPO\n');
    console.log(`Categorias a processar: ${this.categories.length}\n`);

    const startTime = new Date();

    for (const category of this.categories) {
      await this.scrapeCategoryWithFilters(category);

      // Pausa entre categorias
      if (this.categories.indexOf(category) < this.categories.length - 1) {
        console.log('\n⏸️ Aguardando 5 segundos...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const endTime = new Date();
    const duration = (endTime - startTime) / 1000 / 60;

    // Relatório final
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RELATÓRIO FINAL');
    console.log(`${'═'.repeat(60)}`);

    let totalSubcategories = 0;
    this.logs.forEach(log => {
      console.log(`\n📁 ${log.category}`);
      console.log(`   Produtos salvos: ${log.totalProducts}`);
      console.log(`   Subcategorias processadas: ${log.subcategories.length}`);
      log.subcategories.forEach(sub => {
        console.log(`     - ${sub.name}: ${sub.productsSaved} salvos`);
      });
      totalSubcategories += log.subcategories.length;
    });

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TOTAIS:`);
    console.log(`   Categorias: ${this.categories.length}`);
    console.log(`   Subcategorias: ${totalSubcategories}`);
    console.log(`   Produtos salvos: ${this.totalProductsSaved}`);
    console.log(`   Tempo total: ${duration.toFixed(2)} minutos`);
    console.log(`${'═'.repeat(60)}`);

    // Salvar logs
    await this.saveLogsToFile();
  }

  async saveLogsToFile() {
    const logFileName = `logs_filters_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
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
  const scraper = new CasocaFilterScraper();

  try {
    await scraper.initialize();
    console.log('✅ Navegador iniciado\n');

    // Testar com apenas uma categoria primeiro
    scraper.categories = [
      { name: 'Móveis', url: 'moveis.html' }
    ];

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

export { CasocaFilterScraper };