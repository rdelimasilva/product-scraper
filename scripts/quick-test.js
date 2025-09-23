import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

function inferSubcategory(productName, category) {
  const nameLower = productName.toLowerCase();
  
  if (category === 'Móveis') {
    if (nameLower.includes('poltrona')) return 'Poltronas';
    if (nameLower.includes('cadeira')) return 'Cadeiras';
    if (nameLower.includes('mesa')) return 'Mesas';
    if (nameLower.includes('sofá')) return 'Sofás';
    if (nameLower.includes('banqueta')) return 'Banquetas';
    if (nameLower.includes('banco')) return 'Bancos';
    if (nameLower.includes('estante')) return 'Estantes';
    if (nameLower.includes('aparador')) return 'Aparadores';
  }
  
  if (category === 'Iluminação') {
    if (nameLower.includes('pendente')) return 'Pendentes';
    if (nameLower.includes('luminária de mesa') || nameLower.includes('abajur')) return 'Luminárias de Mesa';
    if (nameLower.includes('luminária de piso')) return 'Luminárias de Piso';
    if (nameLower.includes('arandela')) return 'Arandelas';
    if (nameLower.includes('plafon')) return 'Plafons';
    if (nameLower.includes('lustre')) return 'Lustres';
    if (nameLower.includes('spot')) return 'Spots';
    if (nameLower.includes('poste')) return 'Postes';
    if (nameLower.includes('refletor')) return 'Refletores';
  }
  
  return 'Outros';
}

async function quickTest() {
  console.log('🚀 Teste Rápido - 1 Categoria, 2 Páginas\n');
  console.log('════════════════════════════════\n');
  
  const category = { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' };
  let totalProducts = 0;
  let totalSaved = 0;
  
  for (let page = 1; page <= 2; page++) {
    const url = page === 1 ? category.url : `${category.url}?p=${page}`;
    console.log(`\n📄 Página ${page}: ${url}`);
    
    try {
      const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
      console.log('  ⏳ Buscando...');
      
      const response = await fetch(apiUrl, { timeout: 60000 });
      
      if (!response.ok) {
        console.error('  ❌ HTTP', response.status);
        continue;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const products = [];
      
      // Extrair produtos
      $('.col-md-4.detail-product').each((index, element) => {
        const $el = $(element);
        const $container = $el.find('.product-container');

        // Nome
        let name = '';
        const $info = $container.find('.info');
        if ($info.length > 0) {
          name = $info.find('h2').text().trim();
        }

        // Link
        const link = $container.find('a.product.photo.product-item-photo, a.product-item-photo').attr('href') || '';
        const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

        // Imagem
        const imageUrl = $container.find('img').first().attr('src') || '';

        if (name) {
          const subcategory = inferSubcategory(name, category.name);
          products.push({
            name: name.substring(0, 200),
            image_url: imageUrl,
            link: fullLink || `https://casoca.com.br/produto/${Date.now()}-${index}`,
            category: category.name,
            subcategory: subcategory
          });
        }
      });
      
      console.log(`  ✅ ${products.length} produtos encontrados`);
      totalProducts += products.length;
      
      // Salvar no Supabase
      for (const product of products) {
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
          
          if (error) {
            if (error.code === '23505') { // Duplicado
              const { error: updateError } = await supabase
                .from('products')
                .update({
                  name: product.name,
                  image_url: product.image_url,
                  category: product.category,
                  subcategory: product.subcategory,
                  updated_at: new Date().toISOString()
                })
                .eq('link', product.link);
              
              if (!updateError) totalSaved++;
            }
          } else {
            totalSaved++;
          }
        } catch (err) {
          // ignore
        }
      }
      
      console.log(`  💾 ${totalSaved} salvos/atualizados`);
      
      // Mostrar alguns produtos
      if (products.length > 0 && page === 1) {
        console.log('\n  Exemplos:');
        products.slice(0, 3).forEach((p, i) => {
          console.log(`    ${i+1}. ${p.name} [${p.subcategory}]`);
        });
      }
      
    } catch (error) {
      console.error(`  ❌ Erro: ${error.message}`);
    }
    
    // Aguardar entre páginas
    if (page < 2) {
      console.log('\n  ⏳ Aguardando 2s...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n════════════════════════════════');
  console.log(`📦 Total: ${totalProducts} produtos processados`);
  console.log(`💾 Total: ${totalSaved} salvos/atualizados`);
  console.log('════════════════════════════════');
}

quickTest();