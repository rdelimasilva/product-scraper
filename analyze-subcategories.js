import puppeteer from 'puppeteer';

async function analyzeSubcategories() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const url = 'https://casoca.com.br/moveis.html';

  try {
    console.log('🔍 Analisando subcategorias/filtros da página...\n');
    console.log(`URL: ${url}\n`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Aguardar carregamento
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Página carregada\n');

    // Analisar filtros e subcategorias
    const filters = await page.evaluate(() => {
      const results = {
        filters: [],
        sidebar: [],
        dropdowns: [],
        checkboxes: [],
        links: []
      };

      // Buscar filtros comuns
      const filterSelectors = [
        '.filter', '.filtro', '.filters', '.filtros',
        '.sidebar', '.side-menu', '.menu-lateral',
        '.category-filter', '.filter-category',
        '.subcategory', '.subcategoria',
        '[class*="filter"]', '[class*="Filter"]'
      ];

      filterSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.textContent.trim().length > 0) {
            results.filters.push({
              selector: selector,
              text: el.textContent.trim().substring(0, 100),
              tagName: el.tagName,
              className: el.className
            });
          }
        });
      });

      // Buscar sidebar/menu lateral
      const sidebar = document.querySelector('.sidebar, .side-menu, .menu-lateral, aside');
      if (sidebar) {
        const links = sidebar.querySelectorAll('a');
        links.forEach(link => {
          if (link.textContent.trim() && link.href) {
            results.sidebar.push({
              text: link.textContent.trim(),
              href: link.href,
              className: link.className
            });
          }
        });
      }

      // Buscar dropdowns/selects
      const selects = document.querySelectorAll('select');
      selects.forEach(select => {
        const options = [];
        select.querySelectorAll('option').forEach(option => {
          if (option.value && option.textContent) {
            options.push({
              value: option.value,
              text: option.textContent.trim()
            });
          }
        });
        if (options.length > 0) {
          results.dropdowns.push({
            name: select.name || select.id,
            className: select.className,
            options: options
          });
        }
      });

      // Buscar checkboxes de filtro
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        const label = checkbox.parentElement.textContent ||
                     document.querySelector(`label[for="${checkbox.id}"]`)?.textContent;
        if (label) {
          results.checkboxes.push({
            name: checkbox.name,
            id: checkbox.id,
            label: label.trim(),
            value: checkbox.value
          });
        }
      });

      // Buscar links que parecem ser subcategorias
      const allLinks = document.querySelectorAll('a');
      const subcategoryKeywords = [
        'poltrona', 'cadeira', 'mesa', 'sofa', 'sofá',
        'banqueta', 'rack', 'estante', 'armário', 'armario',
        'cama', 'criado', 'escrivaninha', 'banco'
      ];

      allLinks.forEach(link => {
        const text = link.textContent.toLowerCase().trim();
        const href = link.href;

        // Verificar se o link parece ser uma subcategoria
        if (text && href && !href.includes('.jpg') && !href.includes('.png')) {
          for (const keyword of subcategoryKeywords) {
            if (text.includes(keyword)) {
              results.links.push({
                text: link.textContent.trim(),
                href: href,
                parent: link.parentElement.tagName,
                parentClass: link.parentElement.className
              });
              break;
            }
          }
        }
      });

      // Buscar elementos que parecem ser categorias/tags
      const tagElements = document.querySelectorAll('.tag, .category, .subcategory, [class*="category"]');
      const tags = [];
      tagElements.forEach(el => {
        const text = el.textContent.trim();
        if (text && text.length > 2 && text.length < 50) {
          tags.push({
            text: text,
            tagName: el.tagName,
            className: el.className,
            clickable: el.tagName === 'A' || el.tagName === 'BUTTON' || el.onclick !== null
          });
        }
      });
      results.tags = tags;

      return results;
    });

    // Exibir análise
    console.log('📊 ANÁLISE DE SUBCATEGORIAS/FILTROS:\n');

    if (filters.filters.length > 0) {
      console.log('🔍 ELEMENTOS DE FILTRO ENCONTRADOS:');
      filters.filters.slice(0, 5).forEach(filter => {
        console.log(`   Tag: ${filter.tagName}`);
        console.log(`   Classe: ${filter.className}`);
        console.log(`   Texto: ${filter.text.substring(0, 50)}...`);
        console.log('   ---');
      });
    }

    if (filters.sidebar.length > 0) {
      console.log('\n📝 LINKS NA SIDEBAR:');
      filters.sidebar.forEach(link => {
        console.log(`   - ${link.text}`);
      });
    }

    if (filters.dropdowns.length > 0) {
      console.log('\n📋 DROPDOWNS/SELECTS:');
      filters.dropdowns.forEach(dropdown => {
        console.log(`   Nome: ${dropdown.name}`);
        console.log(`   Opções:`);
        dropdown.options.slice(0, 5).forEach(option => {
          console.log(`     - ${option.text}`);
        });
      });
    }

    if (filters.checkboxes.length > 0) {
      console.log('\n☑️ CHECKBOXES:');
      filters.checkboxes.slice(0, 10).forEach(checkbox => {
        console.log(`   - ${checkbox.label}`);
      });
    }

    if (filters.links.length > 0) {
      console.log('\n🔗 POSSÍVEIS LINKS DE SUBCATEGORIA:');
      // Remover duplicatas
      const uniqueLinks = [];
      const seen = new Set();
      filters.links.forEach(link => {
        if (!seen.has(link.text)) {
          seen.add(link.text);
          uniqueLinks.push(link);
        }
      });

      uniqueLinks.slice(0, 10).forEach(link => {
        console.log(`   - ${link.text}`);
        console.log(`     URL: ${link.href}`);
      });
    }

    if (filters.tags.length > 0) {
      console.log('\n🏷️ TAGS/CATEGORIAS:');
      filters.tags.slice(0, 10).forEach(tag => {
        console.log(`   - ${tag.text} (${tag.tagName}, clicável: ${tag.clickable})`);
      });
    }

    // Tentar interagir com um filtro
    console.log('\n🧪 TENTANDO DETECTAR INTERAÇÃO COM FILTROS...\n');

    // Verificar se há elementos clicáveis que mudam a página
    const hasClickableFilters = await page.evaluate(() => {
      const clickables = document.querySelectorAll('a, button, [onclick]');
      let filterCount = 0;

      clickables.forEach(el => {
        const text = el.textContent.toLowerCase();
        if (text.includes('poltrona') || text.includes('cadeira') ||
            text.includes('mesa') || text.includes('sofá')) {
          filterCount++;
        }
      });

      return filterCount;
    });

    console.log(`Encontrados ${hasClickableFilters} elementos clicáveis que parecem ser filtros`);

    // Screenshot
    await page.screenshot({ path: 'subcategories-analysis.png' });
    console.log('\n📸 Screenshot salvo: subcategories-analysis.png');

    console.log('\n⏸️ Navegador aberto para inspeção manual...');
    console.log('   Verifique os filtros/subcategorias disponíveis');
    console.log('   Pressione CTRL+C para fechar\n');

    // Manter aberto
    await new Promise(() => {});

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await browser.close();
  }
}

analyzeSubcategories();