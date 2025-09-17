import { CasocaScraper } from './scraper-casoca.js';

async function testSingleCategory() {
  const scraper = new CasocaScraper();

  try {
    console.log('🚀 Iniciando teste do scraper...\n');

    // Testar apenas uma categoria
    scraper.categories = ['moveis']; // Testar apenas móveis

    await scraper.initialize();
    console.log('✅ Navegador iniciado\n');

    await scraper.scrapeAllCategories();

  } catch (error) {
    console.error('❌ Erro:', error);
    console.error('Stack:', error.stack);
  } finally {
    await scraper.close();
    console.log('\n✨ Teste finalizado');
  }
}

testSingleCategory();