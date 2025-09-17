import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import winston from 'winston';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

// Configuração de logs profissional
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

class ProductionCasocaScraper {
  constructor() {
    // ScraperAPI
    this.apiKey = process.env.SCRAPER_API_KEY;
    if (!this.apiKey) {
      logger.error('SCRAPER_API_KEY não configurada!');
      process.exit(1);
    }

    this.apiEndpoint = 'https://api.scraperapi.com';

    // Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Controle de concorrência
    this.limit = pLimit(parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 5);

    // Batch size
    this.batchSize = parseInt(process.env.BATCH_SIZE) || 1000;

    // Estado do scraper
    this.state = {
      totalProducts: 0,
      processedProducts: 0,
      successfulSaves: 0,
      failedSaves: 0,
      currentCategory: null,
      currentSubcategory: null,
      startTime: Date.now(),
      lastCheckpoint: null
    };

    // Checkpoint para retomar
    this.checkpointFile = 'checkpoint.json';
  }

  async loadCheckpoint() {
    try {
      const data = await fs.readFile(this.checkpointFile, 'utf-8');
      this.state = JSON.parse(data);
      logger.info('✅ Checkpoint carregado, retomando do último ponto');
      return true;
    } catch (error) {
      logger.info('🆕 Iniciando novo scraping');
      return false;
    }
  }

  async saveCheckpoint() {
    try {
      await fs.writeFile(
        this.checkpointFile,
        JSON.stringify(this.state, null, 2)
      );
      this.state.lastCheckpoint = Date.now();
    } catch (error) {
      logger.error('Erro ao salvar checkpoint:', error);
    }
  }

  async scrapeWithAPI(url, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const params = new URLSearchParams({
          api_key: this.apiKey,
          url: url,
          render: 'true',
          country_code: 'br'
        });

        const response = await fetch(`${this.apiEndpoint}?${params}`);

        if (response.ok) {
          return await response.text();
        }

        // Rate limit? Aguardar
        if (response.status === 429) {
          const waitTime = 60000 * (attempt + 1);
          logger.warn(`Rate limit atingido, aguardando ${waitTime/1000}s...`);
          await new Promise(r => setTimeout(r, waitTime));
          continue;
        }

        throw new Error(`HTTP ${response.status}`);

      } catch (error) {
        logger.error(`Tentativa ${attempt + 1}/${retries} falhou:`, error.message);
        if (attempt === retries - 1) throw error;
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  parseProducts(html) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const products = [];

    $('.col-md-4.col-sm-6.detail-product').each((index, element) => {
      try {
        const $el = $(element);
        const link = $el.find('a').first().attr('href');

        if (!link) return;

        const product = {
          name: $el.find('h3, h4').first().text().trim(),
          link: link.startsWith('http') ? link : `https://casoca.com.br${link}`,
          image_url: $el.find('img').first().attr('src') ||
                     $el.find('img').first().data('src'),
          timestamp: new Date().toISOString()
        };

        if (product.name) {
          if (product.image_url && !product.image_url.startsWith('http')) {
            product.image_url = `https://casoca.com.br${product.image_url}`;
          }
          products.push(product);
        }
      } catch (error) {
        logger.error('Erro ao parsear produto:', error);
      }
    });

    return products;
  }

  async saveToSupabase(products, category, subcategory) {
    const results = { success: 0, failed: 0 };

    // Processar em lotes menores para Supabase
    const chunks = [];
    for (let i = 0; i < products.length; i += 50) {
      chunks.push(products.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      try {
        const productsData = chunk.map(p => ({
          ...p,
          category,
          subcategory
        }));

        const { error } = await this.supabase
          .from('products')
          .upsert(productsData, {
            onConflict: 'link',
            returning: 'minimal'
          });

        if (error) throw error;

        results.success += chunk.length;
        this.state.successfulSaves += chunk.length;

      } catch (error) {
        logger.error('Erro ao salvar lote:', error);
        results.failed += chunk.length;
        this.state.failedSaves += chunk.length;
      }
    }

    return results;
  }

  async scrapeCategory(category) {
    logger.info(`\n📁 Categoria: ${category.name}`);
    this.state.currentCategory = category.name;

    try {
      // Primeiro, pegar a página da categoria
      const categoryUrl = `https://casoca.com.br/${category.url}`;
      const html = await this.scrapeWithAPI(categoryUrl);

      // Extrair filtros
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);
      const filters = [];

      // Buscar links de filtros com contagem
      $('a').each((i, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr('href');

        if (text.match(/\(\d+\)$/) && href) {
          const match = text.match(/^(.+?)\s*\((\d+)\)$/);
          if (match) {
            filters.push({
              name: match[1].trim(),
              count: parseInt(match[2]),
              url: href.startsWith('http') ? href : `https://casoca.com.br${href}`
            });
          }
        }
      });

      logger.info(`   📊 ${filters.length} subcategorias encontradas`);

      // Processar cada filtro
      for (const filter of filters) {
        // Verificar se já foi processado
        if (this.state.lastCheckpoint &&
            this.state.currentSubcategory &&
            filter.name <= this.state.currentSubcategory) {
          logger.info(`   ⏭️ Pulando ${filter.name} (já processado)`);
          continue;
        }

        this.state.currentSubcategory = filter.name;
        logger.info(`   📂 ${filter.name} (${filter.count} produtos)`);

        try {
          const filterHtml = await this.scrapeWithAPI(filter.url);
          const products = this.parseProducts(filterHtml);

          if (products.length > 0) {
            const results = await this.saveToSupabase(
              products,
              category.name,
              filter.name
            );

            this.state.processedProducts += products.length;
            logger.info(`      ✅ Salvos: ${results.success}, Erros: ${results.failed}`);
          }

          // Salvar checkpoint a cada subcategoria
          await this.saveCheckpoint();

          // Delay entre requests
          await new Promise(r => setTimeout(r, 1000));

        } catch (error) {
          logger.error(`   ❌ Erro em ${filter.name}:`, error.message);
        }

        // Status a cada 100 produtos
        if (this.state.processedProducts % 100 === 0) {
          this.printStatus();
        }
      }

    } catch (error) {
      logger.error(`Erro na categoria ${category.name}:`, error);
    }
  }

  printStatus() {
    const elapsed = (Date.now() - this.state.startTime) / 1000 / 60;
    const rate = this.state.processedProducts / elapsed;

    logger.info('\n📊 STATUS:');
    logger.info(`   Processados: ${this.state.processedProducts}`);
    logger.info(`   Salvos: ${this.state.successfulSaves}`);
    logger.info(`   Erros: ${this.state.failedSaves}`);
    logger.info(`   Tempo: ${elapsed.toFixed(1)} min`);
    logger.info(`   Taxa: ${rate.toFixed(0)} produtos/min`);
    logger.info(`   Custo estimado: $${(this.state.processedProducts * 0.0004).toFixed(2)}\n`);
  }

  async run() {
    logger.info('🚀 INICIANDO SCRAPER DE PRODUÇÃO\n');
    logger.info('═══════════════════════════════════\n');

    // Carregar checkpoint se existir
    await this.loadCheckpoint();

    const categories = [
      { name: 'Móveis', url: 'moveis.html' },
      { name: 'Iluminação', url: 'iluminacao.html' },
      { name: 'Decoração', url: 'decoracao.html' },
      { name: 'Mesa Posta', url: 'mesa-posta.html' },
      { name: 'Têxtil', url: 'textil.html' },
      { name: 'Infantil', url: 'infantil.html' },
      { name: 'Escritório', url: 'escritorio.html' },
      { name: 'Área Externa', url: 'area-externa.html' }
    ];

    // Processar categorias sequencialmente
    for (const category of categories) {
      // Pular categorias já processadas
      if (this.state.lastCheckpoint &&
          this.state.currentCategory &&
          category.name < this.state.currentCategory) {
        logger.info(`⏭️ Pulando categoria ${category.name} (já processada)`);
        continue;
      }

      await this.scrapeCategory(category);

      // Checkpoint após cada categoria
      await this.saveCheckpoint();
    }

    // Relatório final
    this.generateFinalReport();
  }

  generateFinalReport() {
    const duration = (Date.now() - this.state.startTime) / 1000 / 60;

    logger.info('\n═══════════════════════════════════');
    logger.info('📊 RELATÓRIO FINAL');
    logger.info('═══════════════════════════════════\n');
    logger.info(`✅ Produtos processados: ${this.state.processedProducts}`);
    logger.info(`✅ Salvos com sucesso: ${this.state.successfulSaves}`);
    logger.info(`❌ Falhas: ${this.state.failedSaves}`);
    logger.info(`⏱️ Tempo total: ${duration.toFixed(2)} minutos`);
    logger.info(`💰 Custo total: $${(this.state.processedProducts * 0.0004).toFixed(2)}`);
    logger.info(`📈 Taxa média: ${(this.state.processedProducts / duration).toFixed(0)} produtos/min`);

    // Salvar relatório
    const report = {
      ...this.state,
      duration: duration,
      endTime: Date.now(),
      cost: (this.state.processedProducts * 0.0004).toFixed(2)
    };

    fs.writeFile(
      `report-${Date.now()}.json`,
      JSON.stringify(report, null, 2)
    );
  }
}

// Função principal
async function main() {
  const scraper = new ProductionCasocaScraper();

  // Tratamento de sinais para salvar checkpoint
  process.on('SIGINT', async () => {
    logger.info('\n⚠️ Interrupção detectada, salvando checkpoint...');
    await scraper.saveCheckpoint();
    scraper.printStatus();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('\n⚠️ Término detectado, salvando checkpoint...');
    await scraper.saveCheckpoint();
    process.exit(0);
  });

  try {
    await scraper.run();
  } catch (error) {
    logger.error('Erro fatal:', error);
    await scraper.saveCheckpoint();
    process.exit(1);
  }
}

// Criar diretório de logs
await fs.mkdir('logs', { recursive: true });

// Executar
main();