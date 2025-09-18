import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function scrapeCasoca() {
  let browser;

  try {
    console.log('🚀 Iniciando scraper Casoca\n');
    console.log('════════════════════════════════════\n');

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // Configurar user agent mais realista
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Adicionar headers extras
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
    });

    const categories = [
      { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
      { name: 'Decoração', url: 'https://casoca.com.br/decoracao.html' },
      { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' }
    ];

    let totalProducts = 0;

    for (const category of categories) {
      console.log(`📁 Processando categoria: ${category.name}`);

      await page.goto(category.url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Aguardar Cloudflare
      console.log('⏳ Aguardando página carregar...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Extrair produtos
      const products = await page.evaluate((categoryName) => {
        const items = [];
        const productElements = document.querySelectorAll('.product');

        productElements.forEach((element) => {
          try {
            // Tentar diferentes seletores para o nome
            const name = element.querySelector('h3')?.textContent?.trim() ||
                        element.querySelector('h4')?.textContent?.trim() ||
                        element.querySelector('.product-name')?.textContent?.trim() ||
                        element.querySelector('a')?.textContent?.trim() ||
                        element.textContent?.trim().split('\n')[0];

            // Tentar diferentes seletores para a imagem
            const img = element.querySelector('img');
            const imageUrl = img?.src || img?.dataset?.src || '';

            // Tentar pegar o link
            const link = element.querySelector('a')?.href || '';

            // Tentar pegar o preço se existir
            const priceText = element.querySelector('.price')?.textContent ||
                             element.querySelector('[class*="price"]')?.textContent || '';

            const price = priceText ? parseFloat(priceText.replace(/[^0-9,]/g, '').replace(',', '.')) : null;

            if (name && name !== '') {
              items.push({
                name: name.substring(0, 200),
                image_url: imageUrl,
                product_url: link || `https://casoca.com.br/produto/${Date.now()}`
              });
            }
          } catch (error) {
            console.error('Erro ao extrair produto:', error);
          }
        });

        return items;
      }, category.name);

      console.log(`✅ Encontrados ${products.length} produtos em ${category.name}`);

      // Salvar no Supabase
      if (products.length > 0) {
        console.log(`💾 Salvando produtos no Supabase...`);

        for (const product of products.slice(0, 10)) { // Limitar a 10 por categoria para teste
          try {
            const { data, error } = await supabase
              .from('products')
              .upsert({
                name: product.name,
                image_url: product.image_url,
                product_url: product.product_url
              }, {
                onConflict: 'product_url'
              });

            if (error) {
              console.error('Erro ao salvar produto:', error);
            } else {
              totalProducts++;
            }
          } catch (error) {
            console.error('Erro:', error);
          }
        }
      }

      console.log('');

      // Aguardar entre categorias para evitar bloqueio
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('════════════════════════════════════');
    console.log(`📊 TOTAL: ${totalProducts} produtos salvos no Supabase`);
    console.log('════════════════════════════════════');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n👋 Scraper finalizado!');
  }
}

// Executar
scrapeCasoca();