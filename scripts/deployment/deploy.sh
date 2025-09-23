#!/bin/bash

echo "🚀 Deploy do Scraper Avançado"
echo "================================"

# Parar scraper atual
echo "⏸️ Parando scraper atual..."
pm2 stop scraper-unflare 2>/dev/null || true

# Atualizar código
echo "📥 Atualizando código..."
git pull origin main

# Instalar dependências se necessário
echo "📦 Verificando dependências..."
npm install

# Testar conexão
echo "🔌 Testando conexão com Supabase..."
node scraper-control.js test

# Mostrar status
echo "📊 Status atual:"
node scraper-control.js status

echo ""
echo "================================"
echo "✅ Deploy completo!"
echo ""
echo "🎮 COMANDOS DISPONÍVEIS:"
echo ""
echo "1️⃣ Iniciar scraper avançado (com checkpoint):"
echo "   pm2 start scraper-advanced.js --name scraper-advanced"
echo ""
echo "2️⃣ Iniciar e pular categorias já feitas:"
echo "   node scraper-control.js skip 'Iluminação'"
echo "   node scraper-control.js skip 'Móveis'"
echo "   pm2 start scraper-advanced.js --name scraper-advanced"
echo ""
echo "3️⃣ Resetar e começar do zero:"
echo "   node scraper-advanced.js --reset"
echo ""
echo "4️⃣ Ver logs:"
echo "   pm2 logs scraper-advanced"
echo ""
echo "5️⃣ Ver status:"
echo "   node scraper-control.js status"
echo ""