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
  }
  return 'Outros';
}

async function testSave() {
  console.log('🧪 Testando salvamento no Supabase\n');
  
  // Produto de teste
  const testProduct = {
    name: 'Produto Teste ' + Date.now(),
    image_url: 'https://example.com/image.jpg',
    link: 'https://casoca.com.br/teste-' + Date.now() + '.html',
    category: 'Móveis',
    subcategory: 'Outros'
  };
  
  console.log('Tentando salvar:', testProduct);
  
  try {
    // Tentar INSERT direto
    const { data, error } = await supabase
      .from('products')
      .insert(testProduct);
    
    if (error) {
      console.error('❌ Erro no INSERT:', error);
      console.error('Detalhes:', error.message);
      console.error('Code:', error.code);
      console.error('Details:', error.details);
      console.error('Hint:', error.hint);
    } else {
      console.log('✅ Salvo com sucesso!', data);
    }
  } catch (err) {
    console.error('❌ Erro geral:', err);
  }
  
  console.log('\n📋 Verificando estrutura da tabela...');
  
  // Verificar se consegue ler
  const { data: readTest, error: readError } = await supabase
    .from('products')
    .select('*')
    .limit(1);
  
  if (readError) {
    console.error('❌ Erro ao ler:', readError);
  } else {
    console.log('✅ Leitura OK. Colunas:', Object.keys(readTest[0] || {}));
  }
}

async function scrapeAndSave() {
  console.log('\n🚀 Testando scraping + salvamento\n');
  
  const url = 'https://casoca.com.br/moveis.html';
  const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
  
  console.log('Buscando produtos...');
  
  try {
    const response = await fetch(apiUrl, { timeout: 60000 });
    
    if (!response.ok) {
      console.error('❌ Erro API:', response.status);
      return;
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const products = [];
    
    $('.col-md-4.detail-product').each((index, element) => {
      if (index >= 3) return; // Apenas 3 produtos para teste
      
      const $el = $(element);
      const $container = $el.find('.product-container');
      
      const name = $container.find('.info h2').text().trim();
      const link = $container.find('a.product-item-photo').attr('href') || '';
      const imageUrl = $container.find('img').first().attr('src') || '';
      
      if (name) {
        products.push({
          name: name.substring(0, 200),
          image_url: imageUrl,
          link: link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : `https://casoca.com.br/p/${Date.now()}-${index}`,
          category: 'Móveis',
          subcategory: inferSubcategory(name, 'Móveis')
        });
      }
    });
    
    console.log(`\nEncontrados ${products.length} produtos\n`);
    
    // Tentar salvar cada um
    for (const product of products) {
      console.log(`Salvando: ${product.name}`);
      
      try {
        // Primeiro verificar se existe
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('link', product.link)
          .single();
        
        if (existing) {
          // UPDATE
          const { error } = await supabase
            .from('products')
            .update({
              name: product.name,
              image_url: product.image_url,
              category: product.category,
              subcategory: product.subcategory,
              updated_at: new Date().toISOString()
            })
            .eq('link', product.link);
          
          if (error) {
            console.error(`  ❌ Erro UPDATE: ${error.message}`);
          } else {
            console.log(`  ✅ Atualizado`);
          }
        } else {
          // INSERT
          const { error } = await supabase
            .from('products')
            .insert(product);
          
          if (error) {
            console.error(`  ❌ Erro INSERT: ${error.message}`);
            if (error.code === '23505') {
              console.log(`  ℹ️ Produto já existe`);
            }
          } else {
            console.log(`  ✅ Inserido`);
          }
        }
      } catch (err) {
        console.error(`  ❌ Erro: ${err.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar testes
console.log('════════════════════════════════');
console.log('🔍 DEBUG DO SALVAMENTO');
console.log('════════════════════════════════\n');

testSave().then(() => {
  return scrapeAndSave();
}).then(() => {
  console.log('\n✅ Teste completo!');
});