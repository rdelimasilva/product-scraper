import puppeteer from 'puppeteer';

async function analyzeFilters() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();

  try {
    console.log('🔍 Analisando filtros do site casoca.com.br...\n');

    // Acessar categoria móveis
    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Página carregada\n');

    // Tirar screenshot inicial
    await page.screenshot({ path: 'filters-before.png' });

    // Analisar filtros disponíveis
    const filters = await page.evaluate(() => {
      const results = {
        selectDropdowns: [],
        checkboxes: [],
        radioButtons: [],
        links: [],
        buttons: []
      };

      // Buscar dropdowns/selects
      document.querySelectorAll('select').forEach(select => {
        const options = [];
        select.querySelectorAll('option').forEach(opt => {
          if (opt.value) {
            options.push({
              value: opt.value,
              text: opt.textContent.trim()
            });
          }
        });

        if (options.length > 0) {
          results.selectDropdowns.push({
            id: select.id,
            name: select.name,
            className: select.className,
            label: select.getAttribute('aria-label') ||
                  document.querySelector(`label[for="${select.id}"]`)?.textContent ||
                  'Sem label',
            options: options
          });
        }
      });

      // Buscar checkboxes
      document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        const label = checkbox.nextElementSibling?.textContent ||
                     checkbox.parentElement?.textContent ||
                     document.querySelector(`label[for="${checkbox.id}"]`)?.textContent;

        if (label && label.trim()) {
          results.checkboxes.push({
            id: checkbox.id,
            name: checkbox.name,
            value: checkbox.value,
            label: label.trim(),
            checked: checkbox.checked
          });
        }
      });

      // Buscar radio buttons
      document.querySelectorAll('input[type="radio"]').forEach(radio => {
        const label = radio.nextElementSibling?.textContent ||
                     radio.parentElement?.textContent ||
                     document.querySelector(`label[for="${radio.id}"]`)?.textContent;

        if (label && label.trim()) {
          results.radioButtons.push({
            id: radio.id,
            name: radio.name,
            value: radio.value,
            label: label.trim(),
            checked: radio.checked
          });
        }
      });

      // Buscar links que parecem ser filtros
      document.querySelectorAll('a').forEach(link => {
        const text = link.textContent.toLowerCase().trim();
        const href = link.href;

        // Palavras-chave de tipos de móveis
        const typeKeywords = [
          'poltrona', 'cadeira', 'mesa', 'sofá', 'sofa',
          'rack', 'estante', 'cama', 'armário', 'armario',
          'banqueta', 'escrivaninha', 'criado-mudo'
        ];

        for (const keyword of typeKeywords) {
          if (text.includes(keyword)) {
            results.links.push({
              text: link.textContent.trim(),
              href: href,
              className: link.className
            });
            break;
          }
        }
      });

      // Buscar botões de filtro
      document.querySelectorAll('button').forEach(button => {
        const text = button.textContent.trim();
        if (text && !text.includes('Carrinho') && !text.includes('Login')) {
          results.buttons.push({
            text: text,
            className: button.className,
            onclick: button.onclick ? 'Tem onclick' : 'Sem onclick'
          });
        }
      });

      // Buscar elementos com classes que indicam filtros
      const filterClasses = [
        '.filter', '.filtro', '.filter-option', '.filter-item',
        '[class*="filter"]', '[class*="Filter"]', '[class*="tipo"]'
      ];

      const filterElements = [];
      filterClasses.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length < 50) {
            filterElements.push({
              tag: el.tagName,
              className: el.className,
              text: text.substring(0, 40),
              clickable: el.tagName === 'A' || el.tagName === 'BUTTON' || el.onclick
            });
          }
        });
      });

      // Remover duplicatas
      const uniqueFilters = [];
      const seen = new Set();
      filterElements.forEach(el => {
        const key = `${el.tag}-${el.text}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueFilters.push(el);
        }
      });
      results.filterElements = uniqueFilters;

      return results;
    });

    // Exibir análise
    console.log('📊 FILTROS ENCONTRADOS:\n');

    if (filters.selectDropdowns.length > 0) {
      console.log('📋 DROPDOWNS/SELECTS:');
      filters.selectDropdowns.forEach(dropdown => {
        console.log(`\n   ID: ${dropdown.id || 'sem id'}`);
        console.log(`   Nome: ${dropdown.name || 'sem nome'}`);
        console.log(`   Label: ${dropdown.label}`);
        console.log(`   Opções (${dropdown.options.length}):`);
        dropdown.options.slice(0, 10).forEach(opt => {
          console.log(`     - "${opt.text}" (value: ${opt.value})`);
        });
      });
    }

    if (filters.checkboxes.length > 0) {
      console.log('\n☑️ CHECKBOXES:');
      filters.checkboxes.slice(0, 10).forEach(cb => {
        console.log(`   - ${cb.label} (value: ${cb.value}, checked: ${cb.checked})`);
      });
    }

    if (filters.radioButtons.length > 0) {
      console.log('\n🔘 RADIO BUTTONS:');
      filters.radioButtons.slice(0, 10).forEach(radio => {
        console.log(`   - ${radio.label} (value: ${radio.value}, checked: ${radio.checked})`);
      });
    }

    if (filters.links.length > 0) {
      console.log('\n🔗 LINKS DE TIPOS:');
      const uniqueLinks = [...new Set(filters.links.map(l => l.text))];
      uniqueLinks.forEach(text => {
        console.log(`   - ${text}`);
      });
    }

    if (filters.buttons.length > 0) {
      console.log('\n🔘 BOTÕES:');
      filters.buttons.slice(0, 10).forEach(btn => {
        console.log(`   - ${btn.text}`);
      });
    }

    if (filters.filterElements.length > 0) {
      console.log('\n🎯 ELEMENTOS COM CLASSES DE FILTRO:');
      filters.filterElements.slice(0, 10).forEach(el => {
        console.log(`   ${el.tag}: "${el.text}" (clicável: ${el.clickable})`);
      });
    }

    // Tentar interagir com filtros
    console.log('\n🧪 TENTANDO INTERAGIR COM FILTROS...\n');

    // Verificar se há select/dropdown
    const hasSelect = await page.$('select');
    if (hasSelect) {
      console.log('✅ Encontrou elemento SELECT');

      // Pegar opções
      const options = await page.evaluate(() => {
        const select = document.querySelector('select');
        return Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.text
        }));
      });

      console.log('\nOpções disponíveis:');
      options.forEach(opt => {
        console.log(`   - ${opt.text}`);
      });

      // Tentar selecionar uma opção
      if (options.length > 1) {
        console.log(`\n🔄 Selecionando: "${options[1].text}"`);
        await page.select('select', options[1].value);
        await new Promise(resolve => setTimeout(resolve, 3000));
        await page.screenshot({ path: 'filters-after.png' });
        console.log('📸 Screenshot após filtro: filters-after.png');
      }
    }

    console.log('\n⏸️ Navegador aberto para inspeção manual...');
    console.log('   Teste os filtros manualmente');
    console.log('   Pressione CTRL+C para fechar\n');

    // Manter aberto
    await new Promise(() => {});

  } catch (error) {
    console.error('Erro:', error.message);
  } finally {
    await browser.close();
  }
}

analyzeFilters();