import puppeteer from 'puppeteer';

async function testLinkExtraction() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null
    });

    const page = await browser.newPage();

    console.log('📍 Acessando página de Móveis...');
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('.col-md-4.col-sm-6.detail-product', { timeout: 10000 });
    console.log('✅ Página carregada\n');

    // Extrair links de diferentes formas
    const links = await page.evaluate(() => {
      const results = [];
      const products = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');

      products.forEach((product, index) => {
        if (index < 3) { // Apenas 3 primeiros
          const productInfo = {
            index: index + 1,
            name: '',
            links: []
          };

          // Nome do produto
          const nameEl = product.querySelector('h3, h4, .product-name');
          if (nameEl) {
            productInfo.name = nameEl.textContent.trim();
          }

          // Buscar TODOS os links no produto
          const allLinks = product.querySelectorAll('a');
          allLinks.forEach(link => {
            productInfo.links.push({
              href: link.href,
              onclick: link.onclick ? 'tem onclick' : null,
              dataHref: link.dataset.href,
              text: link.textContent.trim().substring(0, 30)
            });
          });

          // Verificar se há links relativos
          const relativeLinks = product.querySelectorAll('a[href^="/"], a[href^="./"], a[href^="../"]');
          relativeLinks.forEach(link => {
            productInfo.links.push({
              relative: true,
              originalHref: link.getAttribute('href'),
              fullHref: link.href
            });
          });

          results.push(productInfo);
        }
      });

      return results;
    });

    console.log('🔍 ANÁLISE DOS LINKS:\n');

    links.forEach(product => {
      console.log(`\n📦 Produto ${product.index}: ${product.name}`);
      console.log('Links encontrados:');

      product.links.forEach(link => {
        if (link.relative) {
          console.log(`   - Relativo: ${link.originalHref} → ${link.fullHref}`);
        } else {
          console.log(`   - ${link.href}`);
          if (link.onclick) console.log(`     (possui onclick)`);
          if (link.dataHref) console.log(`     data-href: ${link.dataHref}`);
        }
      });
    });

    // Verificar se os links funcionam ao clicar
    console.log('\n\n🧪 TESTANDO CLIQUE NO PRIMEIRO PRODUTO:\n');

    const firstProductLink = await page.$('.col-md-4.col-sm-6.detail-product:first-child a');

    if (firstProductLink) {
      // Obter href antes do clique
      const hrefBeforeClick = await page.evaluate(el => el.href, firstProductLink);
      console.log(`Link antes do clique: ${hrefBeforeClick}`);

      // Clicar e ver onde vai
      await firstProductLink.click();
      await new Promise(resolve => setTimeout(resolve, 5000));

      const currentUrl = page.url();
      console.log(`URL após clique: ${currentUrl}`);

      if (currentUrl !== hrefBeforeClick) {
        console.log('⚠️ URL final é diferente do href!');
      } else {
        console.log('✅ URL corresponde ao href');
      }
    }

    console.log('\n📸 Screenshot salvo como: test-links.png');
    await page.screenshot({ path: 'test-links.png' });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    console.log('\n⏸️ Navegador aberto para inspeção. Pressione CTRL+C para fechar.');
    await new Promise(() => {}); // Manter aberto
  }
}

testLinkExtraction();