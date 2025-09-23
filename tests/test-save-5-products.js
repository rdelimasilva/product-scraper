import { HierarchicalCasocaScraper } from './scraper-hierarchical.js';

async function testSave5Products() {
  const scraper = new HierarchicalCasocaScraper();

  try {
    console.log('🚀 Teste: Salvando 5 produtos no Supabase...\n');
    console.log('='*60 + '\n');

    await scraper.initialize();
    console.log('✅ Navegador iniciado\n');

    // Navegar e extrair produtos da categoria Móveis
    console.log('📂 Acessando categoria Móveis...');
    const url = 'https://casoca.com.br/moveis.html';

    await scraper.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log('✅ Página carregada\n');

    // Extrair apenas 5 produtos
    console.log('🔍 Extraindo 5 produtos...');
    const products = await scraper.page.evaluate(() => {
      const productElements = document.querySelectorAll('.col-md-4.col-sm-6.detail-product');
      const extractedProducts = [];

      // Pegar apenas os primeiros 5 produtos
      for (let i = 0; i < Math.min(5, productElements.length); i++) {
        const element = productElements[i];

        // Nome do produto
        let name = '';
        const nameSelectors = ['h3', 'h4', '.product-name', '.title', 'a'];
        for (const selector of nameSelectors) {
          const nameEl = element.querySelector(selector);
          if (nameEl && nameEl.textContent.trim()) {
            name = nameEl.textContent.trim();
            break;
          }
        }

        // Imagem
        let imageUrl = '';
        const img = element.querySelector('img');
        if (img) {
          imageUrl = img.src || img.dataset.src || '';
        }

        // Link
        let productLink = '';
        const link = element.querySelector('a[href]');
        if (link) {
          productLink = link.href;
        }

        if (name && imageUrl && productLink) {
          // Inferir subcategoria pelo nome do produto
          let subcategory = 'Geral';
          const nameLower = name.toLowerCase();

          if (nameLower.includes('poltrona')) subcategory = 'Poltronas';
          else if (nameLower.includes('cadeira')) subcategory = 'Cadeiras';
          else if (nameLower.includes('mesa')) subcategory = 'Mesas';
          else if (nameLower.includes('sofá') || nameLower.includes('sofa')) subcategory = 'Sofás';
          else if (nameLower.includes('banqueta')) subcategory = 'Banquetas';
          else if (nameLower.includes('cama')) subcategory = 'Camas';
          else if (nameLower.includes('armário') || nameLower.includes('armario')) subcategory = 'Armários';
          else if (nameLower.includes('estante')) subcategory = 'Estantes';
          else if (nameLower.includes('rack')) subcategory = 'Racks';

          extractedProducts.push({
            name: name,
            image_url: imageUrl,
            link: productLink,
            category: 'Móveis',
            subcategory: subcategory
          });
        }
      }

      return extractedProducts;
    });

    console.log(`✅ ${products.length} produtos extraídos\n`);

    // Mostrar produtos que serão salvos
    console.log('📋 Produtos a serem salvos:');
    products.forEach((product, index) => {
      console.log(`   ${index + 1}. ${product.name}`);
    });
    console.log();

    // Salvar produtos no Supabase
    console.log('💾 Salvando no Supabase...\n');
    let savedCount = 0;

    for (const product of products) {
      console.log(`   Salvando: ${product.name}...`);

      const saved = await scraper.saveProductToSupabase(product);

      if (saved) {
        savedCount++;
        console.log(`   ✅ Salvo com ID: ${saved.id}`);
      } else {
        console.log(`   ❌ Erro ao salvar`);
      }
    }

    console.log('\n' + '='*60);
    console.log(`📊 RESULTADO FINAL:`);
    console.log(`   Total extraído: ${products.length}`);
    console.log(`   Total salvo: ${savedCount}`);
    console.log(`   Taxa de sucesso: ${(savedCount/products.length * 100).toFixed(0)}%`);
    console.log('='*60);

    if (savedCount > 0) {
      console.log('\n✨ Produtos salvos com sucesso no Supabase!');
      console.log('   Verifique sua tabela "products" no painel do Supabase.');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await scraper.close();
    console.log('\n👋 Teste finalizado');
  }
}

// Executar o teste
testSave5Products();