import puppeteer from 'puppeteer';

async function analyzeProductPage() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    console.log('🔍 ANÁLISE DA ESTRUTURA DE PRODUTOS\n');
    console.log('════════════════════════════════════════════════\n');

    // Acessar página de móveis
    console.log('📍 Acessando página de Móveis...');
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('.col-md-4.col-sm-6.detail-product', { timeout: 10000 });
    console.log('✅ Página carregada\n');

    // Analisar estrutura detalhada do primeiro produto
    const productAnalysis = await page.evaluate(() => {
      const product = document.querySelector('.col-md-4.col-sm-6.detail-product');
      if (!product) return null;

      const analysis = {
        html: product.innerHTML.substring(0, 500),
        links: [],
        images: [],
        buttons: [],
        forms: [],
        scripts: []
      };

      // Analisar links
      const links = product.querySelectorAll('a');
      links.forEach(link => {
        analysis.links.push({
          href: link.href,
          getAttribute_href: link.getAttribute('href'),
          onclick: link.onclick ? link.onclick.toString() : null,
          dataAttributes: Object.keys(link.dataset).reduce((acc, key) => {
            acc[key] = link.dataset[key];
            return acc;
          }, {}),
          text: link.textContent.trim().substring(0, 50)
        });
      });

      // Analisar imagens
      const images = product.querySelectorAll('img');
      images.forEach(img => {
        analysis.images.push({
          src: img.src,
          getAttribute_src: img.getAttribute('src'),
          dataSrc: img.dataset.src,
          alt: img.alt
        });
      });

      // Analisar botões
      const buttons = product.querySelectorAll('button, [type="button"], [role="button"]');
      buttons.forEach(btn => {
        analysis.buttons.push({
          text: btn.textContent.trim(),
          onclick: btn.onclick ? btn.onclick.toString() : null,
          dataAttributes: Object.keys(btn.dataset)
        });
      });

      // Verificar forms
      const forms = product.querySelectorAll('form');
      forms.forEach(form => {
        analysis.forms.push({
          action: form.action,
          method: form.method
        });
      });

      return analysis;
    });

    console.log('📦 ESTRUTURA DO PRODUTO:\n');

    if (productAnalysis) {
      console.log('HTML (primeiros 500 chars):');
      console.log(productAnalysis.html);
      console.log('\n' + '─'.repeat(60) + '\n');

      if (productAnalysis.links.length > 0) {
        console.log('🔗 LINKS ENCONTRADOS:');
        productAnalysis.links.forEach((link, i) => {
          console.log(`\nLink ${i + 1}:`);
          console.log(`  href: ${link.href}`);
          console.log(`  getAttribute('href'): ${link.getAttribute_href}`);
          if (link.onclick) console.log(`  onclick: [função presente]`);
          if (Object.keys(link.dataAttributes).length > 0) {
            console.log(`  data-attributes:`, link.dataAttributes);
          }
        });
      }

      if (productAnalysis.buttons.length > 0) {
        console.log('\n🔘 BOTÕES:');
        productAnalysis.buttons.forEach(btn => {
          console.log(`  - ${btn.text}`);
          if (btn.onclick) console.log(`    onclick presente`);
        });
      }

      if (productAnalysis.forms.length > 0) {
        console.log('\n📝 FORMULÁRIOS:');
        productAnalysis.forms.forEach(form => {
          console.log(`  Action: ${form.action}`);
          console.log(`  Method: ${form.method}`);
        });
      }
    }

    // Testar navegação para produto
    console.log('\n\n🧪 TESTE DE NAVEGAÇÃO:\n');

    const firstProduct = await page.$('.col-md-4.col-sm-6.detail-product');
    if (firstProduct) {
      // Tentar diferentes formas de navegar
      console.log('1. Tentando clicar no link...');

      const link = await firstProduct.$('a');
      if (link) {
        await link.click();
        await new Promise(resolve => setTimeout(resolve, 5000));

        const newUrl = page.url();
        console.log(`   Nova URL: ${newUrl}`);

        // Verificar se mudou de página
        if (newUrl !== 'https://casoca.com.br/moveis.html') {
          console.log('   ✅ Navegou para página do produto');

          // Analisar URL final
          console.log('\n📍 ANÁLISE DA URL DO PRODUTO:');
          const urlParts = new URL(newUrl);
          console.log(`   Protocolo: ${urlParts.protocol}`);
          console.log(`   Host: ${urlParts.host}`);
          console.log(`   Pathname: ${urlParts.pathname}`);
          console.log(`   Search: ${urlParts.search}`);
          console.log(`   Hash: ${urlParts.hash}`);
        } else {
          console.log('   ⚠️ Permaneceu na mesma página');
        }
      }
    }

    console.log('\n📸 Screenshot salvo: product-analysis.png');
    await page.screenshot({ path: 'product-analysis.png' });

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n✅ Análise concluída');
  }
}

analyzeProductPage();