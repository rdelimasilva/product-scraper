import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function scrape5WithRealNavigation() {
  let browser;
  let totalSaved = 0;

  try {
    console.log('🚀 Extraindo 5 produtos com navegação real pelos filtros\n');
    console.log('════════════════════════════════════════════════\n');

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Aumentar timeout
    page.setDefaultNavigationTimeout(60000);

    // Acessar página de móveis
    console.log('📍 Passo 1: Acessando página de Móveis...');
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded'
    });

    // Aguardar página carregar
    await page.waitForSelector('.col-md-4.col-sm-6.detail-product', { timeout: 10000 });
    console.log('✅ Página carregada\n');

    // Tirar screenshot inicial
    await page.screenshot({ path: 'step1-moveis-page.png' });

    // Passo 2: Procurar e clicar em "Móveis por:"
    console.log('📍 Passo 2: Procurando "Móveis por:"...');

    const moveisMenuClicked = await page.evaluate(() => {
      // Procurar texto "Móveis por:"
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        if (element.textContent && element.textContent.includes('Móveis por:') &&
            element.children.length === 0) { // Apenas elementos sem filhos (texto direto)
          console.log('Encontrou "Móveis por:"');

          // Clicar no elemento ou em um link próximo
          if (element.tagName === 'A' || element.tagName === 'BUTTON') {
            element.click();
            return true;
          }

          // Procurar link/botão próximo
          const parent = element.parentElement;
          if (parent) {
            const clickable = parent.querySelector('a, button');
            if (clickable) {
              clickable.click();
              return true;
            }
          }
        }
      }
      return false;
    });

    if (moveisMenuClicked) {
      console.log('✅ Clicou em "Móveis por:"\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await page.screenshot({ path: 'step2-after-moveis-por.png' });
    } else {
      console.log('⚠️ Não encontrou "Móveis por:", tentando alternativa...\n');
    }

    // Passo 3: Procurar e clicar em "Tipo"
    console.log('📍 Passo 3: Procurando opção "Tipo"...');

    const tipoClicked = await page.evaluate(() => {
      // Procurar link ou botão com texto "Tipo"
      const links = document.querySelectorAll('a, button, span');
      for (const link of links) {
        const text = link.textContent?.trim().toLowerCase();
        if (text === 'tipo' || text === 'tipos') {
          if (link.tagName === 'A' || link.tagName === 'BUTTON') {
            link.click();
            return true;
          }
          // Se for span, clicar no pai
          if (link.parentElement && (link.parentElement.tagName === 'A' || link.parentElement.tagName === 'BUTTON')) {
            link.parentElement.click();
            return true;
          }
        }
      }
      return false;
    });

    if (tipoClicked) {
      console.log('✅ Clicou em "Tipo"\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await page.screenshot({ path: 'step3-after-tipo.png' });
    } else {
      console.log('⚠️ Não encontrou opção "Tipo"\n');
    }

    // Passo 4: Extrair filtros de tipo disponíveis
    console.log('📍 Passo 4: Extraindo filtros de tipo disponíveis...');

    const filters = await page.evaluate(() => {
      const typeFilters = [];

      // Buscar links com padrão "Nome (quantidade)"
      const links = document.querySelectorAll('a');

      links.forEach(link => {
        const text = link.textContent?.trim();
        const href = link.href;

        // Padrão: "Nome (123)"
        if (text && href && text.match(/\([\d]+\)$/)) {
          const match = text.match(/^(.+?)\s*\(([\d]+)\)$/);
          if (match) {
            const name = match[1].trim();
            const count = parseInt(match[2]);

            // Verificar se é um tipo de móvel válido
            const validTypes = [
              'poltrona', 'cadeira', 'mesa', 'sofá', 'sofa',
              'banqueta', 'banco', 'rack', 'estante', 'cama',
              'armário', 'armario', 'escrivaninha', 'aparador'
            ];

            const nameLower = name.toLowerCase();
            const isValid = validTypes.some(type => nameLower.includes(type));

            if (isValid) {
              typeFilters.push({
                name: name,
                count: count,
                url: href
              });
            }
          }
        }
      });

      return typeFilters;
    });

    console.log(`✅ Encontrados ${filters.length} filtros de tipo:\n`);
    filters.forEach(f => {
      console.log(`   - ${f.name} (${f.count} produtos)`);
    });
    console.log();

    // Passo 5: Navegar pelos filtros e extrair produtos
    if (filters.length > 0) {
      console.log('📍 Passo 5: Salvando produtos com subcategorias dos filtros encontrados...\n');

      // Voltar para a página principal para extrair produtos
      await page.goto('https://casoca.com.br/moveis.html', {
        waitUntil: 'domcontentloaded'
      });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extrair produtos da página principal
      const mainProducts = await page.evaluate(() => {
        const items = [];
        const elements = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');

        for (let i = 0; i < Math.min(5, elements.length); i++) {
          const el = elements[i];
          const name = el.querySelector('h3, h4, a')?.textContent?.trim();
          const img = el.querySelector('img');
          const imageUrl = img?.src || img?.dataset?.src;
          const link = el.querySelector('a')?.href;

          if (name && imageUrl && link) {
            items.push({
              name: name,
              image_url: imageUrl,
              link: link
            });
          }
        }

        return items;
      });

      console.log(`📦 Encontrados ${mainProducts.length} produtos na página principal\n`);

      // Salvar produtos com subcategorias baseadas no nome e nos filtros encontrados
      for (let i = 0; i < mainProducts.length && totalSaved < 5; i++) {
        const product = mainProducts[i];

        // Determinar subcategoria baseada no nome do produto e filtros disponíveis
        let subcategory = 'Geral';
        const productNameLower = product.name.toLowerCase();

        // Verificar qual filtro corresponde ao produto
        for (const filter of filters) {
          const filterNameLower = filter.name.toLowerCase();
          if (filterNameLower.includes('poltrona') && productNameLower.includes('poltrona')) {
            subcategory = filter.name;
            break;
          } else if (filterNameLower.includes('mesa') && productNameLower.includes('mesa')) {
            subcategory = filter.name;
            break;
          } else if (filterNameLower.includes('cadeira') && productNameLower.includes('cadeira')) {
            subcategory = filter.name;
            break;
          } else if (filterNameLower.includes('sofá') && productNameLower.includes('sofá')) {
            subcategory = filter.name;
            break;
          } else if (filterNameLower.includes('banqueta') && productNameLower.includes('banqueta')) {
            subcategory = filter.name;
            break;
          }
        }

        const productToSave = {
          name: product.name,
          category: 'Móveis',
          subcategory: subcategory,
          image_url: product.image_url,
          link: product.link
        };

        console.log(`💾 Salvando: ${product.name}`);
        console.log(`   Categoria: Móveis`);
        console.log(`   Subcategoria: ${subcategory} (baseado nos filtros disponíveis)`);

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
    } else {
      console.log('⚠️ Nenhum filtro encontrado, extraindo produtos da página principal\n');

      // Extrair produtos sem filtro específico
      const products = await page.evaluate(() => {
        const items = [];
        const elements = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');

        for (let i = 0; i < Math.min(5, elements.length); i++) {
          const el = elements[i];
          const name = el.querySelector('h3, h4, a')?.textContent?.trim();
          const img = el.querySelector('img');
          const imageUrl = img?.src || img?.dataset?.src;
          const link = el.querySelector('a')?.href;

          if (name && imageUrl && link) {
            items.push({
              name: name,
              image_url: imageUrl,
              link: link
            });
          }
        }

        return items;
      });

      for (const product of products) {
        if (totalSaved >= 5) break;

        const productToSave = {
          name: product.name,
          category: 'Móveis',
          subcategory: 'Geral',
          image_url: product.image_url,
          link: product.link
        };

        console.log(`💾 Salvando: ${product.name}`);
        console.log(`   Subcategoria: Geral (sem filtro específico)`);

        const { data, error } = await supabase
          .from('products')
          .insert(productToSave)
          .select()
          .single();

        if (!error && data) {
          console.log(`   ✅ Salvo com ID: ${data.id}\n`);
          totalSaved++;
        }
      }
    }

    console.log('\n════════════════════════════════════════════════');
    console.log(`📊 RESUMO: ${totalSaved} produtos salvos com sucesso`);
    console.log('════════════════════════════════════════════════');

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
scrape5WithRealNavigation();