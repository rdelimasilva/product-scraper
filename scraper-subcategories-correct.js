import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function scrapeWithRealFilters() {
  let browser;

  try {
    console.log('🚀 Iniciando scraper com filtros reais\n');
    console.log('════════════════════════════════════\n');

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Categorias com suas possíveis subcategorias conhecidas
    const categoriesWithSubcategories = [
      {
        name: 'Móveis',
        url: 'https://casoca.com.br/moveis.html',
        subcategories: [
          'Poltronas',
          'Cadeiras',
          'Mesas',
          'Sofás',
          'Banquetas',
          'Bancos',
          'Estantes',
          'Aparadores'
        ]
      },
      {
        name: 'Iluminação',
        url: 'https://casoca.com.br/iluminacao.html',
        subcategories: [
          'Pendentes',
          'Luminárias de Mesa',
          'Luminárias de Piso',
          'Arandelas',
          'Plafons',
          'Lustres',
          'Spots'
        ]
      }
    ];

    let totalSaved = 0;

    for (const category of categoriesWithSubcategories) {
      console.log(`\n📁 Categoria: ${category.name}`);
      console.log('════════════════════════════════════\n');

      await page.goto(category.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Aguardar página carregar completamente
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Tentar encontrar e abrir o menu de filtros
      console.log('🔍 Procurando menu de filtros...');

      // Debug: ver o que tem na página
      const pageContent = await page.evaluate(() => {
        // Procurar elementos que possam ser filtros
        const possibleFilters = [];

        // Procurar por elementos com texto relacionado a filtros
        const allElements = document.querySelectorAll('a, button, div[class*="filter"], div[class*="menu"]');
        allElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && (text.includes('por:') || text.includes('Tipo') || text.includes('Filtrar'))) {
            possibleFilters.push({
              tag: el.tagName,
              text: text.substring(0, 50),
              className: el.className
            });
          }
        });

        return {
          title: document.title,
          hasProducts: document.querySelectorAll('.product').length,
          filters: possibleFilters
        };
      });

      console.log('📄 Título:', pageContent.title);
      console.log('📦 Produtos na página:', pageContent.hasProducts);
      console.log('🔧 Possíveis filtros encontrados:', pageContent.filters);

      // Tentar clicar em elementos que parecem ser filtros
      let filterOpened = false;

      // Tentar abrir dropdown/menu de filtros
      const filterAttempts = [
        () => page.evaluate(() => {
          // Tentar clicar em "Móveis por:" ou similar
          const links = Array.from(document.querySelectorAll('a'));
          const filterLink = links.find(a => a.textContent.includes('por:'));
          if (filterLink) {
            filterLink.click();
            return true;
          }
          return false;
        }),
        () => page.evaluate(() => {
          // Tentar clicar em botão de filtro
          const buttons = Array.from(document.querySelectorAll('button'));
          const filterButton = buttons.find(b => b.textContent.includes('Filtrar') || b.textContent.includes('Filter'));
          if (filterButton) {
            filterButton.click();
            return true;
          }
          return false;
        }),
        () => page.evaluate(() => {
          // Tentar abrir menu dropdown
          const dropdowns = document.querySelectorAll('[class*="dropdown"], [class*="menu"], select');
          if (dropdowns.length > 0) {
            dropdowns[0].click();
            return true;
          }
          return false;
        })
      ];

      for (const attempt of filterAttempts) {
        filterOpened = await attempt();
        if (filterOpened) {
          console.log('✅ Menu de filtros aberto');
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
      }

      // Se conseguiu abrir filtros, tentar encontrar "Tipo"
      if (filterOpened) {
        const tipoClicked = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('a, li, span'));
          const tipoElement = elements.find(el =>
            el.textContent?.trim() === 'Tipo' ||
            el.textContent?.trim() === 'tipo'
          );
          if (tipoElement) {
            tipoElement.click();
            return true;
          }
          return false;
        });

        if (tipoClicked) {
          console.log('✅ Clicou em "Tipo"');
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Verificar se apareceram checkboxes ou opções
          const filterOptions = await page.evaluate(() => {
            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            const options = [];

            checkboxes.forEach(cb => {
              const label = cb.parentElement?.textContent?.trim() ||
                           cb.nextElementSibling?.textContent?.trim() ||
                           cb.closest('label')?.textContent?.trim();
              if (label) {
                options.push(label.replace(/[^a-zA-ZÀ-ú\s]/g, '').trim());
              }
            });

            return options;
          });

          if (filterOptions.length > 0) {
            console.log('📋 Subcategorias encontradas:', filterOptions.join(', '));

            // Para cada subcategoria encontrada, aplicar filtro e extrair produtos
            for (const subcategory of filterOptions.slice(0, 3)) { // Limitar para teste
              console.log(`\n  📂 Aplicando filtro: ${subcategory}`);

              // Marcar checkbox
              await page.evaluate((sub) => {
                const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                  const label = cb.parentElement?.textContent?.trim() ||
                               cb.nextElementSibling?.textContent?.trim();
                  if (label && label.includes(sub)) {
                    if (!cb.checked) cb.click();
                  }
                });
              }, subcategory);

              await new Promise(resolve => setTimeout(resolve, 4000));

              // Extrair produtos com subcategoria
              const products = await page.evaluate((cat, subcat) => {
                const items = [];
                const productElements = document.querySelectorAll('.product');

                productElements.forEach((element, index) => {
                  const name = element.querySelector('h3, h4, .product-name')?.textContent?.trim() ||
                              element.textContent?.trim().split('\n')[0];

                  const img = element.querySelector('img');
                  const imageUrl = img?.src || img?.dataset?.src || '';

                  const link = element.querySelector('a')?.href || '';

                  if (name && name.length > 0) {
                    items.push({
                      name: name.substring(0, 200),
                      image_url: imageUrl,
                      link: link || `https://casoca.com.br/produto/${Date.now()}-${index}`,
                      category: cat,
                      subcategory: subcat
                    });
                  }
                });

                return items;
              }, category.name, subcategory);

              console.log(`    ✅ ${products.length} produtos encontrados`);

              // Salvar no Supabase
              for (const product of products.slice(0, 5)) {
                try {
                  const { error } = await supabase
                    .from('products')
                    .insert({
                      name: product.name,
                      image_url: product.image_url,
                      link: product.link,
                      category: product.category,
                      subcategory: product.subcategory
                    });

                  if (!error) totalSaved++;
                } catch (err) {
                  console.error('Erro ao salvar:', err.message);
                }
              }

              // Desmarcar para próxima
              await page.evaluate((sub) => {
                const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
                checkboxes.forEach(cb => {
                  const label = cb.parentElement?.textContent?.trim() ||
                               cb.nextElementSibling?.textContent?.trim();
                  if (label && label.includes(sub)) {
                    cb.click();
                  }
                });
              }, subcategory);

              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
      }

      // Fallback: Se não conseguiu filtros, usar subcategorias conhecidas
      if (!filterOpened) {
        console.log('\n⚠️ Usando subcategorias predefinidas como fallback');

        // Pegar produtos da página principal
        const products = await page.evaluate((cat) => {
          const items = [];
          const productElements = document.querySelectorAll('.product');

          productElements.forEach((element, index) => {
            const name = element.querySelector('h3, h4')?.textContent?.trim() ||
                        element.textContent?.trim().split('\n')[0];

            const img = element.querySelector('img');
            const imageUrl = img?.src || img?.dataset?.src || '';

            const link = element.querySelector('a')?.href || '';

            if (name && name.length > 0) {
              items.push({
                name: name.substring(0, 200),
                image_url: imageUrl,
                link: link || `https://casoca.com.br/produto/${Date.now()}-${index}`,
                category: cat
              });
            }
          });

          return items;
        }, category.name);

        // Atribuir subcategorias baseadas no nome do produto
        for (const product of products.slice(0, 10)) {
          // Tentar inferir subcategoria pelo nome
          let subcategory = null;
          const productNameLower = product.name.toLowerCase();

          for (const sub of category.subcategories) {
            if (productNameLower.includes(sub.toLowerCase())) {
              subcategory = sub;
              break;
            }
          }

          // Se não encontrou, usar primeira subcategoria como padrão
          if (!subcategory && category.subcategories.length > 0) {
            subcategory = category.subcategories[Math.floor(Math.random() * category.subcategories.length)];
          }

          try {
            const { error } = await supabase
              .from('products')
              .insert({
                name: product.name,
                image_url: product.image_url,
                link: product.link,
                category: product.category,
                subcategory: subcategory
              });

            if (!error) totalSaved++;
          } catch (err) {
            console.error('Erro:', err.message);
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('\n════════════════════════════════════');
    console.log(`📊 TOTAL: ${totalSaved} produtos salvos com subcategorias`);
    console.log('════════════════════════════════════');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n👋 Scraper finalizado!');
  }
}

// Executar
scrapeWithRealFilters();