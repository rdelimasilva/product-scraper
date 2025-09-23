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

// Mapeamento de subcategorias por categoria
const SUBCATEGORY_MAPPINGS = {
  'Móveis': {
    keywords: {
      'Poltronas': ['poltrona', 'armchair'],
      'Cadeiras': ['cadeira', 'chair'],
      'Mesas': ['mesa', 'table'],
      'Sofás': ['sofá', 'sofa', 'couch'],
      'Banquetas': ['banqueta', 'banquete', 'stool'],
      'Bancos': ['banco', 'bench'],
      'Estantes': ['estante', 'bookshelf', 'prateleira'],
      'Aparadores': ['aparador', 'sideboard'],
      'Camas': ['cama', 'bed'],
      'Armários': ['armário', 'armario', 'closet', 'guarda-roupa']
    },
    maxSubcategories: 10
  },
  'Iluminação': {
    keywords: {
      'Pendentes': ['pendente', 'pendant'],
      'Luminárias de Mesa': ['luminária de mesa', 'abajur', 'table lamp'],
      'Luminárias de Piso': ['luminária de piso', 'floor lamp'],
      'Arandelas': ['arandela', 'wall lamp'],
      'Plafons': ['plafon', 'ceiling'],
      'Lustres': ['lustre', 'chandelier'],
      'Spots': ['spot', 'spotlight'],
      'Fitas LED': ['fita', 'led strip'],
      'Postes': ['poste', 'pole light'],
      'Refletores': ['refletor', 'reflector']
    },
    maxSubcategories: 10
  }
};

// Função para inferir subcategoria baseado no nome
function inferSubcategory(productName, category) {
  const mapping = SUBCATEGORY_MAPPINGS[category];
  if (!mapping) return 'Outros';

  const nameLower = productName.toLowerCase();

  // Procurar por keywords
  for (const [subcategory, keywords] of Object.entries(mapping.keywords)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        return subcategory;
      }
    }
  }

  // Se não encontrou, retorna "Outros"
  return 'Outros';
}

async function fetchWithScraperAPI(url) {
  const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;

  console.log(`  🔗 Buscando: ${url}`);

  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

async function scrapeCasocaProduction() {
  try {
    console.log('🚀 SCRAPER DE PRODUÇÃO - CASOCA\n');
    console.log('════════════════════════════════════\n');
    console.log('📋 Configurações:');
    console.log('   • Usando Scraper API');
    console.log('   • Subcategorias por inferência');
    console.log('   • Máximo 10 subcategorias por categoria\n');
    console.log('════════════════════════════════════\n');

    const categories = [
      { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
      { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' }
    ];

    let totalProducts = 0;
    let totalSaved = 0;
    const subcategoriesCount = {};

    for (const category of categories) {
      console.log(`\n📁 CATEGORIA: ${category.name}`);
      console.log('────────────────────────────────\n');

      try {
        const html = await fetchWithScraperAPI(category.url);
        const $ = cheerio.load(html);

        const products = [];
        subcategoriesCount[category.name] = {};

        // Extrair produtos
        $('.product').each((index, element) => {
          const $el = $(element);

          // Extrair informações
          const name = $el.find('h3').text().trim() ||
                      $el.find('h4').text().trim() ||
                      $el.find('.product-name').text().trim() ||
                      $el.find('a').first().text().trim() ||
                      $el.text().trim().split('\n')[0];

          const img = $el.find('img').first();
          const imageUrl = img.attr('src') || img.attr('data-src') || '';

          const link = $el.find('a').first().attr('href') || '';
          const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

          if (name && name.length > 0) {
            // Inferir subcategoria
            const subcategory = inferSubcategory(name, category.name);

            // Verificar limite de subcategorias
            if (!subcategoriesCount[category.name][subcategory]) {
              subcategoriesCount[category.name][subcategory] = 0;
            }

            const subcatCount = Object.keys(subcategoriesCount[category.name]).length;
            const maxSubcat = SUBCATEGORY_MAPPINGS[category.name]?.maxSubcategories || 10;

            // Se já tem muitas subcategorias e essa é nova, usar "Outros"
            let finalSubcategory = subcategory;
            if (subcatCount >= maxSubcat && !subcategoriesCount[category.name][subcategory]) {
              finalSubcategory = 'Outros';
              if (!subcategoriesCount[category.name]['Outros']) {
                subcategoriesCount[category.name]['Outros'] = 0;
              }
            }

            subcategoriesCount[category.name][finalSubcategory]++;

            products.push({
              name: name.substring(0, 200),
              image_url: imageUrl,
              link: fullLink || `https://casoca.com.br/produto/${Date.now()}-${index}`,
              category: category.name,
              subcategory: finalSubcategory
            });
          }
        });

        console.log(`  ✅ ${products.length} produtos encontrados`);
        totalProducts += products.length;

        // Mostrar distribuição de subcategorias
        console.log('\n  📊 Distribuição por subcategoria:');
        for (const [subcat, count] of Object.entries(subcategoriesCount[category.name])) {
          console.log(`     • ${subcat}: ${count} produtos`);
        }

        // Salvar no Supabase
        if (products.length > 0) {
          console.log(`\n  💾 Salvando no Supabase...`);

          for (const product of products) {
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
                  // Atualizar ao invés de inserir
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
                } else {
                  console.error(`  ❌ Erro: ${error.message}`);
                }
              } else {
                totalSaved++;
              }
            } catch (err) {
              console.error(`  ❌ Erro: ${err.message}`);
            }
          }

          console.log(`  ✅ ${totalSaved} produtos salvos/atualizados`);
        }

        // Aguardar entre categorias
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`\n❌ Erro na categoria ${category.name}: ${error.message}`);
      }
    }

    // Resumo final
    console.log('\n════════════════════════════════════');
    console.log('📊 RESUMO FINAL:');
    console.log(`   • Total encontrados: ${totalProducts} produtos`);
    console.log(`   • Total salvos/atualizados: ${totalSaved} produtos`);

    console.log('\n📋 Subcategorias criadas:');
    for (const [cat, subcats] of Object.entries(subcategoriesCount)) {
      console.log(`\n   ${cat}:`);
      for (const [subcat, count] of Object.entries(subcats)) {
        console.log(`     • ${subcat}: ${count} produtos`);
      }
    }
    console.log('════════════════════════════════════');

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n✅ Scraper finalizado!\n');
}

// Executar
scrapeCasocaProduction();