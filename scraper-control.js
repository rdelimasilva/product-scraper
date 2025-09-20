#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

// ============================================
// COMANDOS
// ============================================

async function showStatus() {
  log('\n📊 STATUS DO SCRAPER', 'bright');
  log('═══════════════════════════════════════', 'cyan');

  // Checkpoint status
  const checkpointPath = path.join(__dirname, 'scraper-checkpoint.json');
  if (fs.existsSync(checkpointPath)) {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

    log('\n📁 CHECKPOINT:', 'yellow');
    log(`  Iniciado em: ${new Date(checkpoint.startedAt).toLocaleString()}`);
    log(`  Última atualização: ${new Date(checkpoint.lastUpdate).toLocaleString()}`);

    log('\n📋 PROGRESSO POR CATEGORIA:', 'yellow');

    const categories = [
      'Iluminação',
      'Móveis',
      'Acessórios de Decoração',
      'Louças e Metais',
      'Eletros',
      'Portas e Janelas',
      'Escritório',
      'Quarto Infantil',
      'Móveis para Área Externa',
      'Cortinas e Persianas',
      'Vegetação',
      'Papéis de Parede',
      'Tapetes'
    ];

    for (const cat of categories) {
      const progress = checkpoint.categories[cat];
      if (progress) {
        if (progress.completed) {
          log(`  ✅ ${cat}: COMPLETO (${progress.totalProducts} produtos)`, 'green');
        } else {
          log(`  🔄 ${cat}: Página ${progress.lastPage} (${progress.totalProducts} produtos até agora)`, 'yellow');
        }
      } else {
        log(`  ⏸️ ${cat}: Não iniciado`, 'cyan');
      }
    }
  } else {
    log('  ❌ Nenhum checkpoint encontrado', 'red');
  }

  // Database status
  log('\n💾 BANCO DE DADOS:', 'yellow');

  try {
    // Total de produtos
    const { count: totalCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    log(`  Total de produtos: ${totalCount || 0}`, 'green');

    // Produtos por categoria
    const categories = [
      'Iluminação',
      'Móveis',
      'Acessórios de Decoração',
      'Louças e Metais',
      'Eletros'
    ];

    log('\n  Produtos por categoria:', 'cyan');
    for (const cat of categories) {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('category', cat);

      if (count > 0) {
        log(`    ${cat}: ${count}`, 'green');
      }
    }

    // Últimos produtos adicionados
    const { data: recent } = await supabase
      .from('products')
      .select('name, category, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    if (recent && recent.length > 0) {
      log('\n  Últimos produtos adicionados:', 'cyan');
      for (const prod of recent) {
        const time = new Date(prod.created_at).toLocaleString();
        log(`    ${prod.name.substring(0, 50)}... (${prod.category}) - ${time}`, 'green');
      }
    }

  } catch (error) {
    log(`  ❌ Erro ao acessar banco: ${error.message}`, 'red');
  }

  log('\n═══════════════════════════════════════\n', 'cyan');
}

async function resetCheckpoint() {
  const checkpointPath = path.join(__dirname, 'scraper-checkpoint.json');

  log('\n⚠️ RESET DO CHECKPOINT', 'yellow');
  log('═══════════════════════════════════════', 'cyan');

  if (fs.existsSync(checkpointPath)) {
    // Backup antes de resetar
    const backup = checkpointPath.replace('.json', `-backup-${Date.now()}.json`);
    fs.copyFileSync(checkpointPath, backup);
    log(`  📁 Backup criado: ${path.basename(backup)}`, 'green');

    // Resetar
    fs.unlinkSync(checkpointPath);
    log('  ✅ Checkpoint resetado', 'green');
    log('  ℹ️ O próximo scraping começará do início', 'cyan');
  } else {
    log('  ℹ️ Nenhum checkpoint para resetar', 'cyan');
  }

  log('═══════════════════════════════════════\n', 'cyan');
}

async function skipCategory(categoryName) {
  const checkpointPath = path.join(__dirname, 'scraper-checkpoint.json');

  log(`\n⏭️ PULANDO CATEGORIA: ${categoryName}`, 'yellow');
  log('═══════════════════════════════════════', 'cyan');

  let checkpoint = {};
  if (fs.existsSync(checkpointPath)) {
    checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  } else {
    checkpoint = {
      categories: {},
      startedAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString()
    };
  }

  // Contar produtos existentes
  const { count } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('category', categoryName);

  checkpoint.categories[categoryName] = {
    completed: true,
    totalProducts: count || 0,
    lastPage: 0,
    lastRun: new Date().toISOString()
  };
  checkpoint.lastUpdate = new Date().toISOString();

  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

  log(`  ✅ ${categoryName} marcada como completa`, 'green');
  log(`  📦 ${count || 0} produtos existentes`, 'cyan');
  log('═══════════════════════════════════════\n', 'cyan');
}

async function testConnection() {
  log('\n🔌 TESTANDO CONEXÕES', 'bright');
  log('═══════════════════════════════════════', 'cyan');

  // Testar Supabase
  log('\n📡 Testando Supabase...', 'yellow');
  try {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (error) throw error;

    log('  ✅ Supabase conectado!', 'green');

    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    log(`  📦 Total de produtos: ${count || 0}`, 'green');
  } catch (error) {
    log(`  ❌ Erro: ${error.message}`, 'red');
    log('  ℹ️ Verifique as credenciais no arquivo .env', 'cyan');
  }

  log('\n═══════════════════════════════════════\n', 'cyan');
}

// ============================================
// CLI
// ============================================

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  log('\n🎮 CONTROLE DO SCRAPER', 'bright');

  switch (command) {
    case 'status':
      await showStatus();
      break;

    case 'reset':
      await resetCheckpoint();
      break;

    case 'skip':
      const category = args[1];
      if (!category) {
        log('  ❌ Uso: node scraper-control.js skip "Nome da Categoria"', 'red');
      } else {
        await skipCategory(category);
      }
      break;

    case 'test':
      await testConnection();
      break;

    default:
      log('\n📋 COMANDOS DISPONÍVEIS:', 'yellow');
      log('═══════════════════════════════════════', 'cyan');
      log('  node scraper-control.js status', 'green');
      log('    → Mostra status do scraping e banco de dados\n');

      log('  node scraper-control.js reset', 'green');
      log('    → Reseta checkpoint (recomeça do zero)\n');

      log('  node scraper-control.js skip "Nome da Categoria"', 'green');
      log('    → Marca categoria como completa\n');

      log('  node scraper-control.js test', 'green');
      log('    → Testa conexão com Supabase\n');

      log('═══════════════════════════════════════', 'cyan');

      log('\n🚀 EXECUTAR SCRAPER:', 'yellow');
      log('═══════════════════════════════════════', 'cyan');
      log('  node scraper-advanced.js', 'green');
      log('    → Executa com checkpoint e paralelização\n');

      log('  node scraper-advanced.js --reset', 'green');
      log('    → Reseta e executa do zero\n');

      log('  node scraper-advanced.js --status', 'green');
      log('    → Mostra status do checkpoint\n');

      log('═══════════════════════════════════════\n', 'cyan');
      break;
  }
}

main().catch(error => {
  log(`\n❌ Erro: ${error.message}`, 'red');
  process.exit(1);
});