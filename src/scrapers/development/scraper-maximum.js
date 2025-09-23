#!/usr/bin/env node

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

// Configurações para máxima extração
const CONFIG = {
  MAX_PAGES_PER_CATEGORY: 1000,  // Aumentado para 1000 páginas
  CONCURRENT_REQUESTS: 2,         // 2 requisições simultâneas
  RETRY_ATTEMPTS: 5,             // 5 tentativas por página
  EMPTY_PAGES_THRESHOLD: 5,      // Para após 5 páginas vazias (aumentado)
  WAIT_BETWEEN_PAGES: 3000,      // 3 segundos entre páginas
  WAIT_BETWEEN_RETRIES: 120000,  // 2 minutos entre tentativas
  BATCH_SIZE: 50,                // Salvar em lotes de 50
};

const limit = pLimit(CONFIG.CONCURRENT_REQUESTS);

// Estatísticas globais
const stats = {
  startTime: new Date(),
  totalProducts: 0,
  totalPages: 0,
  totalSaved: 0,
  totalErrors: 0,
  categoriesProcessed: 0,
  apiCalls: 0
};

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  fs.appendFileSync('scraper-maximum.log', `[${timestamp}] ${message}\n`);
}

function inferSubcategory(productName, category) {
  const nameLower = productName.toLowerCase();
  
  if (category === 'Móveis') {
    if (nameLower.includes('poltrona')) return 'Poltronas';
    if (nameLower.includes('cadeira')) return 'Cadeiras';
    if (nameLower.includes('mesa')) return 'Mesas';
    if (nameLower.includes('sofá')) return 'Sofás';
    if (nameLower.includes('banqueta')) return 'Banquetas';
    if (nameLower.includes('banco')) return 'Bancos';
    if (nameLower.includes('estante')) return 'Estantes';
    if (nameLower.includes('cama')) return 'Camas';
    if (nameLower.includes('armário')) return 'Armários';
  }
  
  if (category === 'Iluminação') {
    if (nameLower.includes('pendente')) return 'Pendentes';
    if (nameLower.includes('luminária de mesa') || nameLower.includes('abajur')) return 'Luminárias de Mesa';
    if (nameLower.includes('luminária de piso')) return 'Luminárias de Piso';
    if (nameLower.includes('arandela')) return 'Arandelas';
    if (nameLower.includes('plafon')) return 'Plafons';
    if (nameLower.includes('lustre')) return 'Lustres';
    if (nameLower.includes('spot')) return 'Spots';
    if (nameLower.includes('poste')) return 'Postes';
  }
  
  return 'Outros';
}

async function fetchWithRetry(url, retries = CONFIG.RETRY_ATTEMPTS) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      stats.apiCalls++;
      
      const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(apiUrl, {
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        return await response.text();
      }

      if (response.status === 429) {
        log(`⏳ Rate limit - aguardando ${attempt * 60}s`);
        await new Promise(resolve => setTimeout(resolve, attempt * 60000));
        continue;
      }

      if (response.status >= 500 && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }

      throw new Error(`HTTP ${response.status}`);

    } catch (error) {
      if (attempt === retries) {
        log(`❌ Falha após ${retries} tentativas: ${url}`);
        return '';
      }
      await new Promise(resolve => setTimeout(resolve, CONFIG.WAIT_BETWEEN_RETRIES));
    }
  }
  return '';
}

async function extractProducts(html, category) {
  const $ = cheerio.load(html);
  const products = [];

  $('.col-md-4.detail-product').each((index, element) => {
    const $el = $(element);
    const $container = $el.find('.product-container');

    const name = $container.find('.info h2').text().trim() ||
                 $container.find('.product-text strong').text().trim();
    
    const link = $container.find('a.product.photo.product-item-photo, a.product-item-photo').attr('href') || '';
    const imageUrl = $container.find('img').first().attr('src') || '';

    if (name && name.length > 0) {
      products.push({
        name: name.substring(0, 200),
        image_url: imageUrl,
        link: link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : `https://casoca.com.br/p/${Date.now()}-${index}`,
        category: category,
        subcategory: inferSubcategory(name, category)
      });
    }
  });

  return products;
}

async function saveProductsBatch(products) {
  const results = { saved: 0, errors: 0 };

  for (const product of products) {
    try {
      // Primeiro verificar se existe
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('link', product.link)
        .single();

      if (existing) {
        // UPDATE
        const { error } = await supabase
          .from('products')
          .update({
            name: product.name,
            image_url: product.image_url,
            category: product.category,
            subcategory: product.subcategory,
            updated_at: new Date().toISOString()
          })
          .eq('link', product.link);

        if (!error) {
          results.saved++;
          stats.totalSaved++;
        } else {
          log(`  ⚠️ Erro UPDATE: ${error.message}`);
          results.errors++;
          stats.totalErrors++;
        }
      } else {
        // INSERT
        const { error } = await supabase
          .from('products')
          .insert({
            name: product.name,
            image_url: product.image_url,
            link: product.link,
            category: product.category,
            subcategory: product.subcategory
          });

        if (!error) {
          results.saved++;
          stats.totalSaved++;
        } else if (error.code === '23505') {
          // Duplicado - ignorar
          log(`  ℹ️ Produto já existe: ${product.name}`);
        } else {
          log(`  ⚠️ Erro INSERT: ${error.message}`);
          results.errors++;
          stats.totalErrors++;
        }
      }
    } catch (err) {
      log(`  ⚠️ Erro ao salvar: ${err.message}`);
      results.errors++;
      stats.totalErrors++;
    }
  }

  return results;
}

async function scrapeCategoryMaximum(category) {
  log(`\n📁 INICIANDO: ${category.name}`);
  log(`URL Base: ${category.url}`);
  
  let consecutiveEmptyPages = 0;
  let categoryStats = {
    products: 0,
    pages: 0,
    saved: 0
  };
  
  const productsBatch = [];
  
  for (let page = 1; page <= CONFIG.MAX_PAGES_PER_CATEGORY; page++) {
    const url = page === 1 ? category.url : `${category.url}?p=${page}`;
    
    log(`  📄 Página ${page}: ${url}`);
    
    const html = await fetchWithRetry(url);
    
    if (!html) {
      log(`  ⚠️ Falha ao buscar página ${page}`);
      consecutiveEmptyPages++;
      
      if (consecutiveEmptyPages >= CONFIG.EMPTY_PAGES_THRESHOLD) {
        log(`  🛑 ${CONFIG.EMPTY_PAGES_THRESHOLD} páginas vazias consecutivas - finalizando categoria`);
        break;
      }
      continue;
    }
    
    const products = await extractProducts(html, category.name);
    
    if (products.length === 0) {
      consecutiveEmptyPages++;
      log(`  ⚠️ Página ${page} vazia (${consecutiveEmptyPages} consecutivas)`);
      
      if (consecutiveEmptyPages >= CONFIG.EMPTY_PAGES_THRESHOLD) {
        log(`  🛑 ${CONFIG.EMPTY_PAGES_THRESHOLD} páginas vazias - finalizando categoria`);
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
      categoryStats.products += products.length;
      stats.totalProducts += products.length;
      
      log(`  ✅ ${products.length} produtos encontrados`);
      
      // Adicionar ao batch
      productsBatch.push(...products);
      
      // Salvar quando atingir o tamanho do batch
      if (productsBatch.length >= CONFIG.BATCH_SIZE) {
        const result = await saveProductsBatch(productsBatch.splice(0, CONFIG.BATCH_SIZE));
        categoryStats.saved += result.saved;
        log(`  💾 Salvos: ${result.saved}, Erros: ${result.errors}`);
      }
    }
    
    categoryStats.pages++;
    stats.totalPages++;
    
    // Mostrar progresso a cada 10 páginas
    if (page % 10 === 0) {
      log(`  📊 Progresso: ${page} páginas, ${categoryStats.products} produtos`);
    }
    
    // Aguardar entre páginas
    await new Promise(resolve => setTimeout(resolve, CONFIG.WAIT_BETWEEN_PAGES));
  }
  
  // Salvar produtos restantes
  if (productsBatch.length > 0) {
    const result = await saveProductsBatch(productsBatch);
    categoryStats.saved += result.saved;
    log(`  💾 Batch final - Salvos: ${result.saved}`);
  }
  
  log(`\n✅ ${category.name} COMPLETO:`);
  log(`   • Páginas processadas: ${categoryStats.pages}`);
  log(`   • Produtos encontrados: ${categoryStats.products}`);
  log(`   • Produtos salvos: ${categoryStats.saved}`);
  
  return categoryStats;
}

async function runMaximumScraper() {
  log('🚀 SCRAPER MÁXIMO INICIADO');
  log('════════════════════════════════');
  log('Configurações:');
  log(`  • Máx páginas/categoria: ${CONFIG.MAX_PAGES_PER_CATEGORY}`);
  log(`  • Requisições paralelas: ${CONFIG.CONCURRENT_REQUESTS}`);
  log(`  • Tentativas por página: ${CONFIG.RETRY_ATTEMPTS}`);
  log('════════════════════════════════\n');
  
  const categories = [
    { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
    { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' },
    { name: 'Acessórios de Decoração', url: 'https://casoca.com.br/acessorios-de-decoracao.html' },
    { name: 'Louças e Metais', url: 'https://casoca.com.br/loucas-e-metais.html' },
    { name: 'Eletros', url: 'https://casoca.com.br/eletros.html' },
    { name: 'Portas e Janelas', url: 'https://casoca.com.br/portas-e-janelas.html' },
    { name: 'Escritório', url: 'https://casoca.com.br/escritorio.html' },
    { name: 'Quarto Infantil', url: 'https://casoca.com.br/quarto-infantil.html' },
    { name: 'Móveis para Área Externa', url: 'https://casoca.com.br/moveis/moveis-para-area-externa.html' },
    { name: 'Cortinas e Persianas', url: 'https://casoca.com.br/acessorios-de-decoracao/cortinas-e-persianas.html' },
    { name: 'Vegetação', url: 'https://casoca.com.br/vegetacao.html' },
    { name: 'Papéis de Parede', url: 'https://casoca.com.br/revestimentos/revestimentos-de-parede/papeis-de-parede.html' },
    { name: 'Tapetes', url: 'https://casoca.com.br/acessorios-de-decoracao/tapetes.html' }
  ];
  
  for (const category of categories) {
    await scrapeCategoryMaximum(category);
    stats.categoriesProcessed++;
    
    // Pequena pausa entre categorias
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  const runTime = Math.floor((new Date() - stats.startTime) / 1000 / 60);
  
  log('\n════════════════════════════════');
  log('📊 RESUMO FINAL:');
  log(`  ⏱️ Tempo total: ${runTime} minutos`);
  log(`  📁 Categorias: ${stats.categoriesProcessed}`);
  log(`  📄 Páginas: ${stats.totalPages}`);
  log(`  📦 Produtos encontrados: ${stats.totalProducts}`);
  log(`  💾 Produtos salvos: ${stats.totalSaved}`);
  log(`  ❌ Erros: ${stats.totalErrors}`);
  log(`  🌐 Chamadas API: ${stats.apiCalls}`);
  log(`  📈 Média produtos/página: ${(stats.totalProducts / stats.totalPages).toFixed(1)}`);
  log('════════════════════════════════');
  log('✅ SCRAPER FINALIZADO!');
}

// Executar
log('Iniciando em 3 segundos...');
setTimeout(() => {
  runMaximumScraper().catch(err => {
    log(`❌ ERRO CRÍTICO: ${err.message}`);
    console.error(err);
    process.exit(1);
  });
}, 3000);