import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

async function testScraperAPI() {
  try {
    console.log('🧪 Testando Scraper API\n');
    console.log('API Key:', SCRAPER_API_KEY ? '✅ Configurada' : '❌ Faltando');
    
    const url = 'https://casoca.com.br/iluminacao.html';
    const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
    
    console.log('\n📍 Buscando:', url);
    console.log('⏳ Aguardando resposta...');
    
    const response = await fetch(apiUrl, {
      timeout: 60000
    });
    
    console.log('\n📊 Status:', response.status);
    console.log('📊 Status Text:', response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Erro:', errorText);
      return;
    }
    
    const html = await response.text();
    console.log('✅ HTML recebido:', html.length, 'caracteres');
    
    const $ = cheerio.load(html);
    
    // Testar seletores
    console.log('\n🔍 Testando seletores:');
    const productCount = $('.product').length;
    console.log('  .product:', productCount, 'elementos');
    
    if (productCount > 0) {
      console.log('\n📦 Primeiros 3 produtos:');
      $('.product').slice(0, 3).each((i, el) => {
        const $el = $(el);
        const title = $el.find('.product-text strong').text().trim() ||
                     $el.find('strong').text().trim() ||
                     $el.text().trim().split('\n')[0];
        const img = $el.find('img').attr('src');
        const link = $el.find('a').attr('href');
        
        console.log(`\n  ${i+1}. ${title || 'Sem título'}`);
        console.log(`     Imagem: ${img ? '✅' : '❌'}`);
        console.log(`     Link: ${link ? '✅' : '❌'}`);
      });
    }
    
    // Salvar HTML para análise
    const fs = await import('fs');
    fs.writeFileSync('test-scraper-api-result.html', html);
    console.log('\n💾 HTML salvo em test-scraper-api-result.html');
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message);
    console.error('Detalhes:', error);
  }
}

testScraperAPI();