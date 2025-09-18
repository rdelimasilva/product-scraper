#!/usr/bin/env node

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log file
const logFile = path.join(__dirname, 'scraper-run.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logFile, logMessage);
}

log('════════════════════════════════════════');
log('🚀 INICIANDO CASOCA SCRAPER');
log('════════════════════════════════════════');

log('📦 Executando scraper completo...');
log('Isso pode levar vários minutos...');

// Executar o scraper
const scraperProcess = exec('node scraper-complete-pagination.js', {
  cwd: __dirname,
  maxBuffer: 50 * 1024 * 1024 // 50MB buffer
});

// Capturar saída em tempo real
scraperProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

scraperProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

scraperProcess.on('close', (code) => {
  if (code === 0) {
    log('\n✅ Scraper executado com sucesso!');
  } else {
    log(`\n❌ Scraper finalizado com código: ${code}`);
  }
  log('📝 Log salvo em: ' + logFile);
});

scraperProcess.on('error', (error) => {
  log('❌ Erro ao executar scraper: ' + error.message);
  process.exit(1);
});