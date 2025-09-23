import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Testando com Cloudflare...\n');

  const browser = await puppeteer.launch({
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

  console.log('📍 Acessando casoca.com.br...');
  await page.goto('https://casoca.com.br/moveis.html', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('⏳ Aguardando Cloudflare...');

  // Aguardar até o Cloudflare passar (procura por elementos do site real)
  try {
    await page.waitForSelector('body', { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 5000)); // Aguarda 5 segundos extras

    const title = await page.title();
    console.log('📄 Título:', title);

    // Verificar se passou do Cloudflare
    const hasCloudflare = await page.evaluate(() => {
      return document.body.innerText.includes('Just a moment');
    });

    if (hasCloudflare) {
      console.log('⚠️ Ainda no Cloudflare, aguardando mais...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Tentar encontrar produtos
    const products = await page.evaluate(() => {
      // Procurar por qualquer elemento que pareça um produto
      const selectors = [
        '.product', '.item', '.card',
        '[class*="product"]', '[id*="product"]',
        'article', '.grid-item'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          return {
            selector: selector,
            count: elements.length,
            sample: elements[0].innerText.substring(0, 100)
          };
        }
      }

      return null;
    });

    if (products) {
      console.log('✅ Produtos encontrados!');
      console.log('   Seletor:', products.selector);
      console.log('   Quantidade:', products.count);
      console.log('   Amostra:', products.sample);
    } else {
      console.log('❌ Nenhum produto encontrado');

      // Debug: mostrar o que tem na página
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
      console.log('\n📝 Conteúdo da página:', bodyText);
    }

  } catch (error) {
    console.log('❌ Erro:', error.message);
  }

  await browser.close();
  console.log('\n✅ Teste completo!');
})();