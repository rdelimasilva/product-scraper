import puppeteer from 'puppeteer';

async function debugWithPuppeteer() {
  let browser;

  try {
    console.log('🚀 Debugando com Puppeteer direto...\n');

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('📍 Acessando: https://casoca.com.br/iluminacao.html');
    await page.goto('https://casoca.com.br/iluminacao.html', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Aguardar Cloudflare
    console.log('⏳ Aguardando página carregar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const title = await page.title();
    console.log('📄 Título:', title);

    // Testar seletores
    const selectors = [
      '.product',
      '.item',
      '.product-item',
      'article',
      '.card',
      'li.item',
      '.products-grid .item',
      '.category-products .item',
      'div[class*="product"]',
      '.col-md-4',
      '.col-md-3'
    ];

    console.log('\n🧪 Testando seletores:');
    for (const selector of selectors) {
      const count = await page.$$eval(selector, elements => elements.length);
      if (count > 0) {
        console.log(`  ✅ ${selector}: ${count} elementos`);

        // Pegar exemplo
        const example = await page.$eval(selector, el => {
          return {
            text: el.textContent?.trim().substring(0, 100),
            hasImage: !!el.querySelector('img'),
            hasLink: !!el.querySelector('a'),
            imgSrc: el.querySelector('img')?.src
          };
        });
        console.log(`     Exemplo:`, example);
      }
    }

    // Procurar estrutura dos produtos
    console.log('\n📦 Analisando estrutura da página:');

    const pageInfo = await page.evaluate(() => {
      // Procurar containers de produtos
      const possibleContainers = [];

      // Procurar por listas
      document.querySelectorAll('ul, ol, div[class*="grid"], div[class*="list"]').forEach(container => {
        const images = container.querySelectorAll('img');
        if (images.length > 5) {
          possibleContainers.push({
            tag: container.tagName,
            class: container.className,
            id: container.id,
            imageCount: images.length,
            firstImage: images[0]?.src
          });
        }
      });

      // Contar elementos com imagens
      const imagesWithParents = [];
      document.querySelectorAll('img').forEach(img => {
        const parent = img.closest('li, article, div');
        if (parent) {
          const className = parent.className || 'sem-classe';
          if (!imagesWithParents.find(item => item.class === className)) {
            imagesWithParents.push({
              class: className,
              count: document.querySelectorAll(`.${className.split(' ')[0]}`).length
            });
          }
        }
      });

      return {
        title: document.title,
        bodyClasses: document.body.className,
        possibleContainers,
        imagesWithParents: imagesWithParents.filter(item => item.count > 5)
      };
    });

    console.log('  Informações da página:', JSON.stringify(pageInfo, null, 2));

    // Salvar screenshot
    await page.screenshot({ path: 'debug-page.png', fullPage: false });
    console.log('\n💾 Screenshot salvo como debug-page.png');

    // Tentar extrair produtos de qualquer forma
    console.log('\n🔍 Tentando extrair produtos manualmente:');

    const products = await page.evaluate(() => {
      const items = [];

      // Procurar por qualquer elemento com imagem e texto
      document.querySelectorAll('img').forEach(img => {
        const container = img.closest('li, article, div, a');
        if (container) {
          // Procurar texto próximo
          const possibleTitle = container.querySelector('h1, h2, h3, h4, h5, span, p, a[title]');
          const link = container.querySelector('a')?.href || container.closest('a')?.href;

          if (possibleTitle) {
            items.push({
              title: possibleTitle.textContent?.trim(),
              image: img.src,
              link: link
            });
          }
        }
      });

      return items.slice(0, 10); // Primeiros 10
    });

    console.log(`  Produtos encontrados: ${products.length}`);
    products.forEach((p, i) => {
      console.log(`  ${i+1}. ${p.title?.substring(0, 50)}`);
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n✅ Debug completo!');
  }
}

debugWithPuppeteer();