import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pLimit from 'p-limit';
import winston from 'winston';

dotenv.config();

// Configuração profissional de logs
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'scraping.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class ProfessionalCasocaScraper {
  constructor() {
    // ScraperAPI configuração
    this.apiKey = process.env.SCRAPER_API_KEY || 'YOUR_API_KEY';
    this.apiEndpoint = 'https://api.scraperapi.com';

    // Supabase
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Controle de concorrência profissional
    this.limit = pLimit(5); // 5 requisições simultâneas

    // Métricas
    this.stats = {
      totalProducts: 0,
      successfulScrapes: 0,
      failedScrapes: 0,
      startTime: Date.now(),
      errors: []
    };

    // Configuração de retry
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async scrapeWithAPI(url, retries = 0) {
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        url: url,
        render: 'true', // Renderiza JavaScript
        country_code: 'br', // IPs do Brasil
        premium: 'true', // Proxies premium
        session_number: Math.floor(Math.random() * 10000) // Sessão sticky
      });

      const response = await fetch(`${this.apiEndpoint}?${params}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return html;

    } catch (error) {
      logger.error(`Erro ao scrape ${url}: ${error.message}`);

      if (retries < this.maxRetries) {
        logger.info(`Tentando novamente... (${retries + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retries + 1)));
        return this.scrapeWithAPI(url, retries + 1);
      }

      throw error;
    }
  }

  parseProducts(html) {
    // Parser robusto com cheerio
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const products = [];

    $('.col-md-4.col-sm-6.detail-product').each((index, element) => {
      const product = {
        name: $(element).find('h3, h4').first().text().trim(),
        link: $(element).find('a').first().attr('href'),
        image_url: $(element).find('img').first().attr('src') ||
                   $(element).find('img').first().data('src'),
        timestamp: new Date().toISOString()
      };

      if (product.name && product.link) {
        // Garantir URL completa
        if (!product.link.startsWith('http')) {
          product.link = `https://casoca.com.br${product.link}`;
        }
        if (product.image_url && !product.image_url.startsWith('http')) {
          product.image_url = `https://casoca.com.br${product.image_url}`;
        }

        products.push(product);
      }
    });

    return products;
  }

  async saveToSupabase(products, category, subcategory) {
    const results = {
      success: 0,
      failed: 0
    };

    for (const product of products) {
      try {
        const productData = {
          ...product,
          category,
          subcategory
        };

        const { data, error } = await this.supabase
          .from('products')
          .upsert(productData, {
            onConflict: 'link', // Evita duplicatas
            returning: 'minimal'
          });

        if (error) throw error;

        results.success++;
        this.stats.successfulScrapes++;

        // Upload de imagem assíncrono
        if (product.image_url && data?.id) {
          this.uploadImageAsync(product.image_url, data.id);
        }

      } catch (error) {
        logger.error(`Erro ao salvar produto: ${error.message}`);
        results.failed++;
        this.stats.failedScrapes++;
      }
    }

    return results;
  }

  async uploadImageAsync(imageUrl, productId) {
    // Upload em background para não travar
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) return;

      const buffer = await response.arrayBuffer();
      const fileName = `${productId}.jpg`;

      await this.supabase.storage
        .from('product-images')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      await this.supabase
        .from('products')
        .update({ image_path: fileName })
        .eq('id', productId);

    } catch (error) {
      // Ignora erro de imagem, não é crítico
      logger.warn(`Erro upload imagem ${productId}: ${error.message}`);
    }
  }

  async scrapeCategory(category) {
    logger.info(`\n📁 Iniciando categoria: ${category.name}`);
    const categoryUrl = `https://casoca.com.br/${category.url}`;

    try {
      // Scrape página principal da categoria
      const html = await this.scrapeWithAPI(categoryUrl);

      // Extrair filtros de tipo
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);
      const filters = [];

      // Buscar links de filtros
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

      logger.info(`   Encontrados ${filters.length} filtros/subcategorias`);

      // Processar cada filtro
      for (const filter of filters.slice(0, 10)) { // Limitar para teste
        logger.info(`   📂 Processando: ${filter.name} (${filter.count} produtos)`);

        const filterHtml = await this.scrapeWithAPI(filter.url);
        const products = this.parseProducts(filterHtml);

        if (products.length > 0) {
          const results = await this.saveToSupabase(
            products.slice(0, 50), // Limitar para teste
            category.name,
            filter.name
          );

          logger.info(`      ✅ Salvos: ${results.success}, Erros: ${results.failed}`);
        }

        // Delay profissional entre requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      logger.error(`Erro na categoria ${category.name}: ${error.message}`);
      this.stats.errors.push({
        category: category.name,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async scrapeAll() {
    logger.info('🚀 INICIANDO SCRAPING PROFISSIONAL COM SCRAPERAPI\n');
    logger.info('════════════════════════════════════════════════\n');

    const categories = [
      { name: 'Móveis', url: 'moveis.html' },
      { name: 'Iluminação', url: 'iluminacao.html' },
      { name: 'Decoração', url: 'decoracao.html' }
    ];

    // Processar categorias com limite de concorrência
    const promises = categories.map(category =>
      this.limit(() => this.scrapeCategory(category))
    );

    await Promise.all(promises);

    // Relatório final
    this.generateReport();
  }

  generateReport() {
    const duration = (Date.now() - this.stats.startTime) / 1000 / 60;

    logger.info('\n════════════════════════════════════════════════');
    logger.info('📊 RELATÓRIO FINAL');
    logger.info('════════════════════════════════════════════════\n');
    logger.info(`✅ Produtos salvos: ${this.stats.successfulScrapes}`);
    logger.info(`❌ Falhas: ${this.stats.failedScrapes}`);
    logger.info(`⏱️ Tempo total: ${duration.toFixed(2)} minutos`);
    logger.info(`💰 Custo estimado: $${(this.stats.successfulScrapes * 0.0004).toFixed(2)}`);

    if (this.stats.errors.length > 0) {
      logger.error('\n⚠️ ERROS ENCONTRADOS:');
      this.stats.errors.forEach(err => {
        logger.error(`   ${err.category}: ${err.error}`);
      });
    }

    // Salvar relatório em JSON
    const fs = require('fs').promises;
    fs.writeFile(
      `scraping-report-${Date.now()}.json`,
      JSON.stringify(this.stats, null, 2)
    );
  }
}

// Executar
async function main() {
  // Verificar configuração
  if (!process.env.SCRAPER_API_KEY) {
    logger.error('❌ Configure SCRAPER_API_KEY no arquivo .env');
    logger.info('📝 Cadastre-se em: https://www.scraperapi.com');
    logger.info('💳 Plano Hobby: $39/mês = 100.000 requests');
    return;
  }

  const scraper = new ProfessionalCasocaScraper();

  try {
    await scraper.scrapeAll();
  } catch (error) {
    logger.error('Erro fatal:', error);
  }
}

// Tratamento profissional de erros
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('\n⚠️ Scraping interrompido pelo usuário');
  process.exit(0);
});

main();