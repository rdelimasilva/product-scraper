import puppeteer from 'puppeteer';

async function analyzeCasocaSite() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    console.log('🔍 Analisando site casoca.com.br...\n');

    // Navegar para categoria móveis
    const url = 'https://casoca.com.br/moveis';
    console.log(`Acessando: ${url}\n`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Aguardar carregamento completo
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Tirar screenshot para debug
    await page.screenshot({ path: 'casoca-moveis.png', fullPage: false });
    console.log('📸 Screenshot salvo: casoca-moveis.png\n');

    // Analisar estrutura da página
    const analysis = await page.evaluate(() => {
      const results = {
        title: document.title,
        url: window.location.href,
        allClasses: [],
        productContainers: [],
        images: [],
        links: [],
        texts: []
      };

      // Coletar todas as classes únicas
      const allElements = document.querySelectorAll('*');
      const classSet = new Set();
      allElements.forEach(el => {
        if (el.className && typeof el.className === 'string') {
          el.className.split(' ').forEach(cls => {
            if (cls && cls.includes('product') || cls.includes('produto') ||
                cls.includes('item') || cls.includes('card')) {
              classSet.add(cls);
            }
          });
        }
      });
      results.allClasses = Array.from(classSet);

      // Buscar possíveis containers de produtos
      const containerSelectors = [
        'article', 'li', 'div[class*="product"]', 'div[class*="item"]',
        'div[class*="card"]', '.product', '.produto', '.item',
        '[data-product]', '[data-item]'
      ];

      containerSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 3 && elements.length < 100) { // Provável lista de produtos
          // Verificar se tem imagens dentro
          let hasImages = false;
          elements.forEach(el => {
            if (el.querySelector('img')) hasImages = true;
          });

          if (hasImages) {
            results.productContainers.push({
              selector: selector,
              count: elements.length,
              firstElement: {
                tagName: elements[0].tagName,
                className: elements[0].className,
                innerHTML: elements[0].innerHTML.substring(0, 200)
              }
            });
          }
        }
      });

      // Buscar todas as imagens que parecem ser de produtos
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        if (img.src && !img.src.includes('logo') && !img.src.includes('banner') &&
            !img.src.includes('icon') && img.width > 50) {
          results.images.push({
            src: img.src,
            alt: img.alt,
            parent: img.parentElement.tagName,
            parentClass: img.parentElement.className
          });
        }
      });

      // Buscar links que parecem ser de produtos
      const links = document.querySelectorAll('a[href*="/produto"], a[href*="/product"], a[href*="/p/"]');
      links.forEach(link => {
        results.links.push({
          href: link.href,
          text: link.textContent.trim().substring(0, 50),
          className: link.className
        });
      });

      return results;
    });

    // Exibir análise
    console.log('📊 ANÁLISE DO SITE:\n');
    console.log(`Título: ${analysis.title}`);
    console.log(`URL: ${analysis.url}\n`);

    console.log('🏷️ CLASSES RELACIONADAS A PRODUTOS:');
    analysis.allClasses.slice(0, 20).forEach(cls => {
      console.log(`   - ${cls}`);
    });

    console.log('\n📦 POSSÍVEIS CONTAINERS DE PRODUTOS:');
    analysis.productContainers.forEach(container => {
      console.log(`   Seletor: ${container.selector}`);
      console.log(`   Quantidade: ${container.count} elementos`);
      console.log(`   Tag: ${container.firstElement.tagName}`);
      console.log(`   Classes: ${container.firstElement.className}`);
      console.log('   ---');
    });

    console.log('\n🖼️ PRIMEIRAS 5 IMAGENS DE PRODUTOS:');
    analysis.images.slice(0, 5).forEach(img => {
      console.log(`   Alt: ${img.alt}`);
      console.log(`   Parent: ${img.parent} (${img.parentClass})`);
      console.log(`   URL: ${img.src.substring(0, 80)}...`);
      console.log('   ---');
    });

    console.log('\n🔗 PRIMEIROS 5 LINKS DE PRODUTOS:');
    analysis.links.slice(0, 5).forEach(link => {
      console.log(`   Texto: ${link.text}`);
      console.log(`   URL: ${link.href.substring(0, 80)}...`);
      console.log('   ---');
    });

    // Tentar extrair produtos com seletor genérico
    console.log('\n🧪 TENTANDO EXTRAIR PRODUTOS...\n');

    const products = await page.evaluate(() => {
      // Tentar encontrar produtos de forma mais genérica
      let productElements = [];

      // Método 1: Buscar por estrutura (elemento com imagem + texto + link)
      const allDivs = document.querySelectorAll('div, article, li');

      allDivs.forEach(div => {
        const img = div.querySelector('img');
        const link = div.querySelector('a');
        const hasText = div.textContent.trim().length > 10;

        if (img && link && hasText && !div.querySelector('div div div div')) { // Evitar elementos muito aninhados
          productElements.push({
            html: div.outerHTML.substring(0, 300),
            img: img.src,
            link: link.href,
            text: div.textContent.trim().substring(0, 100)
          });
        }
      });

      return productElements.slice(0, 3); // Retornar apenas 3 para análise
    });

    if (products.length > 0) {
      console.log(`✅ Encontrados ${products.length} possíveis produtos!\n`);
      products.forEach((product, index) => {
        console.log(`Produto ${index + 1}:`);
        console.log(`   Texto: ${product.text}`);
        console.log(`   Link: ${product.link}`);
        console.log(`   Imagem: ${product.img}`);
        console.log('   ---');
      });
    } else {
      console.log('❌ Nenhum produto encontrado com método genérico');
    }

    console.log('\n⏸️ Navegador permanecerá aberto para inspeção manual...');
    console.log('   Pressione CTRL+C para fechar\n');

    // Manter navegador aberto
    await new Promise(() => {});

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await browser.close();
  }
}

analyzeCasocaSite();