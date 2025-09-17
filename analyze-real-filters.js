import puppeteer from 'puppeteer';

async function analyzeRealFilters() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    console.log('🔍 Analisando estrutura real de filtros do site...\n');

    // Acessar categoria móveis
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Página carregada\n');

    // Tirar screenshot inicial
    await page.screenshot({ path: 'real-filters-initial.png' });

    // Analisar estrutura real da página
    const pageStructure = await page.evaluate(() => {
      const results = {
        navigation: [],
        selects: [],
        buttons: [],
        links: [],
        filterElements: []
      };

      // Buscar navegação/menu
      const navElements = document.querySelectorAll('nav a, .navigation a, .menu a');
      navElements.forEach(el => {
        const text = el.textContent.trim();
        if (text && !text.includes('Login') && !text.includes('Carrinho')) {
          results.navigation.push({
            text: text,
            href: el.href
          });
        }
      });

      // Buscar selects/dropdowns
      document.querySelectorAll('select').forEach(select => {
        const options = [];
        select.querySelectorAll('option').forEach(opt => {
          if (opt.value && opt.textContent.trim()) {
            options.push({
              value: opt.value,
              text: opt.textContent.trim()
            });
          }
        });

        if (options.length > 0) {
          results.selects.push({
            id: select.id,
            name: select.name,
            className: select.className,
            options: options
          });
        }
      });

      // Buscar botões
      document.querySelectorAll('button').forEach(button => {
        const text = button.textContent.trim();
        if (text && !text.includes('Carrinho') && !text.includes('Login')) {
          results.buttons.push({
            text: text,
            className: button.className,
            id: button.id
          });
        }
      });

      // Buscar links com contadores (possíveis filtros)
      document.querySelectorAll('a').forEach(link => {
        const text = link.textContent.trim();
        // Procurar links com formato "Nome (123)"
        if (text && text.match(/.*\(\d+\)$/)) {
          results.links.push({
            text: text,
            href: link.href,
            parent: link.parentElement?.className || '',
            grandParent: link.parentElement?.parentElement?.className || ''
          });
        }
      });

      // Buscar elementos com classes relacionadas a filtros
      const filterSelectors = [
        '.filter', '.filtro', '[class*="filter"]', '[class*="Filter"]',
        '.category', '.subcategory', '.tipo', '[class*="tipo"]'
      ];

      filterSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => {
            const text = el.textContent.trim();
            if (text && text.length < 100) {
              results.filterElements.push({
                selector: selector,
                tagName: el.tagName,
                className: el.className,
                text: text.substring(0, 50),
                hasLinks: el.querySelectorAll('a').length
              });
            }
          });
        } catch (e) {}
      });

      return results;
    });

    // Exibir análise
    console.log('📊 ESTRUTURA DA PÁGINA:\n');

    if (pageStructure.navigation.length > 0) {
      console.log('🗂️ NAVEGAÇÃO:');
      pageStructure.navigation.slice(0, 10).forEach(nav => {
        console.log(`   - ${nav.text}`);
      });
    }

    if (pageStructure.selects.length > 0) {
      console.log('\n📋 SELECTS/DROPDOWNS:');
      pageStructure.selects.forEach(select => {
        console.log(`   ID: ${select.id || 'sem id'}`);
        console.log(`   Nome: ${select.name || 'sem nome'}`);
        console.log(`   Classe: ${select.className || 'sem classe'}`);
        console.log(`   Opções (${select.options.length}):`)
        select.options.slice(0, 5).forEach(opt => {
          console.log(`     - "${opt.text}" (value: ${opt.value})`);
        });
      });
    }

    if (pageStructure.buttons.length > 0) {
      console.log('\n🔘 BOTÕES:');
      pageStructure.buttons.slice(0, 10).forEach(btn => {
        console.log(`   - "${btn.text}" (class: ${btn.className})`);
      });
    }

    if (pageStructure.links.length > 0) {
      console.log('\n🔗 LINKS COM CONTADORES:');
      // Remover duplicatas
      const uniqueLinks = [];
      const seen = new Set();
      pageStructure.links.forEach(link => {
        if (!seen.has(link.text)) {
          seen.add(link.text);
          uniqueLinks.push(link);
        }
      });

      uniqueLinks.slice(0, 15).forEach(link => {
        console.log(`   - ${link.text}`);
        console.log(`     URL: ${link.href}`);
      });
    }

    if (pageStructure.filterElements.length > 0) {
      console.log('\n🎯 ELEMENTOS DE FILTRO:');
      // Remover duplicatas
      const unique = [];
      const seen = new Set();
      pageStructure.filterElements.forEach(el => {
        const key = `${el.tagName}-${el.text}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(el);
        }
      });

      unique.slice(0, 10).forEach(el => {
        console.log(`   ${el.tagName}: "${el.text}" (${el.hasLinks} links)`);
      });
    }

    // Verificar se existe algum dropdown/select ordenação
    console.log('\n🔍 VERIFICANDO OPÇÕES DE ORDENAÇÃO/FILTRO...\n');

    const hasOrderBy = await page.$('select[name*="order"], select[id*="order"], select[class*="order"]');
    if (hasOrderBy) {
      console.log('✅ Encontrou select de ordenação');
    }

    const hasFilter = await page.$('select[name*="filter"], select[id*="filter"], select[class*="filter"]');
    if (hasFilter) {
      console.log('✅ Encontrou select de filtro');
    }

    // Tentar encontrar subcategorias na URL atual
    const currentUrl = page.url();
    console.log(`\n📍 URL atual: ${currentUrl}`);

    // Aguardar interação manual
    console.log('\n⏸️ Navegador aberto para inspeção manual...');
    console.log('   Por favor, clique manualmente em um filtro de tipo (ex: Poltronas)');
    console.log('   Observe como a URL muda e como os produtos são filtrados');
    console.log('   Pressione CTRL+C quando terminar\n');

    // Manter aberto
    await new Promise(() => {});

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await browser.close();
  }
}

analyzeRealFilters();