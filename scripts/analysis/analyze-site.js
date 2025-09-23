import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

async function analyzeSite() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const url = process.env.TARGET_URL || 'https://casoca.com.br';

  console.log(`\n🔍 Analisando estrutura de: ${url}\n`);

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Aguardar um pouco para garantir que tudo carregou
    await page.waitForTimeout(2000);

    // Analisar possíveis seletores de produtos
    const analysis = await page.evaluate(() => {
      const results = {
        possibleProductContainers: [],
        possibleNames: [],
        possibleImages: [],
        possibleLinks: [],
        possiblePrices: []
      };

      // Buscar containers de produtos comuns
      const containerSelectors = [
        '.product', '.produto', '.product-item', '.item-produto',
        '.card', '.product-card', '.produto-card',
        '[class*="product"]', '[class*="produto"]',
        '.vitrine-item', '.showcase-item',
        'article', '.box-produto'
      ];

      containerSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.possibleProductContainers.push({
            selector: selector,
            count: elements.length
          });
        }
      });

      // Buscar títulos/nomes
      const nameSelectors = [
        'h2', 'h3', 'h4', '.product-name', '.produto-nome',
        '.title', '.titulo', '[class*="name"]', '[class*="nome"]',
        '.product-title', '.produto-titulo'
      ];

      nameSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const sample = elements[0].textContent.trim().substring(0, 50);
          results.possibleNames.push({
            selector: selector,
            count: elements.length,
            sample: sample
          });
        }
      });

      // Buscar imagens
      const imageSelectors = [
        'img', '.product img', '.produto img',
        '.product-image img', '.produto-imagem img',
        '[class*="product"] img', '[class*="produto"] img'
      ];

      imageSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        const validImages = Array.from(elements).filter(img => {
          return img.src && !img.src.includes('logo') && !img.src.includes('icon');
        });
        if (validImages.length > 0) {
          results.possibleImages.push({
            selector: selector,
            count: validImages.length,
            sample: validImages[0].src
          });
        }
      });

      // Buscar links
      const linkSelectors = [
        'a[href*="product"]', 'a[href*="produto"]',
        '.product a', '.produto a',
        'a.product-link', 'a.produto-link'
      ];

      linkSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          results.possibleLinks.push({
            selector: selector,
            count: elements.length,
            sample: elements[0].href
          });
        }
      });

      // Buscar preços
      const priceSelectors = [
        '.price', '.preco', '[class*="price"]', '[class*="preco"]',
        '.valor', '.value', 'span.price', 'span.preco'
      ];

      priceSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const sample = elements[0].textContent.trim();
          if (sample.includes('R$') || sample.includes(',')) {
            results.possiblePrices.push({
              selector: selector,
              count: elements.length,
              sample: sample
            });
          }
        }
      });

      return results;
    });

    // Exibir análise
    console.log('📦 POSSÍVEIS CONTAINERS DE PRODUTOS:');
    analysis.possibleProductContainers.forEach(item => {
      console.log(`   ${item.selector}: ${item.count} elementos`);
    });

    console.log('\n📝 POSSÍVEIS NOMES/TÍTULOS:');
    analysis.possibleNames.forEach(item => {
      console.log(`   ${item.selector}: ${item.count} elementos`);
      console.log(`      Exemplo: "${item.sample}"`);
    });

    console.log('\n🖼️ POSSÍVEIS IMAGENS:');
    analysis.possibleImages.forEach(item => {
      console.log(`   ${item.selector}: ${item.count} imagens`);
      console.log(`      Exemplo: ${item.sample.substring(0, 80)}...`);
    });

    console.log('\n🔗 POSSÍVEIS LINKS:');
    analysis.possibleLinks.forEach(item => {
      console.log(`   ${item.selector}: ${item.count} links`);
      console.log(`      Exemplo: ${item.sample.substring(0, 80)}...`);
    });

    console.log('\n💰 POSSÍVEIS PREÇOS:');
    analysis.possiblePrices.forEach(item => {
      console.log(`   ${item.selector}: ${item.count} elementos`);
      console.log(`      Exemplo: ${item.sample}`);
    });

    // Aguardar input do usuário antes de fechar
    console.log('\n\n⏸️  Navegador aberto para inspeção manual...');
    console.log('   Pressione CTRL+C para fechar\n');

    // Manter navegador aberto
    await new Promise(() => {});

  } catch (error) {
    console.error('Erro ao analisar site:', error.message);
  } finally {
    await browser.close();
  }
}

analyzeSite();