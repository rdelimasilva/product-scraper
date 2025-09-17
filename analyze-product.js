import puppeteer from 'puppeteer';

async function analyzeProductPage() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const url = 'https://casoca.com.br/poltrona-sempre-oggi-rodrigo-laureano.html';

  try {
    console.log('🔍 Analisando página do produto...\n');
    console.log(`URL: ${url}\n`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Aguardar carregamento
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extrair informações da página
    const productInfo = await page.evaluate(() => {
      const info = {
        title: document.title,
        url: window.location.href,
        breadcrumbs: [],
        categories: [],
        productName: '',
        productImage: '',
        metaTags: [],
        jsonLd: null
      };

      // Buscar breadcrumbs (caminho de navegação)
      const breadcrumbSelectors = [
        '.breadcrumb', '.breadcrumbs', 'nav[aria-label="breadcrumb"]',
        '[class*="breadcrumb"]', '.navigation-path', '.category-path'
      ];

      breadcrumbSelectors.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
          const items = element.querySelectorAll('a, span, li');
          items.forEach(item => {
            const text = item.textContent.trim();
            if (text && text !== '>' && text !== '/' && text !== '→') {
              info.breadcrumbs.push(text);
            }
          });
        }
      });

      // Buscar categorias em links ou meta tags
      const categoryLinks = document.querySelectorAll('a[href*="/categoria"], a[href*="/category"], a[href*="/c/"]');
      categoryLinks.forEach(link => {
        const text = link.textContent.trim();
        if (text) info.categories.push(text);
      });

      // Buscar nome do produto
      const nameSelectors = ['h1', '.product-name', '.product-title', '[class*="product-name"]'];
      for (const selector of nameSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          info.productName = element.textContent.trim();
          break;
        }
      }

      // Buscar imagem principal
      const imgSelectors = [
        '.product-image img', '.main-image img',
        '.gallery img', '[class*="product"] img'
      ];
      for (const selector of imgSelectors) {
        const img = document.querySelector(selector);
        if (img && img.src) {
          info.productImage = img.src;
          break;
        }
      }

      // Buscar meta tags relevantes
      const metaTags = document.querySelectorAll('meta[property*="category"], meta[name*="category"]');
      metaTags.forEach(meta => {
        info.metaTags.push({
          property: meta.getAttribute('property') || meta.getAttribute('name'),
          content: meta.getAttribute('content')
        });
      });

      // Buscar JSON-LD estruturado
      const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
      if (jsonLdScript) {
        try {
          info.jsonLd = JSON.parse(jsonLdScript.textContent);
        } catch (e) {
          info.jsonLd = null;
        }
      }

      // Buscar informações na URL
      const urlParts = window.location.pathname.split('/').filter(p => p);
      info.urlSegments = urlParts;

      // Buscar tags ou labels na página
      const tagSelectors = ['.tag', '.label', '.category-tag', '[class*="tag"]', '[class*="category"]'];
      const tags = new Set();
      tagSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 2 && text.length < 50) {
            tags.add(text);
          }
        });
      });
      info.tags = Array.from(tags);

      return info;
    });

    // Exibir análise
    console.log('📊 INFORMAÇÕES ENCONTRADAS:\n');

    console.log('📝 Produto:');
    console.log(`   Nome: ${productInfo.productName || 'Não encontrado'}`);
    console.log(`   Imagem: ${productInfo.productImage ? 'Encontrada' : 'Não encontrada'}`);

    console.log('\n🔗 Breadcrumbs (Caminho de navegação):');
    if (productInfo.breadcrumbs.length > 0) {
      productInfo.breadcrumbs.forEach((crumb, index) => {
        console.log(`   ${index + 1}. ${crumb}`);
      });
    } else {
      console.log('   Nenhum breadcrumb encontrado');
    }

    console.log('\n📂 Categorias encontradas:');
    if (productInfo.categories.length > 0) {
      productInfo.categories.forEach(cat => {
        console.log(`   - ${cat}`);
      });
    } else {
      console.log('   Nenhuma categoria explícita encontrada');
    }

    console.log('\n🏷️ Tags/Labels encontrados:');
    if (productInfo.tags.length > 0) {
      productInfo.tags.slice(0, 10).forEach(tag => {
        console.log(`   - ${tag}`);
      });
    } else {
      console.log('   Nenhuma tag encontrada');
    }

    console.log('\n🔍 Segmentos da URL:');
    productInfo.urlSegments.forEach((segment, index) => {
      console.log(`   ${index}: ${segment}`);
    });

    if (productInfo.metaTags.length > 0) {
      console.log('\n📋 Meta Tags de categoria:');
      productInfo.metaTags.forEach(meta => {
        console.log(`   ${meta.property}: ${meta.content}`);
      });
    }

    if (productInfo.jsonLd) {
      console.log('\n📦 Dados estruturados (JSON-LD):');
      console.log(JSON.stringify(productInfo.jsonLd, null, 2).substring(0, 500));
    }

    // Tirar screenshot
    await page.screenshot({ path: 'product-page.png' });
    console.log('\n📸 Screenshot salvo: product-page.png');

    console.log('\n⏸️ Navegador aberto para inspeção manual...');
    console.log('   Pressione CTRL+C para fechar\n');

    // Manter aberto
    await new Promise(() => {});

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await browser.close();
  }
}

analyzeProductPage();