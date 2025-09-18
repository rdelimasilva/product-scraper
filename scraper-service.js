import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log file path
const logFile = path.join(__dirname, 'scraper-service.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage);
}

log('════════════════════════════════════════');
log('🚀 CASOCA SCRAPER SERVICE INICIADO');
log('════════════════════════════════════════');

// Função para executar o scraper
async function runScraper() {
  log('🔄 Iniciando execução do scraper...');
  
  try {
    const { stdout, stderr } = await execAsync('node scraper-complete-pagination.js', {
      cwd: __dirname,
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    
    // Log apenas resumo final
    const lines = stdout.split('\n');
    const summaryStart = lines.findIndex(line => line.includes('RESUMO FINAL'));
    if (summaryStart !== -1) {
      const summary = lines.slice(summaryStart, summaryStart + 10).join('\n');
      log('📊 Resumo do scraping:\n' + summary);
    } else {
      log('✅ Scraper executado com sucesso');
    }
    
    if (stderr) {
      log('⚠️ Avisos: ' + stderr);
    }
    
  } catch (error) {
    log('❌ Erro ao executar scraper: ' + error.message);
  }
  
  log('🕑 Próxima execução em 6 horas\n');
}

// Executar imediatamente na primeira vez
log('🔍 Executando scraper inicial...');
runScraper();

// Agendar para executar a cada 6 horas
// Formato: '0 */6 * * *' = a cada 6 horas
cron.schedule('0 */6 * * *', () => {
  log('⏰ Execução agendada iniciada');
  runScraper();
});

// Manter o processo rodando
log('✅ Serviço configurado para executar a cada 6 horas');
log('📝 Logs salvos em: ' + logFile);

// Capturar sinais de encerramento
process.on('SIGINT', () => {
  log('🛑 Serviço interrompido (SIGINT)');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('🛑 Serviço encerrado (SIGTERM)');
  process.exit(0);
});