#!/bin/bash

echo "🚀 DEPLOY DO SCRAPER CORRIGIDO"
echo "================================"

# Servidor
SERVER="65.109.162.165"
USER="root"
PROJECT_DIR="/root/product-scraper"

echo "📦 Preparando arquivos locais..."

# Commit e push no git
echo "📤 Enviando para GitHub..."
git add .
git commit -m "Fix: Corrigido bug de duplicação - usando .limit(1) ao invés de .single()"
git push origin main

echo "🖥️ Conectando ao servidor..."

# Deploy no servidor
ssh $USER@$SERVER << 'EOF'
cd /root/product-scraper

echo "⏸️ Parando scrapers antigos..."
pm2 stop all
pm2 delete all

echo "📥 Baixando atualizações..."
git pull origin main

echo "📦 Instalando dependências..."
npm install

echo "🧹 Limpando duplicados do banco..."
# Execute o SQL diretamente no Supabase ou use um script Node

echo "🚀 Iniciando scraper corrigido..."
pm2 start src/scrapers/development/scraper-advanced.js --name scraper-prod --no-autorestart

echo "📊 Status:"
pm2 status

echo "✅ Deploy completo!"
echo "Comandos úteis:"
echo "  pm2 logs scraper-prod    # Ver logs"
echo "  pm2 status               # Ver status"
echo "  pm2 stop scraper-prod    # Parar scraper"
EOF

echo "✅ Deploy finalizado!"