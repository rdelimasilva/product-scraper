import puppeteer from 'puppeteer';

async function investigateRealLinks() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Interceptar requisições para ver o que realmente acontece
    await page.setRequestInterception(true);

    const requests = [];
    page.on('request', (request) => {
      if (request.url().includes('casoca.com.br') && !request.url().includes('.jpg') && !request.url().includes('.png')) {
        requests.push({
          url: request.url(),
          method: request.method(),
          headers: request.headers()
        });
      }
      request.continue();
    });

    console.log('🔍 INVESTIGAÇÃO PROFUNDA DOS LINKS REAIS\n');
    console.log('════════════════════════════════════════════════\n');

    // Passo 1: Acessar página inicial
    console.log('📍 PASSO 1: Acessando página inicial...');
    await page.goto('https://casoca.com.br', {
      waitUntil: 'networkidle2'
    });
    console.log('✅ Página inicial carregada\n');

    // Passo 2: Navegar para móveis
    console.log('📍 PASSO 2: Navegando para Móveis...');
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('.col-md-4.col-sm-6.detail-product', { timeout: 10000 });
    console.log('✅ Página de móveis carregada\n');

    // Passo 3: Analisar estrutura completa do produto
    console.log('📍 PASSO 3: Analisando estrutura completa do produto...\n');

    const productData = await page.evaluate(() => {
      const product = document.querySelector('.col-md-4.col-sm-6.detail-product');
      if (!product) return null;

      const data = {
        // Todos os atributos do elemento principal
        elementAttributes: {},

        // Todos os links encontrados
        allLinks: [],

        // Scripts inline
        inlineScripts: [],

        // Data attributes
        dataAttributes: {},

        // Formulários
        forms: []
      };

      // Capturar todos os atributos do elemento
      for (let attr of product.attributes) {
        data.elementAttributes[attr.name] = attr.value;
      }

      // Capturar todos os links de todas as formas
      const allElements = product.querySelectorAll('*');
      allElements.forEach(el => {
        // Verificar href
        if (el.href) {
          data.allLinks.push({
            tag: el.tagName,
            href: el.href,
            getAttribute: el.getAttribute('href'),
            text: el.textContent.trim().substring(0, 30)
          });
        }

        // Verificar data attributes
        if (el.dataset && Object.keys(el.dataset).length > 0) {
          Object.keys(el.dataset).forEach(key => {
            if (el.dataset[key].includes('http') || el.dataset[key].includes('.html')) {
              data.dataAttributes[key] = el.dataset[key];
            }
          });
        }

        // Verificar onclick
        if (el.onclick) {
          data.inlineScripts.push({
            tag: el.tagName,
            onclick: el.onclick.toString()
          });
        }
      });

      // Verificar formulários
      const forms = product.querySelectorAll('form');
      forms.forEach(form => {
        const formData = {
          action: form.action,
          method: form.method,
          inputs: []
        };

        form.querySelectorAll('input').forEach(input => {
          formData.inputs.push({
            name: input.name,
            value: input.value,
            type: input.type
          });
        });

        data.forms.push(formData);
      });

      return data;
    });

    console.log('📊 DADOS DO PRODUTO:');
    console.log(JSON.stringify(productData, null, 2));

    // Passo 4: Tentar clicar e monitorar requisições
    console.log('\n\n📍 PASSO 4: Clicando no produto e monitorando requisições...\n');

    // Limpar requisições anteriores
    requests.length = 0;

    const productLink = await page.$('.col-md-4.col-sm-6.detail-product a');
    if (productLink) {
      await productLink.click();
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log('🌐 REQUISIÇÕES CAPTURADAS:');
      requests.forEach((req, i) => {
        console.log(`\nRequisição ${i + 1}:`);
        console.log(`  URL: ${req.url}`);
        console.log(`  Método: ${req.method}`);
      });

      const finalUrl = page.url();
      console.log(`\n📍 URL FINAL: ${finalUrl}`);

      // Analisar a URL final
      const urlObj = new URL(finalUrl);
      console.log('\n🔍 ANÁLISE DA URL:');
      console.log(`  Base: ${urlObj.origin}`);
      console.log(`  Path: ${urlObj.pathname}`);
      console.log(`  Query: ${urlObj.search}`);
      console.log(`  Hash: ${urlObj.hash}`);
    }

    // Passo 5: Tentar acessar diretamente o link extraído
    console.log('\n\n📍 PASSO 5: Tentando acesso direto ao link...\n');

    const testUrl = 'https://casoca.com.br/poltrona-sempre-oggi-rodrigo-laureano.html';
    console.log(`Testando: ${testUrl}`);

    // Limpar cookies e cache
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    try {
      const response = await page.goto(testUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      console.log(`Status: ${response.status()}`);
      console.log(`Status Text: ${response.statusText()}`);

      const finalDirectUrl = page.url();
      console.log(`URL após navegação direta: ${finalDirectUrl}`);

      if (finalDirectUrl !== testUrl) {
        console.log('⚠️ REDIRECIONAMENTO DETECTADO!');
        console.log(`  De: ${testUrl}`);
        console.log(`  Para: ${finalDirectUrl}`);
      }

      // Verificar se há conteúdo
      const hasProduct = await page.$('.product-info-main, .product-details, [class*="product"]');
      if (hasProduct) {
        console.log('✅ Página do produto carregada com sucesso');
      } else {
        console.log('❌ Página carregada mas sem conteúdo do produto');
      }

    } catch (error) {
      console.log(`❌ Erro ao acessar diretamente: ${error.message}`);
    }

    // Passo 6: Verificar cookies necessários
    console.log('\n\n📍 PASSO 6: Analisando cookies...\n');

    const cookies = await page.cookies();
    console.log('🍪 COOKIES ENCONTRADOS:');
    cookies.forEach(cookie => {
      console.log(`  - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
    });

    console.log('\n\n📸 Screenshots salvos:');
    console.log('  - investigation-1-moveis.png');
    console.log('  - investigation-2-product.png');
    console.log('  - investigation-3-direct.png');

    await page.screenshot({ path: 'investigation-final.png' });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    console.log('\n\n⏸️ Navegador aberto para inspeção manual.');
    console.log('Pressione CTRL+C para fechar.\n');

    // Manter aberto para inspeção
    await new Promise(() => {});
  }
}

investigateRealLinks();