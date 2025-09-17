import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function save5Products() {
  let browser;

  try {
    console.log('🚀 Salvando 5 produtos de teste\n');
    console.log('════════════════════════════════════════════════\n');

    browser = await puppeteer.launch({
      headless: 'new',
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Acessar página de móveis
    console.log('📍 Acessando: https://casoca.com.br/moveis.html');
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    console.log('✅ Página carregada\n');

    // Aguardar um pouco para garantir que tudo carregou
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Debug: verificar que seletores existem
    const debugInfo = await page.evaluate(() => {
      const selectors = [
        '.col-md-4.col-sm-6.detail-product',
        '.detail-product',
        '.product-item',
        '.card',
        '[class*="product"]'
      ];

      const results = {};
      selectors.forEach(sel => {
        results[sel] = document.querySelectorAll(sel).length;
      });

      return results;
    });

    console.log('🔍 Debug - Elementos encontrados:', debugInfo);

    // Extrair 5 produtos da página
    const products = await page.evaluate(() => {
      const items = [];
      // Tentar múltiplos seletores
      let elements = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');

      if (elements.length === 0) {
        elements = document.querySelectorAll('.detail-product');
      }

      if (elements.length === 0) {
        elements = document.querySelectorAll('[class*="product"]');
      }

      for (let i = 0; i < Math.min(5, elements.length); i++) {
        const el = elements[i];
        const name = el.querySelector('h3, h4, a')?.textContent?.trim();
        const imageUrl = el.querySelector('img')?.src;
        const link = el.querySelector('a')?.href;

        if (name && imageUrl && link) {
          items.push({ name, image_url: imageUrl, link });
        }
      }

      return items;
    });

    console.log(`📦 Encontrados ${products.length} produtos\n`);

    // Subcategorias que viriam dos filtros reais do site
    // Por enquanto usando valores fixos para demonstrar
    const subcategorias = ['Poltronas', 'Cadeiras', 'Mesas', 'Sofás', 'Banquetas'];

    // Salvar produtos
    let savedCount = 0;
    for (let i = 0; i < products.length && i < 5; i++) {
      const product = products[i];
      const productToSave = {
        ...product,
        category: 'Móveis',
        subcategory: subcategorias[i] || 'Geral' // NOTA: Deve vir do filtro real do site
      };

      console.log(`💾 Salvando: ${product.name}`);
      console.log(`   Categoria: Móveis`);
      console.log(`   Subcategoria: ${productToSave.subcategory}`);
      console.log(`   ⚠️ NOTA: Subcategoria deve vir dos filtros reais do site`);

      const { data, error } = await supabase
        .from('products')
        .insert(productToSave)
        .select()
        .single();

      if (!error && data) {
        console.log(`   ✅ Salvo com ID: ${data.id}\n`);
        savedCount++;

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
            console.log(`   ⚠️ Não foi possível fazer upload da imagem`);
          }
        }
      } else {
        console.log(`   ❌ Erro: ${error?.message}\n`);
      }
    }

    console.log('════════════════════════════════════════════════');
    console.log(`📊 RESUMO: ${savedCount} produtos salvos`);
    console.log('════════════════════════════════════════════════');

    console.log('\n⚠️ IMPORTANTE:');
    console.log('As subcategorias usadas são placeholders.');
    console.log('Para dados reais, é preciso:');
    console.log('1. Clicar em "Móveis por:" no site');
    console.log('2. Clicar em "Tipo"');
    console.log('3. Extrair os filtros disponíveis (Poltronas, Cadeiras, etc.)');
    console.log('4. Navegar para cada filtro e extrair produtos de lá');

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
save5Products();