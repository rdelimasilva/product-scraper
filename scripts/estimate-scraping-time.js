import puppeteer from 'puppeteer';

async function estimateScrapingTime() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    console.log('📊 ANÁLISE DE TEMPO PARA SCRAPING COMPLETO\n');
    console.log('════════════════════════════════════════════════\n');

    // Acessar página de móveis
    console.log('📍 Analisando categorias e produtos...\n');

    await page.goto('https://casoca.com.br/moveis.html', {
      waitUntil: 'domcontentloaded'
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Clicar em "Móveis por:" e depois "Tipo"
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      for (const el of elements) {
        if (el.textContent && el.textContent.includes('Móveis por:')) {
          const links = el.parentElement?.querySelectorAll('a, button');
          if (links) {
            for (const link of links) {
              if (link.textContent?.toLowerCase().includes('tipo')) {
                link.click();
                return true;
              }
            }
          }
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extrair todos os filtros de tipo
    const filters = await page.evaluate(() => {
      const typeFilters = [];
      const links = document.querySelectorAll('a');

      links.forEach(link => {
        const text = link.textContent?.trim();
        const href = link.href;

        if (text && href && text.match(/\([\d]+\)$/)) {
          const match = text.match(/^(.+?)\s*\(([\d]+)\)$/);
          if (match) {
            typeFilters.push({
              name: match[1].trim(),
              count: parseInt(match[2]),
              url: href
            });
          }
        }
      });

      return typeFilters;
    });

    console.log('📈 ESTATÍSTICAS DO SITE:\n');
    console.log(`Total de subcategorias (filtros): ${filters.length}\n`);

    // Calcular total de produtos
    let totalProducts = 0;
    const categories = {};

    filters.forEach(filter => {
      totalProducts += filter.count;

      // Agrupar por tipo principal
      const name = filter.name.toLowerCase();
      if (name.includes('mesa')) categories['Mesas'] = (categories['Mesas'] || 0) + filter.count;
      else if (name.includes('sofá') || name.includes('sofa')) categories['Sofás'] = (categories['Sofás'] || 0) + filter.count;
      else if (name.includes('poltrona')) categories['Poltronas'] = (categories['Poltronas'] || 0) + filter.count;
      else if (name.includes('cadeira')) categories['Cadeiras'] = (categories['Cadeiras'] || 0) + filter.count;
      else if (name.includes('cama')) categories['Camas'] = (categories['Camas'] || 0) + filter.count;
      else categories['Outros'] = (categories['Outros'] || 0) + filter.count;
    });

    console.log('📦 DISTRIBUIÇÃO DE PRODUTOS:\n');
    Object.entries(categories).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} produtos`);
    });

    console.log(`\n   TOTAL GERAL: ${totalProducts} produtos\n`);

    // Mostrar top 10 subcategorias
    console.log('🔝 TOP 10 SUBCATEGORIAS:\n');
    const sortedFilters = filters.sort((a, b) => b.count - a.count);
    sortedFilters.slice(0, 10).forEach((filter, i) => {
      console.log(`   ${i + 1}. ${filter.name}: ${filter.count} produtos`);
    });

    // ESTIMATIVA DE TEMPO
    console.log('\n\n⏱️ ESTIMATIVA DE TEMPO DE SCRAPING:\n');
    console.log('════════════════════════════════════════════════\n');

    // Métricas de tempo
    const timeMetrics = {
      navegacaoPorPagina: 5, // segundos para carregar cada página
      extracaoPorProduto: 0.1, // segundos para extrair dados de cada produto
      salvamentoPorProduto: 0.5, // segundos para salvar no Supabase + imagem
      produtosPorPagina: 30, // média de produtos por página
      pausaEntreRequisicoes: 2 // segundos de pausa para não sobrecarregar
    };

    // Calcular número de páginas
    const totalPages = Math.ceil(totalProducts / timeMetrics.produtosPorPagina);

    // Tempo por página
    const tempoPorPagina =
      timeMetrics.navegacaoPorPagina +
      (timeMetrics.produtosPorPagina * timeMetrics.extracaoPorProduto) +
      (timeMetrics.produtosPorPagina * timeMetrics.salvamentoPorProduto) +
      timeMetrics.pausaEntreRequisicoes;

    // Tempo total
    const tempoTotalSegundos = totalPages * tempoPorPagina;
    const tempoTotalMinutos = tempoTotalSegundos / 60;
    const tempoTotalHoras = tempoTotalMinutos / 60;

    console.log('📊 MÉTRICAS UTILIZADAS:');
    console.log(`   - Tempo de navegação por página: ${timeMetrics.navegacaoPorPagina}s`);
    console.log(`   - Tempo de extração por produto: ${timeMetrics.extracaoPorProduto}s`);
    console.log(`   - Tempo de salvamento por produto: ${timeMetrics.salvamentoPorProduto}s`);
    console.log(`   - Produtos por página: ${timeMetrics.produtosPorPagina}`);
    console.log(`   - Pausa entre requisições: ${timeMetrics.pausaEntreRequisicoes}s\n`);

    console.log('📈 CÁLCULOS:');
    console.log(`   - Total de produtos: ${totalProducts}`);
    console.log(`   - Total de páginas estimadas: ${totalPages}`);
    console.log(`   - Tempo por página: ${tempoPorPagina.toFixed(1)}s\n`);

    console.log('⏰ TEMPO TOTAL ESTIMADO:');
    console.log(`   - ${tempoTotalSegundos.toFixed(0)} segundos`);
    console.log(`   - ${tempoTotalMinutos.toFixed(1)} minutos`);
    console.log(`   - ${tempoTotalHoras.toFixed(2)} horas\n`);

    // Cenários diferentes
    console.log('🎯 CENÁRIOS DE SCRAPING:\n');

    // Cenário 1: Apenas primeiros produtos
    const produtos100 = (100 * (timeMetrics.extracaoPorProduto + timeMetrics.salvamentoPorProduto)) / 60;
    console.log(`   📌 Primeiros 100 produtos: ${produtos100.toFixed(1)} minutos`);

    // Cenário 2: Uma categoria
    const umaCategoria = (categories['Poltronas'] * (timeMetrics.extracaoPorProduto + timeMetrics.salvamentoPorProduto)) / 60;
    console.log(`   📌 Apenas Poltronas (${categories['Poltronas']} produtos): ${umaCategoria.toFixed(1)} minutos`);

    // Cenário 3: Scraping paralelo
    const paralelo = tempoTotalHoras / 3; // Assumindo 3 threads
    console.log(`   📌 Scraping paralelo (3 threads): ${paralelo.toFixed(2)} horas`);

    // Recomendações
    console.log('\n\n💡 RECOMENDAÇÕES:\n');
    console.log('   1. Implementar scraping em lotes (ex: 100 produtos por vez)');
    console.log('   2. Adicionar sistema de retry para falhas');
    console.log('   3. Implementar cache para evitar re-scraping');
    console.log('   4. Considerar scraping incremental (apenas novos produtos)');
    console.log('   5. Usar múltiplas instâncias do navegador para paralelização');
    console.log('   6. Implementar logs detalhados para monitoramento');
    console.log('   7. Adicionar delays adaptativos baseados na resposta do servidor');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    console.log('\n✅ Análise concluída');
  }
}

estimateScrapingTime();