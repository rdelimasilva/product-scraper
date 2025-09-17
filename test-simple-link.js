import puppeteer from 'puppeteer';

async function testSimpleLink() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null
    });

    const page = await browser.newPage();

    console.log('🔍 TESTE SIMPLES DE LINKS\n');
    console.log('════════════════════════════════════════════════\n');

    // Teste 1: Acessar diretamente um link de produto
    console.log('📍 TESTE 1: Acesso direto ao link do produto');
    const directLink = 'https://casoca.com.br/poltrona-sempre-oggi-rodrigo-laureano.html';
    console.log(`URL: ${directLink}\n`);

    try {
      const response = await page.goto(directLink, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      console.log(`Status HTTP: ${response.status()}`);
      console.log(`URL final: ${page.url()}`);

      // Verificar se é a página do produto
      const title = await page.title();
      console.log(`Título da página: ${title}`);

      // Verificar se tem conteúdo de produto
      const hasProductContent = await page.evaluate(() => {
        // Procurar por elementos típicos de página de produto
        const selectors = [
          '.product-info-main',
          '.product-details',
          '#product-details',
          '[class*="product-info"]',
          '[class*="product-detail"]',
          'h1'
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            return {
              found: true,
              selector: selector,
              text: element.textContent.trim().substring(0, 100)
            };
          }
        }

        // Se não encontrou, retornar o que tem na página
        return {
          found: false,
          bodyText: document.body.textContent.trim().substring(0, 200)
        };
      });

      if (hasProductContent.found) {
        console.log(`\n✅ Conteúdo do produto encontrado!`);
        console.log(`Seletor: ${hasProductContent.selector}`);
        console.log(`Texto: ${hasProductContent.text}`);
      } else {
        console.log(`\n❌ Conteúdo do produto NÃO encontrado`);
        console.log(`Conteúdo da página: ${hasProductContent.bodyText}`);
      }

    } catch (error) {
      console.log(`❌ Erro ao acessar: ${error.message}`);
    }

    // Teste 2: Navegar pelo site e depois copiar o link
    console.log('\n\n📍 TESTE 2: Navegação normal pelo site');

    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('.col-md-4.col-sm-6.detail-product', { timeout: 10000 });

    // Clicar no primeiro produto
    const firstProduct = await page.$('.col-md-4.col-sm-6.detail-product a');
    if (firstProduct) {
      await firstProduct.click();
      await new Promise(resolve => setTimeout(resolve, 5000));

      const productPageUrl = page.url();
      console.log(`URL após clicar no produto: ${productPageUrl}`);

      // Verificar conteúdo
      const productTitle = await page.$eval('h1', el => el.textContent.trim()).catch(() => 'Não encontrado');
      console.log(`Título do produto: ${productTitle}`);

      // Agora tentar acessar essa URL diretamente em nova aba
      console.log('\n📍 TESTE 3: Abrindo URL copiada em nova aba');

      const newPage = await browser.newPage();
      try {
        const response = await newPage.goto(productPageUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        console.log(`Status na nova aba: ${response.status()}`);
        console.log(`URL final na nova aba: ${newPage.url()}`);

        const newTitle = await newPage.title();
        console.log(`Título na nova aba: ${newTitle}`);

      } catch (error) {
        console.log(`❌ Erro na nova aba: ${error.message}`);
      }
    }

    console.log('\n📸 Screenshot salvo: test-simple-link.png');
    await page.screenshot({ path: 'test-simple-link.png' });

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n✅ Teste concluído');
  }
}

testSimpleLink();