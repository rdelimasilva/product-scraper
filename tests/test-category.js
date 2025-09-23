import { HierarchicalCasocaScraper } from './scraper-hierarchical.js';

async function testSingleCategory() {
  const scraper = new HierarchicalCasocaScraper();

  try {
    console.log('🚀 Testando categoria Móveis...\n');

    await scraper.initialize();

    // Testar apenas categoria Móveis
    const products = await scraper.navigateAndExtractProducts(
      'https://casoca.com.br/moveis.html',
      'Móveis',
      null
    );

    console.log(`\n✅ Produtos encontrados: ${products.length}`);

    if (products.length > 0) {
      console.log('\n📦 Primeiros 3 produtos:');
      products.slice(0, 3).forEach((product, index) => {
        console.log(`\n${index + 1}. ${product.name}`);
        console.log(`   Categoria: ${product.category}`);
        console.log(`   Subcategoria: ${product.subcategory || 'N/A'}`);
        console.log(`   Link: ${product.link}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await scraper.close();
    console.log('\n👋 Teste finalizado');
  }
}

testSingleCategory();