import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class HierarchicalCasocaScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.bucketName = 'product-images';
    this.baseUrl = 'https://casoca.com.br';
    this.logs = [];
    this.totalProductsSaved = 0;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(60000);

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

  async navigateToHomePage() {
    console.log('🏠 Navegando para página inicial...');
    await this.page.goto(this.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  async extractCategories() {
    console.log('📂 Buscando categorias principais...');

    const categories = await this.page.evaluate(() => {
      const categoryData = [];

      // Tentar encontrar menu de categorias
      const menuSelectors = [
        '.menu-category', '.category-menu', '.nav-menu',
        '[class*="menu"]', 'nav', '.navigation',
        '.categories', '.categorias'
      ];

      for (const selector of menuSelectors) {
        const menu = document.querySelector(selector);
        if (menu) {
          // Buscar links de categorias
          const links = menu.querySelectorAll('a[href]');
          links.forEach(link => {
            const text = link.textContent.trim();
            const href = link.href;

            // Filtrar links válidos de categorias
            if (text && href && !href.includes('#') &&
                !href.includes('login') && !href.includes('cart') &&
                !href.includes('account') && text.length > 2) {

              // Verificar se tem subcategorias (dropdown/submenu)
              const parent = link.parentElement;
              const submenu = parent.querySelector('ul, .submenu, .dropdown');
              const subcategories = [];

              if (submenu) {
                const subLinks = submenu.querySelectorAll('a[href]');
                subLinks.forEach(subLink => {
                  const subText = subLink.textContent.trim();
                  const subHref = subLink.href;
                  if (subText && subHref && subText !== text) {
                    subcategories.push({
                      name: subText,
                      url: subHref
                    });
                  }
                });
              }

              categoryData.push({
                name: text,
                url: href,
                subcategories: subcategories
              });
            }
          });
        }
      }

      // Remover duplicatas
      const uniqueCategories = [];
      const seen = new Set();
      categoryData.forEach(cat => {
        if (!seen.has(cat.name)) {
          seen.add(cat.name);
          uniqueCategories.push(cat);
        }
      });

      return uniqueCategories;
    });

    console.log(`   Encontradas ${categories.length} categorias`);
    categories.forEach(cat => {
      console.log(`   - ${cat.name} (${cat.subcategories.length} subcategorias)`);
    });

    return categories;
  }

  async navigateAndExtractProducts(url, category, subcategory = null) {
    const context = subcategory ? `${category} > ${subcategory}` : category;
    console.log(`\n🔍 Extraindo produtos de: ${context}`);
    console.log(`   URL: ${url}`);

    try {
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      let allProducts = [];
      let currentPage = 1;
      let hasNextPage = true;

      while (hasNextPage && currentPage <= 20) { // Limite de 20 páginas por segurança
        console.log(`   Página ${currentPage}...`);

        // Extrair produtos da página atual
        const products = await this.extractProductsFromCurrentPage();

        if (products.length > 0) {
          // Adicionar categoria e subcategoria aos produtos
          products.forEach(product => {
            product.category = category;

            // Se subcategoria não foi especificada, inferir pelo nome
            if (!subcategory) {
              const nameLower = product.name.toLowerCase();
              let inferredSubcategory = 'Geral';

              // Inferência baseada no nome do produto
              if (nameLower.includes('poltrona')) inferredSubcategory = 'Poltronas';
              else if (nameLower.includes('cadeira')) inferredSubcategory = 'Cadeiras';
              else if (nameLower.includes('mesa')) inferredSubcategory = 'Mesas';
              else if (nameLower.includes('sofá') || nameLower.includes('sofa')) inferredSubcategory = 'Sofás';
              else if (nameLower.includes('banqueta')) inferredSubcategory = 'Banquetas';
              else if (nameLower.includes('cama')) inferredSubcategory = 'Camas';
              else if (nameLower.includes('armário') || nameLower.includes('armario')) inferredSubcategory = 'Armários';
              else if (nameLower.includes('estante')) inferredSubcategory = 'Estantes';
              else if (nameLower.includes('rack')) inferredSubcategory = 'Racks';
              else if (nameLower.includes('luminária') || nameLower.includes('luminaria')) inferredSubcategory = 'Luminárias';
              else if (nameLower.includes('tapete')) inferredSubcategory = 'Tapetes';
              else if (nameLower.includes('cortina')) inferredSubcategory = 'Cortinas';
              else if (nameLower.includes('espelho')) inferredSubcategory = 'Espelhos';
              else if (nameLower.includes('quadro')) inferredSubcategory = 'Quadros';

              product.subcategory = inferredSubcategory;
            } else {
              product.subcategory = subcategory;
            }
          });

          allProducts = allProducts.concat(products);
          console.log(`      Encontrados: ${products.length} produtos`);

          // Salvar produtos no Supabase
          for (const product of products) {
            await this.saveProductToSupabase(product);
          }
        }

        // Tentar ir para próxima página
        const hasNext = await this.goToNextPage();
        if (hasNext) {
          currentPage++;
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          hasNextPage = false;
        }
      }

      console.log(`   ✅ Total extraído de ${context}: ${allProducts.length} produtos`);
      return allProducts;

    } catch (error) {
      console.error(`   ❌ Erro em ${context}:`, error.message);
      return [];
    }
  }

  async extractProductsFromCurrentPage() {
    return await this.page.evaluate(() => {
      const products = [];

      // Seletores específicos do site casoca.com.br
      const productSelectors = [
        '.col-md-4.col-sm-6.detail-product',
        '.product-container',
        '.detail-product',
        '.product-item'
      ];

      let productElements = [];
      for (const selector of productSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 2 && elements.length < 100) {
          productElements = elements;
          break;
        }
      }

      // Se não encontrou por classe, tentar por estrutura
      if (productElements.length === 0) {
        const allElements = document.querySelectorAll('div, article, li');
        const potentialProducts = [];

        allElements.forEach(el => {
          const hasImage = el.querySelector('img');
          const hasLink = el.querySelector('a[href]');
          const hasText = el.textContent.trim().length > 10;
          const notTooNested = !el.querySelector('div div div div');

          if (hasImage && hasLink && hasText && notTooNested) {
            potentialProducts.push(el);
          }
        });

        if (potentialProducts.length > 2) {
          productElements = potentialProducts;
        }
      }

      // Extrair dados de cada produto
      productElements.forEach(element => {
        // Nome do produto
        let name = '';
        const nameSelectors = ['h2', 'h3', 'h4', '.title', '.name', '[class*="title"]', '[class*="name"]'];
        for (const selector of nameSelectors) {
          const nameEl = element.querySelector(selector);
          if (nameEl) {
            name = nameEl.textContent.trim();
            break;
          }
        }

        // Se não encontrou nome específico, pegar texto principal
        if (!name) {
          const link = element.querySelector('a');
          if (link) {
            name = link.textContent.trim();
          }
        }

        // Imagem
        let imageUrl = '';
        const img = element.querySelector('img');
        if (img) {
          imageUrl = img.src || img.dataset.src || img.dataset.lazySrc || '';
        }

        // Link
        let productLink = '';
        const link = element.querySelector('a[href]');
        if (link) {
          productLink = link.href;
        }

        // Adicionar produto se tiver informações mínimas
        if (name && imageUrl && productLink) {
          products.push({
            name: name.substring(0, 200),
            image_url: imageUrl,
            link: productLink
          });
        }
      });

      return products;
    });
  }

  async goToNextPage() {
    try {
      // Tentar encontrar botão de próxima página
      const nextSelectors = [
        'a[aria-label="Next"]', '.next', '.próxima',
        'a:has-text("Próxima")', 'a:has-text("Next")',
        '.pagination a[rel="next"]', '[class*="next"]'
      ];

      for (const selector of nextSelectors) {
        const nextButton = await this.page.$(selector);
        if (nextButton) {
          const isDisabled = await nextButton.evaluate(el =>
            el.classList.contains('disabled') ||
            el.hasAttribute('disabled') ||
            el.getAttribute('aria-disabled') === 'true'
          );

          if (!isDisabled) {
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
              nextButton.click()
            ]);
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async saveProductToSupabase(product) {
    try {
      // Salvar produto no banco
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
        console.error('Erro ao salvar:', saveError.message);
        return null;
      }

      // Fazer download e upload da imagem
      if (product.image_url && savedProduct.id) {
        try {
          const response = await fetch(product.image_url);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const imageBuffer = Buffer.from(buffer);

            // Salvar com ID como nome
            const fileName = `${savedProduct.id}.jpg`;

            const { error: uploadError } = await supabase.storage
              .from(this.bucketName)
              .upload(fileName, imageBuffer, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true
              });

            if (!uploadError) {
              // Atualizar produto com caminho da imagem
              await supabase
                .from('products')
                .update({ image_path: fileName })
                .eq('id', savedProduct.id);
            }
          }
        } catch (imgError) {
          console.error('Erro com imagem:', imgError.message);
        }
      }

      this.totalProductsSaved++;
      return savedProduct;

    } catch (error) {
      console.error('Erro ao processar produto:', error.message);
      return null;
    }
  }

  async scrapeAllCategories() {
    console.log('\n🚀 INICIANDO SCRAPING HIERÁRQUICO\n');
    console.log('='*60);

    const startTime = new Date();

    // Navegar para página inicial
    await this.navigateToHomePage();

    // Extrair categorias e subcategorias
    const categories = await this.extractCategories();

    // Se não encontrou categorias no menu, usar lista manual
    if (categories.length === 0) {
      console.log('⚠️ Não encontrou categorias automaticamente. Usando lista manual...');
      categories.push(
        { name: 'Móveis', url: `${this.baseUrl}/moveis.html`, subcategories: [] },
        { name: 'Iluminação', url: `${this.baseUrl}/iluminacao.html`, subcategories: [] },
        { name: 'Decoração', url: `${this.baseUrl}/decoracao.html`, subcategories: [] },
        { name: 'Revestimentos', url: `${this.baseUrl}/revestimentos.html`, subcategories: [] },
        { name: 'Louças e Metais', url: `${this.baseUrl}/loucas-e-metais.html`, subcategories: [] },
        { name: 'Eletros', url: `${this.baseUrl}/eletros.html`, subcategories: [] },
        { name: 'Tapetes', url: `${this.baseUrl}/tapetes.html`, subcategories: [] },
        { name: 'Portas e Janelas', url: `${this.baseUrl}/portas-e-janelas.html`, subcategories: [] },
        { name: 'Escritório', url: `${this.baseUrl}/escritorio.html`, subcategories: [] },
        { name: 'Infantil', url: `${this.baseUrl}/infantil.html`, subcategories: [] },
        { name: 'Área Externa', url: `${this.baseUrl}/area-externa.html`, subcategories: [] },
        { name: 'Cortinas e Persianas', url: `${this.baseUrl}/cortinas-e-persianas.html`, subcategories: [] },
        { name: 'Cama Mesa e Banho', url: `${this.baseUrl}/cama-mesa-e-banho.html`, subcategories: [] },
        { name: 'Vegetação', url: `${this.baseUrl}/vegetacao.html`, subcategories: [] },
        { name: 'Papéis de Parede', url: `${this.baseUrl}/papeis-de-parede.html`, subcategories: [] }
      );
    }

    // Processar cada categoria
    for (const category of categories) {
      const categoryLog = {
        category: category.name,
        subcategories: [],
        totalProducts: 0,
        startTime: new Date()
      };

      console.log(`\n${'#'.repeat(60)}`);
      console.log(`📁 CATEGORIA: ${category.name.toUpperCase()}`);
      console.log(`${'#'.repeat(60)}`);

      // Processar categoria principal
      const categoryProducts = await this.navigateAndExtractProducts(
        category.url,
        category.name
      );
      categoryLog.totalProducts += categoryProducts.length;

      // Processar subcategorias se existirem
      if (category.subcategories.length > 0) {
        console.log(`\n📂 Processando ${category.subcategories.length} subcategorias...`);

        for (const subcategory of category.subcategories) {
          const subProducts = await this.navigateAndExtractProducts(
            subcategory.url,
            category.name,
            subcategory.name
          );

          categoryLog.subcategories.push({
            name: subcategory.name,
            products: subProducts.length
          });

          categoryLog.totalProducts += subProducts.length;

          // Pausa entre subcategorias
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      categoryLog.endTime = new Date();
      categoryLog.duration = (categoryLog.endTime - categoryLog.startTime) / 1000;

      console.log(`\n✅ Categoria ${category.name} finalizada`);
      console.log(`   Total de produtos: ${categoryLog.totalProducts}`);
      console.log(`   Tempo: ${categoryLog.duration.toFixed(2)}s`);

      this.logs.push(categoryLog);

      // Pausa entre categorias
      if (categories.indexOf(category) < categories.length - 1) {
        console.log('\n⏸️ Aguardando antes da próxima categoria...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const endTime = new Date();
    const totalDuration = (endTime - startTime) / 1000 / 60;

    // Relatório final
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 RELATÓRIO FINAL');
    console.log(`${'='.repeat(60)}`);
    console.log(`Total de produtos salvos: ${this.totalProductsSaved}`);
    console.log(`Tempo total: ${totalDuration.toFixed(2)} minutos`);
    console.log(`${'='.repeat(60)}`);

    // Salvar logs
    await this.saveLogsToFile();
  }

  async saveLogsToFile() {
    const logFileName = `logs_hierarchical_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
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
  const scraper = new HierarchicalCasocaScraper();

  try {
    await scraper.initialize();
    await scraper.scrapeAllCategories();
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

export { HierarchicalCasocaScraper };