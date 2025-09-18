import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
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

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

// Sistema de monitoramento
class ScraperMonitor {
  constructor() {
    this.stats = {
      startTime: new Date(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      apiErrors: [],
      productsScraped: 0,
      productsSaved: 0,
      lastSuccessTime: null,
      consecutiveFailures: 0
    };
    this.logFile = path.join(__dirname, 'scraper-monitor.log');
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}\n`;
    console.log(message);
    fs.appendFileSync(this.logFile, logMessage);
  }

  recordRequest(success, errorMessage = null) {
    this.stats.totalRequests++;
    if (success) {
      this.stats.successfulRequests++;
      this.stats.lastSuccessTime = new Date();
      this.stats.consecutiveFailures = 0;
    } else {
      this.stats.failedRequests++;
      this.stats.consecutiveFailures++;
      if (errorMessage) {
        this.stats.apiErrors.push({
          time: new Date().toISOString(),
          error: errorMessage
        });
        // Manter apenas últimos 50 erros
        if (this.stats.apiErrors.length > 50) {
          this.stats.apiErrors = this.stats.apiErrors.slice(-50);
        }
      }
    }
  }

  getHealthStatus() {
    const successRate = this.stats.totalRequests > 0
      ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2)
      : 0;

    const timeSinceLastSuccess = this.stats.lastSuccessTime
      ? Math.floor((new Date() - new Date(this.stats.lastSuccessTime)) / 1000 / 60)
      : null;

    return {
      healthy: this.stats.consecutiveFailures < 10,
      successRate: `${successRate}%`,
      consecutiveFailures: this.stats.consecutiveFailures,
      timeSinceLastSuccess: timeSinceLastSuccess ? `${timeSinceLastSuccess} minutos` : 'Nunca',
      totalRequests: this.stats.totalRequests,
      productsScraped: this.stats.productsScraped,
      productsSaved: this.stats.productsSaved
    };
  }

  printStatus() {
    const status = this.getHealthStatus();
    const runTime = Math.floor((new Date() - this.stats.startTime) / 1000 / 60);
    
    console.log('\n📊 ESTATÍSTICAS DO SCRAPER:');
    console.log(`  ⏱️ Tempo de execução: ${runTime} minutos`);
    console.log(`  🎯 Taxa de sucesso: ${status.successRate}`);
    console.log(`  📦 Produtos coletados: ${status.productsScraped}`);
    console.log(`  💾 Produtos salvos: ${status.productsSaved}`);
    console.log(`  🔄 Total de requisições: ${status.totalRequests}`);
    
    if (!status.healthy) {
      console.log(`  ⚠️ ALERTA: ${status.consecutiveFailures} falhas consecutivas!`);
    }
    console.log('');
  }
}

const monitor = new ScraperMonitor();

// Função de fetch resiliente
async function fetchWithRetry(url, retries = 5) {
  const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true&country_code=br`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      monitor.log(`Tentativa ${attempt}/${retries} para: ${url}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);

      const response = await fetch(apiUrl, {
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.ok) {
        const html = await response.text();
        monitor.recordRequest(true);
        monitor.log(`✅ Sucesso ao buscar: ${url}`);
        return html;
      }

      // Tratar diferentes códigos de erro
      if (response.status === 401) {
        monitor.log('❌ API Key inválida', 'ERROR');
        monitor.recordRequest(false, 'API Key inválida');
        return '';
      }

      if (response.status === 429) {
        const waitTime = attempt * 60000; // Aumenta tempo de espera a cada tentativa
        monitor.log(`⏳ Rate limit - aguardando ${waitTime/1000}s`, 'WARN');
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      if (response.status >= 500) {
        monitor.log(`⚠️ Erro servidor ${response.status}`, 'WARN');
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }

      throw new Error(`HTTP ${response.status}`);

    } catch (error) {
      monitor.log(`Erro na tentativa ${attempt}: ${error.message}`, 'ERROR');
      
      if (attempt === retries) {
        monitor.recordRequest(false, error.message);
        monitor.log(`❌ Falharam todas as tentativas para: ${url}`, 'ERROR');
        return '';
      }

      // Aguardar 2 minutos entre tentativas
      await new Promise(resolve => setTimeout(resolve, 120000));
    }
  }

  return '';
}

// Função principal resiliente
async function runResilientScraper() {
  monitor.log('🚀 INICIANDO SCRAPER RESILIENTE', 'INFO');
  monitor.log('Configurado para continuar mesmo com falhas da API', 'INFO');
  
  const categories = [
    { name: 'Móveis', url: 'https://casoca.com.br/moveis.html' },
    { name: 'Iluminação', url: 'https://casoca.com.br/iluminacao.html' }
  ];

  for (const category of categories) {
    monitor.log(`\n📁 Processando categoria: ${category.name}`);
    
    for (let page = 1; page <= 3; page++) { // Limitar a 3 páginas para teste
      const url = page === 1 ? category.url : `${category.url}?p=${page}`;
      
      const html = await fetchWithRetry(url);
      
      if (!html) {
        monitor.log(`Pulando página ${page} devido a erro`, 'WARN');
        continue; // Continuar com próxima página
      }

      const $ = cheerio.load(html);
      const products = [];

      $('.col-md-4.detail-product').each((index, element) => {
        const $el = $(element);
        const $container = $el.find('.product-container');
        
        const name = $container.find('.info h2').text().trim();
        const link = $container.find('a.product-item-photo').attr('href') || '';
        const imageUrl = $container.find('img').first().attr('src') || '';
        
        if (name) {
          products.push({
            name: name.substring(0, 200),
            image_url: imageUrl,
            link: link ? (link.startsWith('http') ? link : `https://casoca.com.br${link}`) : '',
            category: category.name,
            subcategory: 'Outros'
          });
        }
      });

      monitor.stats.productsScraped += products.length;
      monitor.log(`Encontrados ${products.length} produtos na página ${page}`);

      // Salvar produtos
      for (const product of products) {
        try {
          const { error } = await supabase
            .from('products')
            .upsert({
              name: product.name,
              image_url: product.image_url,
              link: product.link,
              category: product.category,
              subcategory: product.subcategory
            }, {
              onConflict: 'link'
            });

          if (!error) {
            monitor.stats.productsSaved++;
          }
        } catch (err) {
          monitor.log(`Erro ao salvar produto: ${err.message}`, 'ERROR');
        }
      }

      // Imprimir status a cada 5 requisições
      if (monitor.stats.totalRequests % 5 === 0) {
        monitor.printStatus();
      }

      // Verificar saúde do sistema
      const health = monitor.getHealthStatus();
      if (!health.healthy && monitor.stats.consecutiveFailures >= 15) {
        monitor.log('❌ Sistema muito instável, pausando por 10 minutos', 'ERROR');
        await new Promise(resolve => setTimeout(resolve, 600000)); // 10 minutos
        monitor.stats.consecutiveFailures = 0; // Reset contador
      }

      // Aguardar entre páginas
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  monitor.printStatus();
  monitor.log('✅ SCRAPER FINALIZADO', 'INFO');
  monitor.log(`Relatório salvo em: ${monitor.logFile}`, 'INFO');
}

// Executar
runResilientScraper().catch(err => {
  monitor.log(`ERRO CRÍTICO: ${err.message}`, 'FATAL');
  process.exit(1);
});