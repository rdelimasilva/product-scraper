import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createTestRecords() {
  console.log('📝 Criando 5 registros de teste com subcategorias reais...\n');

  const testProducts = [
    {
      name: 'Poltrona Charles Eames',
      category: 'Móveis',
      subcategory: 'Poltronas',
      image_url: 'https://casoca.com.br/imagens/poltrona-teste.jpg',
      link: 'https://casoca.com.br/poltrona-charles-eames.html'
    },
    {
      name: 'Mesa de Jantar Industrial',
      category: 'Móveis',
      subcategory: 'Mesas de Jantar',
      image_url: 'https://casoca.com.br/imagens/mesa-jantar-teste.jpg',
      link: 'https://casoca.com.br/mesa-jantar-industrial.html'
    },
    {
      name: 'Cadeira Tolix',
      category: 'Móveis',
      subcategory: 'Cadeiras',
      image_url: 'https://casoca.com.br/imagens/cadeira-teste.jpg',
      link: 'https://casoca.com.br/cadeira-tolix.html'
    },
    {
      name: 'Sofá Retrô 3 Lugares',
      category: 'Móveis',
      subcategory: 'Sofás',
      image_url: 'https://casoca.com.br/imagens/sofa-teste.jpg',
      link: 'https://casoca.com.br/sofa-retro-3-lugares.html'
    },
    {
      name: 'Banqueta Alta Industrial',
      category: 'Móveis',
      subcategory: 'Banquetas',
      image_url: 'https://casoca.com.br/imagens/banqueta-teste.jpg',
      link: 'https://casoca.com.br/banqueta-alta-industrial.html'
    }
  ];

  let successCount = 0;
  const savedProducts = [];

  for (const product of testProducts) {
    try {
      console.log(`💾 Salvando: ${product.name}`);
      console.log(`   Categoria: ${product.category}`);
      console.log(`   Subcategoria: ${product.subcategory}`);

      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      if (error) {
        console.error(`   ❌ Erro: ${error.message}\n`);
      } else {
        console.log(`   ✅ Salvo com ID: ${data.id}\n`);
        successCount++;
        savedProducts.push(data);

        // Simular upload de imagem (apenas criar o registro do caminho)
        if (data.id) {
          const imagePath = `${data.id}.jpg`;
          await supabase
            .from('products')
            .update({ image_path: imagePath })
            .eq('id', data.id);
        }
      }
    } catch (error) {
      console.error(`   ❌ Erro ao processar: ${error.message}\n`);
    }
  }

  console.log('═'.repeat(50));
  console.log(`📊 RESUMO:`);
  console.log(`   Total de produtos criados: ${successCount}/5`);
  console.log('═'.repeat(50));

  if (savedProducts.length > 0) {
    console.log('\n📋 IDs dos produtos criados:');
    savedProducts.forEach(p => {
      console.log(`   ID ${p.id}: ${p.name} (${p.subcategory})`);
    });
  }
}

createTestRecords();