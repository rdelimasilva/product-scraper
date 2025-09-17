import puppeteer from 'puppeteer';

async function analyzeProductGrid() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();
  const url = 'https://casoca.com.br/moveis.html';

  try {
    console.log('🔍 Analisando grade de produtos...\n');
    console.log(`URL: ${url}\n`);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Aguardar um pouco mais para garantir carregamento
    console.log('⏳ Aguardando página carregar completamente...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Aguardar por possíveis elementos de produto
    try {
      await page.waitForSelector('img', { timeout: 5000 });
    } catch (e) {
      console.log('⚠️ Não encontrou imagens\n');
    }

    // Analisar estrutura
    const analysis = await page.evaluate(() => {
      const results = {
        title: document.title,
        totalElements: document.querySelectorAll('*').length,
        gridContainers: [],
        imagesFound: [],
        possibleProducts: [],
        divStructures: []
      };

      // Buscar containers de grade
      const gridSelectors = [
        '.grid', '.products-grid', '.product-grid',
        '.produtos', '.products', '.items',
        '.list', '.listing', '.catalog',
        '[class*="grid"]', '[class*="products"]',
        '.row', '.container'
      ];

      gridSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.gridContainers.push({
            selector: selector,
            count: elements.length,
            childrenCount: elements[0] ? elements[0].children.length : 0
          });
        }
      });

      // Buscar todas as imagens
      const allImages = document.querySelectorAll('img');
      allImages.forEach((img, index) => {
        if (img.src && !img.src.includes('data:') &&
            !img.src.includes('logo') && !img.src.includes('banner')) {
          results.imagesFound.push({
            index: index,
            src: img.src.substring(0, 100),
            alt: img.alt,
            width: img.width,
            height: img.height,
            parentTag: img.parentElement ? img.parentElement.tagName : null,
            parentClass: img.parentElement ? img.parentElement.className : null
          });
        }
      });

      // Analisar estrutura de divs que contém imagens
      const divsWithImages = document.querySelectorAll('div:has(img)');
      const divAnalysis = new Map();

      divsWithImages.forEach(div => {
        const className = div.className || 'no-class';
        const structure = {
          hasLink: !!div.querySelector('a'),
          hasImage: !!div.querySelector('img'),
          hasText: div.textContent.trim().length > 10,
          childrenCount: div.children.length,
          depth: 0
        };

        // Calcular profundidade
        let parent = div.parentElement;
        while (parent && parent !== document.body) {
          structure.depth++;
          parent = parent.parentElement;
        }

        if (!divAnalysis.has(className)) {
          divAnalysis.set(className, {
            className: className,
            count: 0,
            structure: structure
          });
        }
        divAnalysis.get(className).count++;
      });

      // Converter Map para array
      divAnalysis.forEach(value => {
        if (value.count > 1) { // Só incluir se houver múltiplos
          results.divStructures.push(value);
        }
      });

      // Tentar identificar produtos por padrão
      // Produtos geralmente têm: container > imagem + nome + link
      const allDivs = document.querySelectorAll('div, article, section, li');
      const productCandidates = [];

      allDivs.forEach(element => {
        const hasImg = element.querySelector('img');
        const hasLink = element.querySelector('a');
        const textLength = element.textContent.trim().length;

        // Critérios para possível produto
        if (hasImg && hasLink && textLength > 20 && textLength < 500) {
          const imgs = element.querySelectorAll('img').length;
          const links = element.querySelectorAll('a').length;

          // Não deve ter muitos elementos (seria um container maior)
          if (imgs <= 2 && links <= 3) {
            productCandidates.push({
              tag: element.tagName,
              className: element.className,
              id: element.id,
              textLength: textLength,
              imgCount: imgs,
              linkCount: links
            });
          }
        }
      });

      // Agrupar por className para encontrar padrões
      const grouped = {};
      productCandidates.forEach(candidate => {
        const key = candidate.className || 'no-class';
        if (!grouped[key]) {
          grouped[key] = { ...candidate, count: 0 };
        }
        grouped[key].count++;
      });

      // Só incluir grupos com múltiplos elementos (provável lista de produtos)
      Object.values(grouped).forEach(group => {
        if (group.count >= 3) {
          results.possibleProducts.push(group);
        }
      });

      // Buscar elementos com data attributes de produto
      const dataProducts = document.querySelectorAll('[data-product], [data-produto], [data-item]');
      if (dataProducts.length > 0) {
        results.dataAttributes = {
          found: true,
          count: dataProducts.length,
          selector: '[data-product], [data-produto], [data-item]'
        };
      }

      return results;
    });

    // Exibir análise
    console.log('📊 ANÁLISE DA PÁGINA:\n');
    console.log(`Título: ${analysis.title}`);
    console.log(`Total de elementos: ${analysis.totalElements}\n`);

    if (analysis.gridContainers.length > 0) {
      console.log('📦 POSSÍVEIS CONTAINERS DE GRADE:');
      analysis.gridContainers.forEach(container => {
        console.log(`   ${container.selector}: ${container.count} elementos, ${container.childrenCount} filhos`);
      });
    }

    console.log(`\n🖼️ IMAGENS ENCONTRADAS: ${analysis.imagesFound.length}`);
    if (analysis.imagesFound.length > 0) {
      console.log('Primeiras 3 imagens:');
      analysis.imagesFound.slice(0, 3).forEach(img => {
        console.log(`   - ${img.width}x${img.height} em <${img.parentTag} class="${img.parentClass}">`);
      });
    }

    if (analysis.possibleProducts.length > 0) {
      console.log('\n🎯 PROVÁVEIS PRODUTOS (elementos repetidos com imagem+link):');
      analysis.possibleProducts
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .forEach(product => {
          console.log(`   Classe: "${product.className}"`);
          console.log(`   Quantidade: ${product.count} elementos`);
          console.log(`   Tag: <${product.tag}>`);
          console.log('   ---');
        });
    }

    if (analysis.dataAttributes) {
      console.log('\n✅ ENCONTROU DATA ATTRIBUTES DE PRODUTO!');
      console.log(`   Seletor: ${analysis.dataAttributes.selector}`);
      console.log(`   Quantidade: ${analysis.dataAttributes.count}`);
    }

    // Tentar extrair um produto como teste
    console.log('\n🧪 TENTANDO EXTRAIR UM PRODUTO DE TESTE...\n');

    const testProduct = await page.evaluate(() => {
      // Usar o seletor mais provável
      let productElement = null;

      // Tentar diferentes seletores
      const selectors = [
        '[data-product]', '[data-produto]', '[data-item]',
        '.product', '.produto', '.item',
        'article', 'li.product', 'div.product'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          productElement = elements[0];
          break;
        }
      }

      if (!productElement) {
        // Tentar encontrar por estrutura
        const candidates = Array.from(document.querySelectorAll('div, article, li')).filter(el => {
          return el.querySelector('img') && el.querySelector('a') &&
                 el.textContent.trim().length > 20 && el.textContent.trim().length < 500;
        });
        if (candidates.length > 0) {
          productElement = candidates[0];
        }
      }

      if (productElement) {
        const img = productElement.querySelector('img');
        const link = productElement.querySelector('a');
        const text = productElement.textContent.trim();

        return {
          found: true,
          html: productElement.outerHTML.substring(0, 500),
          data: {
            name: text.substring(0, 100),
            image: img ? img.src : null,
            link: link ? link.href : null
          }
        };
      }

      return { found: false };
    });

    if (testProduct.found) {
      console.log('✅ PRODUTO DE TESTE EXTRAÍDO:');
      console.log(`   Nome: ${testProduct.data.name}`);
      console.log(`   Imagem: ${testProduct.data.image ? 'Sim' : 'Não'}`);
      console.log(`   Link: ${testProduct.data.link ? 'Sim' : 'Não'}`);
      console.log('\n   HTML (primeiros 500 chars):');
      console.log(`   ${testProduct.html}`);
    } else {
      console.log('❌ Não conseguiu extrair produto de teste');
    }

    // Tirar screenshot
    await page.screenshot({ path: 'grid-analysis.png', fullPage: false });
    console.log('\n📸 Screenshot salvo: grid-analysis.png');

    console.log('\n⏸️ Navegador permanecerá aberto para inspeção...');
    console.log('   Pressione CTRL+C para fechar\n');

    // Manter aberto
    await new Promise(() => {});

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await browser.close();
  }
}

analyzeProductGrid();