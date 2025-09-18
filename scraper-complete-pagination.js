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

// Mapeamento de subcategorias
const SUBCATEGORY_MAPPINGS = {
  'Móveis': {
    keywords: {
      'Poltronas': ['poltrona', 'armchair'],
      'Cadeiras': ['cadeira', 'chair'],
      'Mesas': ['mesa', 'table', 'escrivaninha', 'desk'],
      'Sofás': ['sofá', 'sofa', 'couch'],
      'Banquetas': ['banqueta', 'banquete', 'stool'],
      'Bancos': ['banco', 'bench'],
      'Estantes': ['estante', 'bookshelf', 'prateleira', 'shelf'],
      'Aparadores': ['aparador', 'sideboard', 'buffet'],
      'Camas': ['cama', 'bed'],
      'Armários': ['armário', 'armario', 'closet', 'guarda-roupa', 'wardrobe']
    }
  },
  'Iluminação': {
    keywords: {
      'Pendentes': ['pendente', 'pendant'],
      'Luminárias de Mesa': ['luminária de mesa', 'luminaria de mesa', 'abajur', 'table lamp'],
      'Luminárias de Piso': ['luminária de piso', 'luminaria de piso', 'floor lamp'],
      'Arandelas': ['arandela', 'wall lamp', 'wall light'],
      'Plafons': ['plafon', 'ceiling'],
      'Lustres': ['lustre', 'chandelier'],
      'Spots': ['spot', 'spotlight'],
      'Fitas LED': ['fita', 'led strip', 'strip'],
      'Postes': ['poste', 'pole light'],
      'Refletores': ['refletor', 'reflector', 'flood']
    }
  }
};

function inferSubcategory(productName, category) {
  const mapping = SUBCATEGORY_MAPPINGS[category];
  if (!mapping) return 'Outros';

  const nameLower = productName.toLowerCase();

  for (const [subcategory, keywords] of Object.entries(mapping.keywords)) {
    for (const keyword of keywords) {
      if (nameLower.includes(keyword)) {
        return subcategory;
      }
    }
  }

  return 'Outros';
}

async function fetchWithScraperAPI(url) {
  const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;

  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

async function checkProductExists(link) {
  const { data, error } = await supabase
    .from('products')
    .select('id')
    .eq('link', link)
    .single();

  return !!data;
}

async function saveOrUpdateProduct(product, skipExisting = false) {
  // Primeiro verificar se existe
  const exists = await checkProductExists(product.link);

  if (exists) {
    if (skipExisting) {
      // Se configurado para pular existentes, apenas retorna
      return { updated: false, inserted: false, skipped: true, error: null };
    }

    // Atualizar produto existente
    const { data, error } = await supabase
      .from('products')
      .update({
        name: product.name,
        image_url: product.image_url,
        category: product.category,
        subcategory: product.subcategory,
        updated_at: new Date().toISOString()
      })
      .eq('link', product.link);

    return { updated: !error, inserted: false, skipped: false, error };
  } else {
    // Inserir novo produto
    const { data, error } = await supabase
      .from('products')
      .insert({
        name: product.name,
        image_url: product.image_url,
        link: product.link,
        category: product.category,
        subcategory: product.subcategory
      });

    return { updated: false, inserted: !error, error };
  }
}

async function scrapePage(url, category) {
  console.log(`  📄 Processando: ${url}`);

  try {
    const html = await fetchWithScraperAPI(url);
    const $ = cheerio.load(html);

    const products = [];
    const processedLinks = new Set(); // Para evitar duplicados na mesma página

    // Extrair produtos
    $('.product').each((index, element) => {
      const $el = $(element);

      // Extrair nome
      const name = $el.find('h3').text().trim() ||
                  $el.find('h4').text().trim() ||
                  $el.find('.product-name').text().trim() ||
                  $el.find('a[title]').attr('title') ||
                  $el.find('a').first().text().trim();

      // Extrair link
      const link = $el.find('a').first().attr('href') || '';
      const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

      // Evitar processar o mesmo link múltiplas vezes
      if (processedLinks.has(fullLink)) {
        return;
      }
      processedLinks.add(fullLink);

      // Extrair imagem
      const img = $el.find('img').first();
      const imageUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';

      if (name && name.length > 0 && fullLink) {
        const subcategory = inferSubcategory(name, category);

        products.push({
          name: name.substring(0, 200),
          image_url: imageUrl,
          link: fullLink,
          category: category,
          subcategory: subcategory
        });
      }
    });

    // Procurar link para próxima página
    let nextPageUrl = null;

    // Tentar diferentes seletores de paginação
    const nextLink = $('a.next').attr('href') ||
                    $('.pagination a:contains("Próximo")').attr('href') ||
                    $('.pagination a:contains("Next")').attr('href') ||
                    $('a[rel="next"]').attr('href') ||
                    $('.pages .next').attr('href');

    if (nextLink) {
      nextPageUrl = nextLink.startsWith('http') ? nextLink : `https://casoca.com.br${nextLink}`;
    }

    // Verificar se há números de página
    const pageNumbers = $('.pagination a, .pages a').map((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text();
      if (href && /^\d+$/.test(text)) {
        return { number: parseInt(text), url: href };
      }
    }).get();

    return {
      products,
      nextPageUrl,
      totalPages: pageNumbers.length > 0 ? Math.max(...pageNumbers.map(p => p.number)) : 1
    };

  } catch (error) {
    console.error(`    ❌ Erro ao processar página: ${error.message}`);
    return { products: [], nextPageUrl: null, totalPages: 1 };
  }
}

async function scrapeCategory(category, maxPages = 500) { // Aumentado para 500 páginas
  console.log(`\n📁 CATEGORIA: ${category.name}`);
  console.log('════════════════════════════════════\n');

  let currentUrl = category.url;
  let pageNumber = 1;
  let totalProducts = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let consecutiveEmptyPages = 0; // Contador de páginas vazias consecutivas
  const subcategoriesCount = {};

  while (currentUrl && pageNumber <= maxPages) {
    console.log(`\n  📖 Página ${pageNumber}:`);

    const { products, nextPageUrl, totalPages } = await scrapePage(currentUrl, category.name);

    console.log(`    ✅ ${products.length} produtos encontrados`);

    if (products.length === 0) {
      consecutiveEmptyPages++;
      console.log(`    ⚠️ Página vazia (${consecutiveEmptyPages} consecutivas)`);

      // Se encontrar 3 páginas vazias consecutivas, parar
      if (consecutiveEmptyPages >= 3) {
        console.log('    🛑 3 páginas vazias consecutivas, finalizando categoria');
        break;
      }
    } else {
      consecutiveEmptyPages = 0; // Reset contador se encontrar produtos
    }

    // Salvar produtos
    for (const product of products) {
      try {
        const result = await saveOrUpdateProduct(product);

        if (result.inserted) {
          totalInserted++;
        } else if (result.updated) {
          totalUpdated++;
        }

        if (result.error) {
          console.error(`    ❌ Erro ao salvar: ${result.error.message}`);
          totalErrors++;
        }

        // Contar subcategorias
        if (!subcategoriesCount[product.subcategory]) {
          subcategoriesCount[product.subcategory] = 0;
        }
        subcategoriesCount[product.subcategory]++;

      } catch (err) {
        console.error(`    ❌ Erro: ${err.message}`);
        totalErrors++;
      }
    }

    totalProducts += products.length;

    console.log(`    💾 Novos: ${totalInserted}, Atualizados: ${totalUpdated}, Erros: ${totalErrors}`);

    // Mostrar progresso a cada 10 páginas
    if (pageNumber % 10 === 0) {
      console.log(`\n  📊 Progresso: ${pageNumber} páginas processadas, ${totalProducts} produtos no total\n`);
    }

    // Verificar próxima página
    if (nextPageUrl && currentUrl !== nextPageUrl) {
      currentUrl = nextPageUrl;
      pageNumber++;

      // Aguardar entre páginas (menos tempo se tiver muitas páginas)
      const waitTime = pageNumber > 50 ? 1000 : 2000; // 1 segundo após 50 páginas
      console.log(`    ⏳ Aguardando ${waitTime/1000}s antes da próxima página...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      // Tentar construir URL da próxima página manualmente
      if (pageNumber === 1 && products.length > 0) {
        // Tentar padrão comum de paginação
        const nextUrl = `${category.url}?p=${pageNumber + 1}`;
        console.log(`    🔍 Tentando página ${pageNumber + 1} com URL construída...`);

        const testResult = await scrapePage(nextUrl, category.name);
        if (testResult.products.length > 0) {
          currentUrl = nextUrl;
          pageNumber++;

          // Processar produtos da página teste
          for (const product of testResult.products) {
            const result = await saveOrUpdateProduct(product);
            if (result.inserted) totalInserted++;
            else if (result.updated) totalUpdated++;
            if (result.error) totalErrors++;
          }

          totalProducts += testResult.products.length;
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  // Resumo da categoria
  console.log(`\n  📊 Resumo de ${category.name}:`);
  console.log(`     • Total processados: ${totalProducts}`);
  console.log(`     • Novos produtos: ${totalInserted}`);
  console.log(`     • Produtos atualizados: ${totalUpdated}`);
  console.log(`     • Erros: ${totalErrors}`);
  console.log(`     • Páginas processadas: ${pageNumber}`);

  console.log('\n  📋 Distribuição por subcategoria:');
  for (const [subcat, count] of Object.entries(subcategoriesCount)) {
    console.log(`     • ${subcat}: ${count} produtos`);
  }

  return {
    totalProducts,
    totalInserted,
    totalUpdated,
    totalErrors,
    subcategoriesCount
  };
}

async function scrapeAllCategories() {
  console.log('🚀 SCRAPER COMPLETO COM PAGINAÇÃO - CASOCA\n');
  console.log('════════════════════════════════════════════\n');
  console.log('📋 Configurações:');
  console.log('   • Scraper API com paginação completa');
  console.log('   • Verificação de duplicados');
  console.log('   • Subcategorias por inferência');
  console.log('   • Até 500 páginas por categoria');
  console.log('   • Para automaticamente após 3 páginas vazias\n');

  const categories = [
    { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
    { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' },
    { name: 'Decoração', url: 'https://casoca.com.br/decoracao.html' },
    { name: 'Mesa Posta', url: 'https://casoca.com.br/mesa-posta.html' }
  ];

  let grandTotalProducts = 0;
  let grandTotalInserted = 0;
  let grandTotalUpdated = 0;
  let grandTotalErrors = 0;

  for (const category of categories) {
    try {
      const result = await scrapeCategory(category, 500); // Até 500 páginas por categoria

      grandTotalProducts += result.totalProducts;
      grandTotalInserted += result.totalInserted;
      grandTotalUpdated += result.totalUpdated;
      grandTotalErrors += result.totalErrors;

      // Aguardar entre categorias
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.error(`\n❌ Erro fatal na categoria ${category.name}: ${error.message}`);
    }
  }

  // Resumo final
  console.log('\n════════════════════════════════════════════');
  console.log('📊 RESUMO FINAL DO SCRAPING:');
  console.log(`   • Total de produtos processados: ${grandTotalProducts}`);
  console.log(`   • Novos produtos inseridos: ${grandTotalInserted}`);
  console.log(`   • Produtos atualizados: ${grandTotalUpdated}`);
  console.log(`   • Total de erros: ${grandTotalErrors}`);
  console.log(`   • Taxa de sucesso: ${((1 - grandTotalErrors / grandTotalProducts) * 100).toFixed(1)}%`);
  console.log('════════════════════════════════════════════');

  console.log('\n✅ Scraper finalizado com sucesso!\n');
}

// Executar
scrapeAllCategories().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});