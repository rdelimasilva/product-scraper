import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class RealFilterScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.bucketName = 'product-images';
    this.baseUrl = 'https://casoca.com.br';
    this.totalProductsSaved = 0;
    this.logs = [];
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
      const productElements = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');

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

  async navigateToTypeFilters() {
    try {
      console.log('   🔍 Procurando filtros de tipo na página...');

      // Primeiro, procurar o menu "Móveis por:" ou similar
      const menuFound = await this.page.evaluate(() => {
        // Procurar texto "Móveis por:" ou "Filtrar por:"
        const texts = ['Móveis por:', 'Filtrar por:', 'Ordenar por:'];

        for (const searchText of texts) {
          const elements = Array.from(document.querySelectorAll('*'));
          for (const el of elements) {
            if (el.textContent && el.textContent.includes(searchText)) {
              // Procurar links próximos
              const parent = el.parentElement;
              if (parent) {
                const links = parent.querySelectorAll('a, button');
                if (links.length > 0) {
                  console.log(`Encontrado menu: ${searchText}`);
                  return true;
                }
              }
            }
          }
        }
        return false;
      });

      if (!menuFound) {
        console.log('   ⚠️ Menu de filtros não encontrado');
        return [];
      }

      // Procurar e clicar em "Tipo"
      const tipoClicked = await this.page.evaluate(() => {
        const links = document.querySelectorAll('a, button');
        for (const link of links) {
          const text = link.textContent.trim().toLowerCase();
          if (text === 'tipo' || text.includes('tipo')) {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (tipoClicked) {
        console.log('   ✅ Clicou em "Tipo"');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Extrair os filtros que apareceram
        const filters = await this.page.evaluate(() => {
          const typeFilters = [];

          // Buscar links com formato "Nome (quantidade)"
          const links = document.querySelectorAll('a');

          links.forEach(link => {
            const text = link.textContent.trim();
            const href = link.href;

            // Padrão: "Nome (123)"
            const match = text.match(/^(.+?)\s*\((\d+)\)$/);
            if (match && href && href.includes('casoca.com.br')) {
              typeFilters.push({
                name: match[1].trim(),
                count: parseInt(match[2]),
                url: href
              });
            }
          });

          // Filtrar apenas tipos válidos de móveis
          const validTypes = [
            'poltrona', 'cadeira', 'mesa', 'sofá', 'sofa',
            'banqueta', 'banco', 'rack', 'estante', 'cama',
            'armário', 'armario', 'escrivaninha', 'criado',
            'aparador', 'buffet', 'cristaleira'
          ];

          return typeFilters.filter(filter => {
            const nameLower = filter.name.toLowerCase();
            return validTypes.some(type => nameLower.includes(type));
          });
        });

        return filters;
      }

      return [];

    } catch (error) {
      console.error('   ❌ Erro ao navegar nos filtros:', error.message);
      return [];
    }
  }

  async saveProductToSupabase(product) {
    try {
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

  async scrapeMoveisCategory() {
    console.log('\n════════════════════════════════════════════════');
    console.log('📁 CATEGORIA: MÓVEIS');
    console.log('════════════════════════════════════════════════\n');

    const categoryUrl = 'https://casoca.com.br/moveis.html';

    try {
      // Navegar para categoria
      console.log(`📍 Acessando: ${categoryUrl}`);
      await this.page.goto(categoryUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('✅ Página carregada\n');

      // Obter filtros de tipo
      const typeFilters = await this.navigateToTypeFilters();

      if (typeFilters.length === 0) {
        console.log('⚠️ Nenhum filtro de tipo encontrado');
        console.log('📦 Extraindo produtos sem filtro...\n');

        const products = await this.extractProductsFromPage();
        console.log(`Encontrados: ${products.length} produtos\n`);

        // Salvar alguns produtos de teste
        for (const product of products.slice(0, 3)) {
          const productToSave = {
            ...product,
            category: 'Móveis',
            subcategory: 'Geral'
          };

          console.log(`💾 Salvando: ${product.name}`);
          const saved = await this.saveProductToSupabase(productToSave);
          if (saved) {
            console.log(`   ✅ ID: ${saved.id}`);
          }
        }
      } else {
        console.log(`📂 Encontrados ${typeFilters.length} tipos de produtos:\n`);

        typeFilters.forEach(filter => {
          console.log(`   - ${filter.name} (${filter.count} produtos)`);
        });

        console.log('\n────────────────────────────────────────────────\n');

        // Processar cada filtro
        for (const filter of typeFilters.slice(0, 3)) { // Limitar a 3 para teste
          console.log(`🔍 Processando subcategoria: ${filter.name}`);
          console.log(`   URL: ${filter.url}`);

          // Navegar para o filtro
          await this.page.goto(filter.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });

          await new Promise(resolve => setTimeout(resolve, 3000));

          // Extrair produtos
          const products = await this.extractProductsFromPage();
          console.log(`   Produtos encontrados: ${products.length}`);

          // Salvar alguns produtos com a subcategoria do filtro
          const productsToSave = products.slice(0, 2); // 2 produtos por subcategoria
          for (const product of productsToSave) {
            const productToSave = {
              ...product,
              category: 'Móveis',
              subcategory: filter.name // Usar o nome do filtro como subcategoria
            };

            console.log(`   💾 Salvando: ${product.name}`);
            console.log(`      Subcategoria: ${filter.name}`);
            const saved = await this.saveProductToSupabase(productToSave);
            if (saved) {
              console.log(`      ✅ Salvo com ID: ${saved.id}`);
            }
          }

          console.log();

          // Voltar para a página de móveis para próximo filtro
          await this.page.goto(categoryUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log('\n════════════════════════════════════════════════');
      console.log(`✅ Total de produtos salvos: ${this.totalProductsSaved}`);
      console.log('════════════════════════════════════════════════\n');

    } catch (error) {
      console.error('❌ Erro ao processar categoria:', error.message);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function main() {
  const scraper = new RealFilterScraper();

  try {
    await scraper.initialize();
    console.log('✅ Navegador iniciado\n');

    await scraper.scrapeMoveisCategory();

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await scraper.close();
    console.log('👋 Scraper finalizado!');
  }
}

// Executar
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { RealFilterScraper };