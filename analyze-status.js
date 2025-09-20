import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Totais do site (fornecidos pelo usuário)
const SITE_TOTALS = {
  'Móveis': 9600,
  'Iluminação': 3072,
  'Acessórios de Decoração': 3744,
  'Comercial': 600,
  'Escritório': 1272,
  'Revestimentos': 3336,
  'Louças e Metais': 1008,
  'Eletros': 456,
  'Vegetação': 72,
  'Portas e Janelas': 264,
  'Construção': 192,
  'Quarto Infantil': 192
};

async function analyzeCategories() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 ANÁLISE DE COMPLETUDE DAS CATEGORIAS');
  console.log('='.repeat(80) + '\n');

  let totalSite = 0;
  let totalBanco = 0;
  let categoriasCompletas = 0;
  let categoriasIncompletas = [];
  let produtosFaltantes = 0;

  for (const [category, expectedTotal] of Object.entries(SITE_TOTALS)) {
    totalSite += expectedTotal;

    // Contar produtos no banco
    const { count, error } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('category', category);

    const existingCount = count || 0;
    totalBanco += existingCount;

    const percentage = (existingCount / expectedTotal * 100).toFixed(1);
    const missing = expectedTotal - existingCount;

    // Determinar status
    let status = '';
    let symbol = '';

    if (percentage >= 95) {
      status = '✅ COMPLETA';
      symbol = '✅';
      categoriasCompletas++;
    } else if (percentage >= 50) {
      status = '🔄 PARCIAL';
      symbol = '🔄';
      categoriasIncompletas.push({ name: category, missing });
      produtosFaltantes += missing;
    } else {
      status = '❌ PENDENTE';
      symbol = '❌';
      categoriasIncompletas.push({ name: category, missing });
      produtosFaltantes += missing;
    }

    // Formatar output
    const categoryPad = category.padEnd(25);
    const countStr = `${existingCount}/${expectedTotal}`.padEnd(12);
    const percentStr = `${percentage}%`.padStart(6);

    console.log(`${symbol} ${categoryPad} ${countStr} ${percentStr} ${status}`);

    if (missing > 0 && percentage < 95) {
      console.log(`   └─ Faltam: ${missing} produtos`);
    }
  }

  // Resumo geral
  console.log('\n' + '='.repeat(80));
  console.log('📈 RESUMO GERAL');
  console.log('='.repeat(80));

  const totalPercentage = (totalBanco / totalSite * 100).toFixed(1);

  console.log(`\n📦 Total no site:        ${totalSite.toLocaleString()} produtos`);
  console.log(`💾 Total no banco:       ${totalBanco.toLocaleString()} produtos`);
  console.log(`📊 Completude geral:     ${totalPercentage}%`);
  console.log(`✅ Categorias completas: ${categoriasCompletas}/12`);
  console.log(`⚠️  Produtos faltantes:   ${produtosFaltantes.toLocaleString()}`);

  if (categoriasIncompletas.length > 0) {
    console.log('\n🎯 PRIORIDADES (categorias incompletas):');
    console.log('─'.repeat(50));

    // Ordenar por quantidade de produtos faltantes
    categoriasIncompletas.sort((a, b) => b.missing - a.missing);

    for (const cat of categoriasIncompletas.slice(0, 5)) {
      console.log(`  • ${cat.name}: faltam ${cat.missing} produtos`);
    }
  }

  // Estimativa de tempo
  if (produtosFaltantes > 0) {
    const minutosEstimados = Math.ceil(produtosFaltantes / 60); // ~60 produtos/minuto
    const horasEstimadas = (minutosEstimados / 60).toFixed(1);

    console.log('\n⏱️  ESTIMATIVA DE TEMPO:');
    console.log('─'.repeat(50));
    console.log(`  Para completar 100%: ~${horasEstimadas} horas`);
    console.log(`  Com paralelização 2x: ~${(horasEstimadas / 2).toFixed(1)} horas`);
  }

  console.log('\n' + '='.repeat(80));

  // Gerar recomendação
  if (totalPercentage >= 95) {
    console.log('\n✅ RECOMENDAÇÃO: Scraping praticamente completo!');
    console.log('   Considere executar apenas atualizações incrementais.');
  } else if (totalPercentage >= 70) {
    console.log('\n🔄 RECOMENDAÇÃO: Continue com scraper-advanced.js');
    console.log('   Ele pulará automaticamente categorias completas.');
  } else {
    console.log('\n🚀 RECOMENDAÇÃO: Execute scraper-advanced.js com paralelização');
    console.log('   para acelerar a extração dos produtos faltantes.');
  }

  console.log('\n');
}

// Executar análise
analyzeCategories().catch(error => {
  console.error('❌ Erro:', error.message);
});