import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function scrapeWithSubcategories() {
  let browser;

  try {
    console.log('🚀 Iniciando scraper com subcategorias reais\n');
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

    const categories = [
      { name: 'Móveis', url: 'https://casoca.com.br/moveis.html', filterName: 'Móveis por:' },
      { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html', filterName: 'Iluminação por:' }
    ];

    let totalSaved = 0;

    for (const category of categories) {
      console.log(`\n📁 Categoria: ${category.name}`);
      console.log('════════════════════════════════════\n');

      await page.goto(category.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Aguardar Cloudflare
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        // Passo 1: Clicar no filtro principal (ex: "Móveis por:")
        console.log(`🔍 Procurando filtro "${category.filterName}"...`);

        const filterClicked = await page.evaluate((filterText) => {
          const links = Array.from(document.querySelectorAll('a'));
          const filterLink = links.find(a => a.textContent.includes(filterText));
          if (filterLink) {
            filterLink.click();
            return true;
          }
          return false;
        }, category.filterName);

        if (filterClicked) {
          console.log('✅ Clicou no filtro principal');
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Passo 2: Clicar em "Tipo"
          const tipoClicked = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const tipoLink = links.find(a => a.textContent.includes('Tipo'));
            if (tipoLink) {
              tipoLink.click();
              return true;
            }
            return false;
          });

          if (tipoClicked) {
            console.log('✅ Clicou em "Tipo"');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Passo 3: Extrair todas as subcategorias disponíveis
            const subcategories = await page.evaluate(() => {
              const checkboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
              const subs = [];

              checkboxes.forEach(checkbox => {
                const label = checkbox.parentElement?.textContent?.trim() ||
                             checkbox.nextElementSibling?.textContent?.trim() ||
                             checkbox.closest('.filter-option')?.textContent?.trim();

                if (label && label.length > 0) {
                  subs.push({
                    name: label.replace(/[^a-zA-ZÀ-ú\s]/g, '').trim(),
                    selector: checkbox
                  });
                }
              });

              return subs;
            });

            console.log(`📋 Encontradas ${subcategories.length} subcategorias:`, subcategories.map(s => s.name).join(', '));

            // Passo 4: Para cada subcategoria, aplicar o filtro e extrair produtos
            for (const subcategory of subcategories.slice(0, 5)) { // Limitar a 5 subcategorias por teste
              console.log(`\n  📂 Subcategoria: ${subcategory.name}`);

              // Marcar o checkbox da subcategoria
              await page.evaluate((subName) => {
                const checkboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
                checkboxes.forEach(cb => {
                  const label = cb.parentElement?.textContent?.trim() ||
                               cb.nextElementSibling?.textContent?.trim();
                  if (label && label.includes(subName)) {
                    cb.click();
                  }
                });
              }, subcategory.name);

              await new Promise(resolve => setTimeout(resolve, 4000)); // Aguardar produtos carregarem

              // Extrair produtos
              const products = await page.evaluate((categoryName, subcategoryName) => {
                const items = [];
                const productElements = document.querySelectorAll('.product');

                productElements.forEach((element, index) => {
                  const name = element.querySelector('h3')?.textContent?.trim() ||
                              element.querySelector('h4')?.textContent?.trim() ||
                              element.querySelector('a')?.textContent?.trim() ||
                              element.textContent?.trim().split('\n')[0];

                  const img = element.querySelector('img');
                  const imageUrl = img?.src || img?.dataset?.src || '';

                  const link = element.querySelector('a')?.href || '';

                  if (name && name.length > 0) {
                    items.push({
                      name: name.substring(0, 200),
                      image_url: imageUrl,
                      link: link || `https://casoca.com.br/produto/${Date.now()}-${index}`,
                      category: categoryName,
                      subcategory: subcategoryName
                    });
                  }
                });

                return items;
              }, category.name, subcategory.name);

              console.log(`    ✅ ${products.length} produtos encontrados`);

              // Salvar no Supabase
              if (products.length > 0) {
                for (const product of products.slice(0, 5)) { // Limitar a 5 produtos por subcategoria
                  try {
                    const { data, error } = await supabase
                      .from('products')
                      .insert({
                        name: product.name,
                        image_url: product.image_url,
                        link: product.link,
                        category: product.category,
                        subcategory: product.subcategory
                      });

                    if (!error) {
                      totalSaved++;
                    } else {
                      console.error('    Erro ao salvar:', error.message);
                    }
                  } catch (err) {
                    console.error('    Erro:', err.message);
                  }
                }
                console.log(`    💾 ${Math.min(5, products.length)} produtos salvos`);
              }

              // Desmarcar o checkbox para próxima subcategoria
              await page.evaluate((subName) => {
                const checkboxes = document.querySelectorAll('.filter-option input[type="checkbox"]:checked');
                checkboxes.forEach(cb => {
                  const label = cb.parentElement?.textContent?.trim() ||
                               cb.nextElementSibling?.textContent?.trim();
                  if (label && label.includes(subName)) {
                    cb.click();
                  }
                });
              }, subcategory.name);

              await new Promise(resolve => setTimeout(resolve, 2000));
            }

          } else {
            console.log('⚠️ Botão "Tipo" não encontrado');
          }
        } else {
          console.log(`⚠️ Filtro "${category.filterName}" não encontrado`);

          // Tentar extrair produtos sem filtro
          const products = await page.evaluate((categoryName) => {
            const items = [];
            const productElements = document.querySelectorAll('.product');

            productElements.forEach((element, index) => {
              const name = element.querySelector('h3')?.textContent?.trim() ||
                          element.querySelector('h4')?.textContent?.trim() ||
                          element.textContent?.trim().split('\n')[0];

              const img = element.querySelector('img');
              const imageUrl = img?.src || img?.dataset?.src || '';

              const link = element.querySelector('a')?.href || '';

              if (name && name.length > 0) {
                items.push({
                  name: name.substring(0, 200),
                  image_url: imageUrl,
                  link: link || `https://casoca.com.br/produto/${Date.now()}-${index}`,
                  category: categoryName,
                  subcategory: null
                });
              }
            });

            return items;
          }, category.name);

          if (products.length > 0) {
            console.log(`✅ ${products.length} produtos encontrados sem filtro`);

            for (const product of products.slice(0, 10)) {
              try {
                const { data, error } = await supabase
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
                console.error('Erro:', err.message);
              }
            }
          }
        }

      } catch (error) {
        console.error(`❌ Erro na categoria ${category.name}:`, error.message);
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
scrapeWithSubcategories();