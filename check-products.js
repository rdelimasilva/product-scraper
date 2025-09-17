import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, category, subcategory, created_at')
    .order('id', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Erro:', error);
    return;
  }

  console.log('\n📊 ÚLTIMOS PRODUTOS SALVOS:\n');
  console.log('ID | Categoria | Subcategoria | Nome');
  console.log('-'.repeat(80));

  data.forEach(product => {
    console.log(`${product.id} | ${product.category || 'N/A'} | ${product.subcategory || 'N/A'} | ${product.name}`);
  });

  // Contar por subcategoria
  const { data: stats } = await supabase
    .from('products')
    .select('subcategory')
    .not('subcategory', 'is', null);

  const counts = {};
  stats?.forEach(item => {
    counts[item.subcategory] = (counts[item.subcategory] || 0) + 1;
  });

  console.log('\n📈 PRODUTOS POR SUBCATEGORIA:\n');
  Object.entries(counts).forEach(([subcategory, count]) => {
    console.log(`  ${subcategory}: ${count} produtos`);
  });

  console.log('\n📊 TOTAL DE PRODUTOS: ' + data.length);
}

checkProducts();