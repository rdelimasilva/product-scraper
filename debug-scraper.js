import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

async function debugPage(url) {
  console.log(`\n🔍 Debugando: ${url}\n`);

  try {
    // Buscar página com Scraper API
    const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    console.log('📄 Título da página:', $('title').text());
    console.log('════════════════════════════════════\n');

    // Testar diferentes seletores
    const selectors = [
      '.product',
      '.item',
      '.product-item',
      'article',
      '.card',
      '.grid-item',
      '.col-md-4',
      '.col-sm-6',
      '.detail-product',
      'div[class*="product"]',
      'div[class*="item"]',
      'li.item',
      '.products-grid .item',
      '.category-products .item'
    ];

    console.log('🧪 Testando seletores:\n');
    for (const selector of selectors) {
      const count = $(selector).length;
      if (count > 0) {
        console.log(`✅ ${selector}: ${count} elementos encontrados`);

        // Mostrar primeiro elemento como exemplo
        const first = $(selector).first();
        const text = first.text().trim().substring(0, 100);
        console.log(`   Exemplo: "${text}..."\n`);
      }
    }

    // Procurar por imagens que podem ser produtos
    console.log('🖼️ Procurando estruturas com imagens:\n');
    const imgContainers = $('img').parent().parent();
    console.log(`   Total de containers com imagens: ${imgContainers.length}`);

    // Analisar estrutura de um possível produto
    const possibleProduct = $('img').first().closest('div, article, li');
    if (possibleProduct.length > 0) {
      console.log('\n📦 Estrutura de possível produto:');
      console.log('   Tag:', possibleProduct.prop('tagName'));
      console.log('   Classes:', possibleProduct.attr('class'));
      console.log('   ID:', possibleProduct.attr('id') || 'sem id');

      // Procurar título/nome
      const possibleTitle = possibleProduct.find('h1, h2, h3, h4, h5, a[title]');
      if (possibleTitle.length > 0) {
        console.log('   Título encontrado:', possibleTitle.first().text().trim());
      }

      // Procurar link
      const possibleLink = possibleProduct.find('a[href*="produto"], a[href*="product"]').first();
      if (possibleLink.length > 0) {
        console.log('   Link encontrado:', possibleLink.attr('href'));
      }
    }

    // Verificar se há paginação
    console.log('\n📄 Paginação:');
    const paginationSelectors = [
      '.pagination',
      '.pages',
      'a[href*="?p="]',
      'a.next',
      '.toolbar-bottom'
    ];

    for (const selector of paginationSelectors) {
      const found = $(selector);
      if (found.length > 0) {
        console.log(`   ✅ ${selector}: encontrado`);
      }
    }

    // Salvar HTML para análise
    console.log('\n💾 Salvando HTML para análise...');
    const fs = await import('fs');
    fs.writeFileSync('debug-page.html', html);
    console.log('   Arquivo salvo como: debug-page.html');

    // Mostrar parte do HTML para ver a estrutura
    const bodyHtml = $('body').html();
    if (bodyHtml) {
      const cleanHtml = bodyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                 .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                                 .substring(0, 2000);
      console.log('\n📝 Amostra do HTML (primeiros 2000 chars sem scripts/styles):');
      console.log(cleanHtml);
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Testar com a página de móveis
debugPage('https://casoca.com.br/moveis.html').then(() => {
  console.log('\n✅ Debug completo!\n');
});