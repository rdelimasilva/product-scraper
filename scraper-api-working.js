import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

async function fetchWithScraperAPI(url) {
  const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;

  console.log(`🔗 Buscando: ${url}`);

  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

async function scrapeCasoca() {
  try {
    console.log('🚀 Iniciando scraper com Scraper API\n');
    console.log('════════════════════════════════════\n');

    const categories = [
      { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
      { name: 'Decoração', url: 'https://casoca.com.br/decoracao.html' },
      { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' },
      { name: 'Mesa Posta', url: 'https://casoca.com.br/mesa-posta.html' },
      { name: 'Têxtil', url: 'https://casoca.com.br/textil.html' }
    ];

    let totalProducts = 0;
    let totalSaved = 0;

    for (const category of categories) {
      console.log(`\n📁 Processando categoria: ${category.name}`);

      try {
        const html = await fetchWithScraperAPI(category.url);
        const $ = cheerio.load(html);

        const products = [];

        // Procurar produtos com o seletor .product
        $('.product').each((index, element) => {
          const $el = $(element);

          // Extrair nome
          const name = $el.find('h3').text().trim() ||
                      $el.find('h4').text().trim() ||
                      $el.find('.product-name').text().trim() ||
                      $el.find('a').first().text().trim() ||
                      $el.text().trim().split('\n')[0];

          // Extrair imagem
          const img = $el.find('img').first();
          const imageUrl = img.attr('src') || img.attr('data-src') || '';

          // Extrair link
          const link = $el.find('a').first().attr('href') || '';
          const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

          if (name && name.length > 0) {
            products.push({
              name: name.substring(0, 200),
              image_url: imageUrl,
              link: fullLink || `https://casoca.com.br/produto/${Date.now()}-${index}`,
              category: category.name
            });
          }
        });

        // Se não encontrou com .product, tentar outros seletores
        if (products.length === 0) {
          $('.col-md-4.col-sm-6.detail-product, .detail-product, .item, article.product').each((index, element) => {
            const $el = $(element);

            const name = $el.find('h3, h4, .title, .name').first().text().trim() ||
                        $el.find('a').first().text().trim();

            const img = $el.find('img').first();
            const imageUrl = img.attr('src') || img.attr('data-src') || '';

            const link = $el.find('a').first().attr('href') || '';
            const fullLink = link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '';

            if (name && name.length > 0 && !products.find(p => p.name === name)) {
              products.push({
                name: name.substring(0, 200),
                image_url: imageUrl,
                link: fullLink || `https://casoca.com.br/produto/${Date.now()}-${index}`,
                category: category.name
              });
            }
          });
        }

        console.log(`✅ Encontrados ${products.length} produtos`);
        totalProducts += products.length;

        // Salvar no Supabase
        if (products.length > 0) {
          console.log(`💾 Salvando no Supabase...`);

          for (const product of products.slice(0, 20)) { // Limitar a 20 por categoria
            try {
              const { data, error } = await supabase
                .from('products')
                .insert({
                  name: product.name,
                  image_url: product.image_url,
                  link: product.link,
                  category: product.category
                });

              if (error) {
                console.error('Erro ao salvar:', error.message);
              } else {
                totalSaved++;
              }
            } catch (err) {
              console.error('Erro:', err.message);
            }
          }

          console.log(`✅ ${totalSaved} produtos salvos até agora`);
        }

        // Aguardar entre categorias para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Erro na categoria ${category.name}:`, error.message);
      }
    }

    console.log('\n════════════════════════════════════');
    console.log(`📊 RESUMO FINAL:`);
    console.log(`   Total encontrados: ${totalProducts} produtos`);
    console.log(`   Total salvos: ${totalSaved} produtos`);
    console.log('════════════════════════════════════');

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }

  console.log('\n👋 Scraper finalizado!');
}

// Executar
scrapeCasoca();