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

// Função para inferir subcategoria
function inferSubcategory(productName, category) {
  const nameLower = productName.toLowerCase();
  
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

async function testScraper() {
  try {
    console.log('🚀 Teste do Scraper com Seletores Corrigidos\n');
    console.log('════════════════════════════════\n');
    
    const url = 'https://casoca.com.br/iluminacao.html';
    const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
    
    console.log('📍 Buscando:', url);
    console.log('⏳ Aguardando resposta da Scraper API...');
    
    const response = await fetch(apiUrl, { timeout: 60000 });
    
    if (!response.ok) {
      console.error('❌ HTTP', response.status, response.statusText);
      return;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    console.log('✅ HTML recebido:', html.length, 'caracteres');
    console.log('\n📦 Extraindo produtos com estrutura correta:\n');
    
    const products = [];
    const processedLinks = new Set();
    
    // Usar estrutura correta: .col-md-4.detail-product > .product-container
    $('.col-md-4.detail-product').each((index, element) => {
      const $el = $(element);
      const $container = $el.find('.product-container');

      // Nome - está em .info h2
      let name = '';
      const $info = $container.find('.info');
      if ($info.length > 0) {
        name = $info.find('h2').text().trim() ||
               $info.find('h3').text().trim() ||
               $info.text().trim().split('\n')[0];
      }
      // Fallback para .product-text
      if (!name) {
        const $productText = $container.find('.product-text');
        if ($productText.length > 0) {
          name = $productText.find('strong').text().trim() ||
                 $productText.find('h2').text().trim() ||
                 $productText.text().trim().split('\n')[0];
        }
      }

      // Link
      let link = '';
      const $linkEl = $container.find('a.product.photo.product-item-photo, a.product-item-photo');
      if ($linkEl.length > 0) {
        link = $linkEl.attr('href') || '';
      }
      if (!link) {
        const $anyLink = $container.find('a[href*=".html"]').not('[href*="?"]').first();
        if ($anyLink.length > 0) {
          link = $anyLink.attr('href') || '';
        }
      }
      const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

      if (processedLinks.has(fullLink)) return;
      if (fullLink) processedLinks.add(fullLink);

      // Imagem
      let imageUrl = '';
      const $img = $container.find('img').first();
      if ($img.length > 0) {
        imageUrl = $img.attr('src') || $img.attr('data-src') || '';
      }

      if (name && name.length > 0) {
        const subcategory = inferSubcategory(name, 'Iluminação');
        
        products.push({
          name: name.substring(0, 200),
          image_url: imageUrl,
          link: fullLink || `https://casoca.com.br/produto/${Date.now()}-${index}`,
          category: 'Iluminação',
          subcategory: subcategory
        });
      }
    });
    
    console.log(`📋 Total de produtos encontrados: ${products.length}\n`);
    
    // Mostrar primeiros 5 produtos
    products.slice(0, 5).forEach((product, i) => {
      console.log(`${i+1}. ${product.name}`);
      console.log(`   🏷️ Subcategoria: ${product.subcategory}`);
      console.log(`   🔗 Link: ${product.link}`);
      console.log(`   🇼 Imagem: ${product.image_url ? '✅' : '❌'}`);
      console.log('');
    });
    
    // Salvar no Supabase
    if (products.length > 0) {
      console.log('\n💾 Salvando no Supabase...');
      
      let saved = 0;
      let errors = 0;
      
      for (const product of products.slice(0, 10)) { // Salvar apenas 10 para teste
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
          
          if (error) {
            if (error.code === '23505') { // Duplicado
              // Atualizar
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
              
              if (!updateError) saved++;
              else errors++;
            } else {
              errors++;
            }
          } else {
            saved++;
          }
        } catch (err) {
          errors++;
        }
      }
      
      console.log(`✅ ${saved} produtos salvos/atualizados`);
      if (errors > 0) console.log(`⚠️ ${errors} erros`);
    }
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
  }
  
  console.log('\n✅ Teste completo!');
}

testScraper();