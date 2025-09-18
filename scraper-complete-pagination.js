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
      'Estantes': ['estante', 'bookshelf', 'prateleira'],
      'Aparadores': ['aparador', 'sideboard', 'buffet'],
      'Camas': ['cama', 'bed'],
      'Armários': ['armário', 'armario', 'closet', 'guarda-roupa']
    }
  },
  'Iluminação': {
    keywords: {
      'Pendentes': ['pendente', 'pendant'],
      'Luminárias de Mesa': ['luminária de mesa', 'abajur', 'table lamp'],
      'Luminárias de Piso': ['luminária de piso', 'floor lamp'],
      'Arandelas': ['arandela', 'wall'],
      'Plafons': ['plafon', 'ceiling'],
      'Lustres': ['lustre', 'chandelier'],
      'Spots': ['spot', 'spotlight']
    }
  },
  'Acessórios de Decoração': {
    keywords: {
      'Vasos': ['vaso', 'vase'],
      'Quadros': ['quadro', 'picture', 'frame'],
      'Esculturas': ['escultura', 'sculpture'],
      'Espelhos': ['espelho', 'mirror'],
      'Almofadas': ['almofada', 'pillow', 'cushion'],
      'Objetos': ['objeto', 'decor']
    }
  },
  'Louças e Metais': {
    keywords: {
      'Torneiras': ['torneira', 'tap', 'faucet'],
      'Cubas': ['cuba', 'sink', 'bowl'],
      'Metais': ['metal', 'registro', 'válvula'],
      'Louças': ['louça', 'vaso sanitário', 'bacia']
    }
  },
  'Eletros': {
    keywords: {
      'Geladeiras': ['geladeira', 'refrigerador', 'fridge'],
      'Fogões': ['fogão', 'stove', 'cooktop'],
      'Micro-ondas': ['microondas', 'micro-ondas', 'microwave'],
      'Lava-louças': ['lava', 'dishwasher'],
      'Coifas': ['coifa', 'hood']
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

async function fetchWithScraperAPI(url, retries = 5) {
  const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`    🌐 Tentativa ${attempt}/${retries}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // 90 segundos timeout

      const response = await fetch(apiUrl, {
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        // Se for 401 (não autorizado), verificar API key
        if (response.status === 401) {
          console.error(`    ❌ API Key inválida ou expirada`);
          // Continuar tentando com próximas páginas
          return '';
        }
        // Se for 429 (rate limit), aguardar mais tempo
        if (response.status === 429) {
          console.log(`    ⏳ Rate limit atingido, aguardando 3 minutos...`);
          await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutos
          continue;
        }
        // Se for 500+ (erro servidor), tentar novamente
        if (response.status >= 500) {
          console.log(`    ⚠️ Erro no servidor (${response.status}), tentando novamente...`);
          await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minuto
          continue;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      console.log(`    ✅ HTML recebido (${html.length} caracteres)`);
      return html;

    } catch (error) {
      console.error(`    ⚠️ Erro na tentativa ${attempt}: ${error.message}`);

      // Se for a última tentativa, retornar HTML vazio ao invés de parar
      if (attempt === retries) {
        console.error(`    ❌ Todas as ${retries} tentativas falharam para: ${url}`);
        console.log(`    ⏭️ Continuando com próxima página...`);
        return ''; // Retorna HTML vazio para continuar o processo
      }

      // Aguardar 2 minutos antes de tentar novamente
      console.log(`    ⏳ Aguardando 2 minutos antes da tentativa ${attempt + 1}...`);
      await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutos
    }
  }

  return ''; // Fallback caso todas as tentativas falhem
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
  try {
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
  } catch (err) {
    // Se houver erro ao salvar, apenas logar e continuar
    console.log(`    ⚠️ Erro ao salvar produto: ${err.message}`);
    return { updated: false, inserted: false, error: err };
  }
}

async function scrapePage(url, category) {
  console.log(`  📄 Processando: ${url}`);

  try {
    const html = await fetchWithScraperAPI(url);

    // Se não conseguiu obter HTML (erro na API), retornar vazio mas continuar
    if (!html || html.length === 0) {
      console.log(`    ⚠️ Página vazia ou erro na API, continuando...`);
      return { products: [], nextPageUrl: null, totalPages: 1 };
    }

    const $ = cheerio.load(html);

    const products = [];
    const processedLinks = new Set(); // Para evitar duplicados na mesma página

    // Extrair produtos - estrutura correta: .col-md-4.detail-product > .product-container
    $('.col-md-4.detail-product').each((index, element) => {
      const $el = $(element);
      const $container = $el.find('.product-container');

      // Nome do produto - está em .info h2
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

      // Link - está no <a> com classe "product photo product-item-photo"
      let link = '';
      const $linkEl = $container.find('a.product.photo.product-item-photo, a.product-item-photo');
      if ($linkEl.length > 0) {
        link = $linkEl.attr('href') || '';
      }
      // Se não achou, tentar qualquer link com href para .html
      if (!link) {
        const $anyLink = $container.find('a[href*=".html"]').not('[href*="?"]').first();
        if ($anyLink.length > 0) {
          link = $anyLink.attr('href') || '';
        }
      }
      const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

      // Evitar processar o mesmo link múltiplas vezes
      if (processedLinks.has(fullLink)) {
        return;
      }
      if (fullLink) processedLinks.add(fullLink);

      // Imagem - está dentro do container
      let imageUrl = '';
      const $img = $container.find('img').first();
      if ($img.length > 0) {
        imageUrl = $img.attr('src') || $img.attr('data-src') || '';
      }

      // Validar que temos dados mínimos
      if (name && name.length > 0 && name !== 'undefined') {
        const subcategory = inferSubcategory(name, category);

        products.push({
          name: name.substring(0, 200),
          image_url: imageUrl,
          link: fullLink || `https://casoca.com.br/produto/${Date.now()}-${index}`,
          category: category,
          subcategory: subcategory
        });
      }
    });

    // Fallback: tentar com seletor .product caso não encontre nada
    if (products.length === 0) {
      $('.product').each((index, element) => {
        const $el = $(element);
        const name = $el.find('.product-text strong').text().trim() ||
                    $el.find('strong').text().trim() ||
                    $el.text().trim().split('\n')[0];

        const link = $el.find('a[href*=".html"]').not('[href*="?"]').first().attr('href') || '';
        const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

        if (processedLinks.has(fullLink)) return;
        if (fullLink) processedLinks.add(fullLink);

        const img = $el.find('img').first();
        const imageUrl = img.attr('src') || img.attr('data-src') || '';

        if (name && name.length > 0) {
          const subcategory = inferSubcategory(name, category);

          products.push({
            name: name.substring(0, 200),
            image_url: imageUrl,
            link: fullLink || `https://casoca.com.br/produto/${Date.now()}-${index}`,
            category: category,
            subcategory: subcategory
          });
        }
      });
    }

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
    { name: 'Acessórios de Decoração', url: 'https://casoca.com.br/acessorios-de-decoracao.html' },
    { name: 'Louças e Metais', url: 'https://casoca.com.br/loucas-e-metais.html' },
    { name: 'Eletros', url: 'https://casoca.com.br/eletros.html' },
    { name: 'Portas e Janelas', url: 'https://casoca.com.br/portas-e-janelas.html' },
    { name: 'Escritório', url: 'https://casoca.com.br/escritorio.html' },
    { name: 'Quarto Infantil', url: 'https://casoca.com.br/quarto-infantil.html' },
    { name: 'Móveis para Área Externa', url: 'https://casoca.com.br/moveis/moveis-para-area-externa.html' },
    { name: 'Cortinas e Persianas', url: 'https://casoca.com.br/acessorios-de-decoracao/cortinas-e-persianas.html' },
    { name: 'Vegetação', url: 'https://casoca.com.br/vegetacao.html' },
    { name: 'Papéis de Parede', url: 'https://casoca.com.br/revestimentos/revestimentos-de-parede/papeis-de-parede.html' },
    { name: 'Tapetes', url: 'https://casoca.com.br/acessorios-de-decoracao/tapetes.html' }
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