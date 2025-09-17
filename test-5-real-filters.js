import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testRealFilters() {
  let browser;
  let totalSaved = 0;
  const maxProducts = 5;

  try {
    console.log('🚀 TESTE: Salvando 5 produtos com filtros reais\n');
    console.log('════════════════════════════════════════════════\n');

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    // Acessar página de móveis
    console.log('📍 Acessando: https://casoca.com.br/moveis.html');
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded'
    });

    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Página carregada\n');

    // Procurar e clicar em "Móveis por:"
    console.log('🔍 Procurando menu "Móveis por:"...');

    const moveisFound = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('Móveis por:')) {
          // Verificar se há links próximos
          const parent = el.parentElement;
          if (parent) {
            // Procurar links com "tipo" no href ou texto
            const links = parent.querySelectorAll('a, button');
            for (const link of links) {
              if (link.textContent && link.textContent.toLowerCase().includes('tipo')) {
                console.log('Encontrou link de Tipo');
                return true;
              }
            }
          }
        }
      }
      return false;
    });

    if (!moveisFound) {
      console.log('⚠️ Menu "Móveis por:" não encontrado');
      console.log('📦 Extraindo produtos sem filtro...\n');

      // Extrair produtos sem filtro
      const products = await page.evaluate(() => {
        const items = [];
        const elements = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');

        elements.forEach((el, index) => {
          if (index < 5) {
            const name = el.querySelector('h3, h4, a')?.textContent?.trim();
            const imageUrl = el.querySelector('img')?.src;
            const link = el.querySelector('a')?.href;

            if (name && imageUrl && link) {
              items.push({ name, image_url: imageUrl, link });
            }
          }
        });

        return items;
      });

      // Salvar produtos sem subcategoria específica
      for (const product of products.slice(0, maxProducts)) {
        const productToSave = {
          ...product,
          category: 'Móveis',
          subcategory: 'Geral'
        };

        console.log(`💾 Salvando: ${product.name}`);
        console.log(`   Categoria: Móveis`);
        console.log(`   Subcategoria: Geral`);

        const { data, error } = await supabase
          .from('products')
          .insert(productToSave)
          .select()
          .single();

        if (!error && data) {
          console.log(`   ✅ Salvo com ID: ${data.id}\n`);
          totalSaved++;

          // Upload da imagem
          if (product.image_url) {
            try {
              const response = await fetch(product.image_url);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                const imageBuffer = Buffer.from(buffer);
                const fileName = `${data.id}.jpg`;

                await supabase.storage
                  .from('product-images')
                  .upload(fileName, imageBuffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                  });

                await supabase
                  .from('products')
                  .update({ image_path: fileName })
                  .eq('id', data.id);
              }
            } catch (err) {
              // Ignorar erro de imagem
            }
          }
        } else {
          console.log(`   ❌ Erro: ${error?.message}\n`);
        }

        if (totalSaved >= maxProducts) break;
      }

    } else {
      console.log('✅ Encontrou menu "Móveis por:"\n');

      // Clicar em "Tipo"
      console.log('🔍 Procurando e clicando em "Tipo"...');

      const tipoClicked = await page.evaluate(() => {
        const links = document.querySelectorAll('a, button');
        for (const link of links) {
          if (link.textContent && link.textContent.toLowerCase().includes('tipo')) {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (!tipoClicked) {
        console.log('⚠️ Não conseguiu clicar em "Tipo"\n');
      } else {
        console.log('✅ Clicou em "Tipo"\n');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Extrair filtros disponíveis
        const filters = await page.evaluate(() => {
          const typeFilters = [];
          const links = document.querySelectorAll('a');

          links.forEach(link => {
            const text = link.textContent.trim();
            const href = link.href;

            // Procurar padrão "Nome (quantidade)"
            const match = text.match(/^(.+?)\s*\((\d+)\)$/);
            if (match && href && href.includes('casoca.com.br')) {
              const name = match[1].trim();
              const count = parseInt(match[2]);

              // Filtrar tipos válidos
              const validTypes = ['poltrona', 'cadeira', 'mesa', 'sofá', 'sofa', 'banqueta'];
              const nameLower = name.toLowerCase();

              if (validTypes.some(type => nameLower.includes(type))) {
                typeFilters.push({ name, count, url: href });
              }
            }
          });

          return typeFilters.slice(0, 3); // Pegar apenas 3 filtros
        });

        console.log(`📂 Encontrados ${filters.length} filtros:\n`);
        filters.forEach(f => {
          console.log(`   - ${f.name} (${f.count} produtos)`);
        });
        console.log();

        // Processar filtros até salvar 5 produtos
        for (const filter of filters) {
          if (totalSaved >= maxProducts) break;

          console.log(`\n🔍 Acessando filtro: ${filter.name}`);
          await page.goto(filter.url, {
            waitUntil: 'domcontentloaded'
          });

          await new Promise(resolve => setTimeout(resolve, 3000));

          // Extrair produtos do filtro
          const products = await page.evaluate(() => {
            const items = [];
            const elements = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');

            elements.forEach((el, index) => {
              if (index < 2) { // Pegar apenas 2 por filtro
                const name = el.querySelector('h3, h4, a')?.textContent?.trim();
                const imageUrl = el.querySelector('img')?.src;
                const link = el.querySelector('a')?.href;

                if (name && imageUrl && link) {
                  items.push({ name, image_url: imageUrl, link });
                }
              }
            });

            return items;
          });

          console.log(`   Encontrados: ${products.length} produtos\n`);

          // Salvar produtos com subcategoria do filtro
          for (const product of products) {
            if (totalSaved >= maxProducts) break;

            const productToSave = {
              ...product,
              category: 'Móveis',
              subcategory: filter.name // Usar nome do filtro como subcategoria
            };

            console.log(`💾 Salvando: ${product.name}`);
            console.log(`   Categoria: Móveis`);
            console.log(`   Subcategoria: ${filter.name} (DO FILTRO REAL)`);

            const { data, error } = await supabase
              .from('products')
              .insert(productToSave)
              .select()
              .single();

            if (!error && data) {
              console.log(`   ✅ Salvo com ID: ${data.id}\n`);
              totalSaved++;

              // Upload da imagem
              if (product.image_url) {
                try {
                  const response = await fetch(product.image_url);
                  if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    const imageBuffer = Buffer.from(buffer);
                    const fileName = `${data.id}.jpg`;

                    await supabase.storage
                      .from('product-images')
                      .upload(fileName, imageBuffer, {
                        contentType: 'image/jpeg',
                        upsert: true
                      });

                    await supabase
                      .from('products')
                      .update({ image_path: fileName })
                      .eq('id', data.id);
                  }
                } catch (err) {
                  // Ignorar erro de imagem
                }
              }
            } else {
              console.log(`   ❌ Erro: ${error?.message}\n`);
            }
          }
        }
      }
    }

    console.log('════════════════════════════════════════════════');
    console.log(`📊 RESUMO: ${totalSaved} produtos salvos`);
    console.log('════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n👋 Teste finalizado!');
  }
}

// Executar
testRealFilters();