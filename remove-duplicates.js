import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Interface para confirmação do usuário
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function analyzeDuplicates() {
  log('\n════════════════════════════════════════════════', 'cyan');
  log('🔍 ANÁLISE DE DUPLICATAS NO BANCO DE DADOS', 'bright');
  log('════════════════════════════════════════════════\n', 'cyan');

  try {
    // Buscar TODOS os produtos
    log('📥 Buscando todos os produtos do banco...', 'yellow');

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
    log(`✅ Total de produtos no banco: ${allProducts.length}\n`, 'green');

    // Análise de duplicatas
    log('🔍 Analisando duplicatas...', 'yellow');

    const duplicateGroups = new Map();
    const processedKeys = new Set();

    // Agrupar por name + image_url
    for (const product of allProducts) {
      // Criar chave única baseada em name e image_url
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
      log('✅ Nenhuma duplicata encontrada!\n', 'green');
      return;
    }

    // Relatório de duplicatas
    log(`\n⚠️ DUPLICATAS ENCONTRADAS: ${duplicates.length} grupos\n`, 'yellow');

    let totalDuplicateProducts = 0;
    let duplicatesByCategory = {};

    // Mostrar exemplos
    log('📋 EXEMPLOS DE DUPLICATAS:', 'cyan');
    log('─'.repeat(50), 'cyan');

    for (let i = 0; i < Math.min(5, duplicates.length); i++) {
      const group = duplicates[i];
      const firstProduct = group.products[0];

      log(`\n${i + 1}. "${firstProduct.name.substring(0, 60)}..."`, 'yellow');
      log(`   Categoria: ${firstProduct.category}`, 'cyan');
      log(`   Duplicatas: ${group.products.length} produtos`, 'red');
      log(`   IDs: ${group.products.map(p => p.id).join(', ')}`, 'cyan');

      // Contar por categoria
      if (!duplicatesByCategory[firstProduct.category]) {
        duplicatesByCategory[firstProduct.category] = 0;
      }
      duplicatesByCategory[firstProduct.category] += group.products.length - 1;
      totalDuplicateProducts += group.products.length - 1;
    }

    // Estatísticas
    log('\n' + '═'.repeat(50), 'cyan');
    log('📊 ESTATÍSTICAS:', 'bright');
    log('─'.repeat(50), 'cyan');
    log(`  Total de grupos duplicados: ${duplicates.length}`, 'yellow');
    log(`  Total de produtos duplicados: ${totalDuplicateProducts}`, 'red');
    log(`  Produtos únicos após limpeza: ${allProducts.length - totalDuplicateProducts}`, 'green');

    log('\n📁 DUPLICATAS POR CATEGORIA:', 'cyan');
    for (const [cat, count] of Object.entries(duplicatesByCategory)) {
      log(`  • ${cat}: ${count} duplicatas`, 'yellow');
    }

    // Preparar IDs para remoção
    const idsToRemove = [];
    for (const group of duplicates) {
      // Manter o primeiro (mais antigo), remover os outros
      for (let i = 1; i < group.products.length; i++) {
        idsToRemove.push(group.products[i].id);
      }
    }

    log('\n' + '═'.repeat(50), 'cyan');
    log(`\n🗑️ PRODUTOS A SEREM REMOVIDOS: ${idsToRemove.length}`, 'red');

    // Perguntar confirmação
    log('\n⚠️ ATENÇÃO: Esta ação não pode ser desfeita!', 'yellow');
    const answer = await askQuestion('\n❓ Deseja remover as duplicatas? (sim/não): ');

    if (answer.toLowerCase() === 'sim' || answer.toLowerCase() === 's') {
      await removeDuplicates(idsToRemove);
    } else {
      log('\n❌ Operação cancelada pelo usuário.', 'yellow');
    }

  } catch (error) {
    log(`\n❌ Erro: ${error.message}`, 'red');
  } finally {
    rl.close();
  }
}

async function removeDuplicates(idsToRemove) {
  log('\n🗑️ REMOVENDO DUPLICATAS...', 'yellow');
  log('─'.repeat(50), 'cyan');

  const batchSize = 100;
  let removed = 0;

  try {
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
    log(`\n✅ LIMPEZA CONCLUÍDA!`, 'green');
    log(`  • ${removed} produtos duplicados removidos`, 'green');

    // Verificar novo total
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    log(`  • Total de produtos agora: ${count}`, 'cyan');
    log('\n' + '═'.repeat(50), 'cyan');

  } catch (error) {
    log(`\n❌ Erro ao remover: ${error.message}`, 'red');
  }
}

// Modo dry-run (apenas análise)
async function dryRun() {
  log('\n════════════════════════════════════════════════', 'cyan');
  log('🔍 MODO DRY-RUN (Apenas Análise)', 'bright');
  log('════════════════════════════════════════════════\n', 'cyan');

  try {
    log('📥 Buscando produtos...', 'yellow');

    // Buscar uma amostra
    const { data, error } = await supabase
      .from('products')
      .select('name, image_url, category')
      .limit(10000);

    if (error) throw error;

    const duplicateCheck = new Map();
    let duplicateCount = 0;

    for (const product of data) {
      const key = `${product.name}|||${product.image_url}`;

      if (duplicateCheck.has(key)) {
        duplicateCount++;
        duplicateCheck.get(key).count++;
      } else {
        duplicateCheck.set(key, {
          product,
          count: 1
        });
      }
    }

    log(`\n📊 ANÁLISE RÁPIDA (primeiros 10.000):`, 'cyan');
    log(`  • Total analisado: ${data.length}`, 'yellow');
    log(`  • Duplicatas encontradas: ${duplicateCount}`, 'red');
    log(`  • Taxa de duplicação: ${(duplicateCount / data.length * 100).toFixed(2)}%`, 'yellow');

    if (duplicateCount > 0) {
      log('\n💡 Execute sem --dry-run para análise completa e remoção', 'cyan');
    } else {
      log('\n✅ Nenhuma duplicata encontrada na amostra!', 'green');
    }

  } catch (error) {
    log(`\n❌ Erro: ${error.message}`, 'red');
  }

  rl.close();
}

// ============================================
// EXECUTAR
// ============================================

const args = process.argv.slice(2);

if (args.includes('--help')) {
  log('\n📋 REMOVE DUPLICATAS - AJUDA', 'bright');
  log('════════════════════════════════', 'cyan');
  log('\nUSO:', 'yellow');
  log('  node remove-duplicates.js          # Análise completa e remoção', 'green');
  log('  node remove-duplicates.js --dry-run # Apenas análise rápida', 'green');
  log('  node remove-duplicates.js --help    # Esta ajuda', 'green');
  log('\nCRITÉRIO DE DUPLICATA:', 'yellow');
  log('  Produtos com mesmo name E mesmo image_url', 'cyan');
  log('  Mantém o mais antigo (primeiro criado)', 'cyan');
  log('  Remove todos os outros', 'cyan');
  process.exit(0);
}

if (args.includes('--dry-run')) {
  dryRun();
} else {
  analyzeDuplicates();
}