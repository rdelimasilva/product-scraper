import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

async function checkAPIStatus() {
  console.log('🔍 Verificando status da Scraper API\n');
  console.log('API Key:', SCRAPER_API_KEY);
  console.log('\n════════════════════════════════\n');
  
  // Teste 1: Account status
  try {
    console.log('📊 Verificando status da conta...');
    const statusUrl = `http://api.scraperapi.com/account?api_key=${SCRAPER_API_KEY}`;
    const response = await fetch(statusUrl);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Status da API:');
      console.log('  • Requisições usadas:', data.requestCount || 'N/A');
      console.log('  • Limite:', data.requestLimit || 'N/A');
      console.log('  • Requisições restantes:', (data.requestLimit - data.requestCount) || 'N/A');
      console.log('  • Concurrent requests:', data.concurrentRequests || 'N/A');
    } else {
      console.log('❌ Erro ao verificar status:', response.status);
    }
  } catch (err) {
    console.log('❌ Erro:', err.message);
  }
  
  console.log('\n════════════════════════════════\n');
  
  // Teste 2: Fazer uma requisição simples
  console.log('🧪 Testando requisição simples...');
  
  try {
    const testUrl = 'https://httpbin.org/ip';
    const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(testUrl)}`;
    
    console.log('Fazendo requisição para:', testUrl);
    const start = Date.now();
    
    const response = await fetch(apiUrl, {
      timeout: 30000
    });
    
    const elapsed = Date.now() - start;
    
    if (response.ok) {
      const text = await response.text();
      console.log('✅ Requisição bem-sucedida!');
      console.log('  • Tempo:', elapsed + 'ms');
      console.log('  • Resposta:', text.substring(0, 100));
    } else {
      console.log('❌ Erro na requisição:', response.status, response.statusText);
      
      if (response.status === 403) {
        console.log('  ⚠️ API key pode estar inválida ou expirada');
      } else if (response.status === 429) {
        console.log('  ⚠️ Rate limit atingido - aguarde antes de tentar novamente');
      }
    }
  } catch (err) {
    console.log('❌ Erro:', err.message);
  }
  
  console.log('\n════════════════════════════════\n');
  
  // Teste 3: Testar com o site real
  console.log('🌐 Testando com casoca.com.br...');
  
  try {
    const testUrl = 'https://casoca.com.br/iluminacao.html';
    const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(testUrl)}&render=false`;
    
    console.log('Fazendo requisição para:', testUrl);
    console.log('(sem render para ser mais rápido)\n');
    
    const start = Date.now();
    const response = await fetch(apiUrl, {
      timeout: 60000
    });
    const elapsed = Date.now() - start;
    
    if (response.ok) {
      const html = await response.text();
      console.log('✅ Site acessível via API!');
      console.log('  • Tempo:', elapsed + 'ms');
      console.log('  • HTML recebido:', html.length, 'bytes');
      console.log('  • Título:', html.match(/<title>(.*?)<\/title>/)?.[1] || 'N/A');
    } else {
      console.log('❌ Erro ao acessar site:', response.status);
      
      if (response.status === 500) {
        console.log('  ⚠️ Erro no servidor da API - tente novamente mais tarde');
      }
    }
  } catch (err) {
    console.log('❌ Erro:', err.message);
  }
  
  console.log('\n════════════════════════════════\n');
  console.log('📋 RECOMENDAÇÕES:\n');
  
  console.log('1. Se houver muitos erros 500: Aguarde 1-2 horas');
  console.log('2. Se rate limit: Reduza velocidade ou aguarde');
  console.log('3. Se API key inválida: Verifique no dashboard');
  console.log('4. Dashboard: https://dashboard.scraperapi.com');
}

checkAPIStatus();