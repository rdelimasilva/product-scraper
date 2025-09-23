import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function removeDuplicates() {
  console.log('\n════════════════════════════════════════════════');
  console.log('🔍 REMOÇÃO AUTOMÁTICA DE DUPLICATAS');
  console.log('════════════════════════════════════════════════\n');

  try {
    // Buscar TODOS os produtos
    console.log('📥 Buscando todos os produtos do banco...');

    let allProducts = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        offset += limit;
        process.stdout.write(`\r  Produtos carregados: ${allProducts.length}`);
      } else {
        hasMore = false;
      }
    }

    console.log('');
    console.log(`✅ Total de produtos no banco: ${allProducts.length}\n`);

    // Análise de duplicatas
    console.log('🔍 Analisando duplicatas...');

    const duplicateGroups = new Map();

    // Agrupar por name + image_url
    for (const product of allProducts) {
      const key = `${product.name}|||${product.image_url}`;

      if (!duplicateGroups.has(key)) {
        duplicateGroups.set(key, []);
      }
      duplicateGroups.get(key).push(product);
    }

    // Filtrar apenas grupos com duplicatas
    const duplicates = [];
    for (const [key, products] of duplicateGroups.entries()) {
      if (products.length > 1) {
        duplicates.push({
          key,
          products: products.sort((a, b) =>
            new Date(a.created_at) - new Date(b.created_at)
          )
        });
      }
    }

    if (duplicates.length === 0) {
      console.log('✅ Nenhuma duplicata encontrada!\n');
      return;
    }

    // Preparar IDs para remoção
    const idsToRemove = [];
    let duplicatesByCategory = {};

    for (const group of duplicates) {
      // Manter o primeiro (mais antigo), remover os outros
      for (let i = 1; i < group.products.length; i++) {
        idsToRemove.push(group.products[i].id);

        const category = group.products[i].category;
        if (!duplicatesByCategory[category]) {
          duplicatesByCategory[category] = 0;
        }
        duplicatesByCategory[category]++;
      }
    }

    // Estatísticas
    console.log(`\n📊 DUPLICATAS ENCONTRADAS:`);
    console.log(`  • Grupos duplicados: ${duplicates.length}`);
    console.log(`  • Total a remover: ${idsToRemove.length}`);

    console.log('\n📁 POR CATEGORIA:');
    for (const [cat, count] of Object.entries(duplicatesByCategory)) {
      console.log(`  • ${cat}: ${count} duplicatas`);
    }

    // REMOVER DUPLICATAS
    console.log('\n🗑️ REMOVENDO DUPLICATAS...');

    const batchSize = 100;
    let removed = 0;

    for (let i = 0; i < idsToRemove.length; i += batchSize) {
      const batch = idsToRemove.slice(i, i + batchSize);

      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', batch);

      if (error) throw error;

      removed += batch.length;
      process.stdout.write(`\r  Removidos: ${removed}/${idsToRemove.length}`);
    }

    console.log('');
    console.log(`\n✅ LIMPEZA CONCLUÍDA!`);
    console.log(`  • ${removed} produtos duplicados removidos`);

    // Verificar novo total
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    console.log(`  • Total de produtos agora: ${count}`);
    console.log(`  • Economia: ${((removed / allProducts.length) * 100).toFixed(1)}% do banco`);

  } catch (error) {
    console.log(`\n❌ Erro: ${error.message}`);
  }
}

// Executar
removeDuplicates();