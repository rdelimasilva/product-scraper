#!/bin/bash

echo "🔧 CONFIGURANDO CATEGORIAS COMPLETAS"
echo "===================================="

# Parar scraper se estiver rodando
echo "⏸️  Parando scraper..."
pm2 stop scraper-advanced 2>/dev/null || true

# Resetar checkpoint
echo "🔄 Resetando checkpoint..."
node scraper-control.js reset

# Marcar categorias completas
echo "✅ Marcando categorias completas..."

node scraper-control.js skip "Iluminação"
echo "  • Iluminação marcada como completa"

node scraper-control.js skip "Louças e Metais"
echo "  • Louças e Metais marcada como completa"

node scraper-control.js skip "Eletros"
echo "  • Eletros marcada como completa"

node scraper-control.js skip "Vegetação"
echo "  • Vegetação marcada como completa"

node scraper-control.js skip "Quarto Infantil"
echo "  • Quarto Infantil marcada como completa"

echo ""
echo "📋 CATEGORIAS QUE SERÃO PROCESSADAS:"
echo "  • Móveis (75.4% - faltam 2363)"
echo "  • Revestimentos (0% - faltam 3336)"
echo "  • Acessórios (78.1% - faltam 819)"
echo "  • Comercial (0% - faltam 600)"
echo "  • Escritório (64.0% - faltam 458)"
echo "  • Portas e Janelas (84.8% - faltam 40)"
echo "  • Construção (0% - faltam 192)"
echo ""

# Deletar processo antigo do PM2
pm2 delete scraper-advanced 2>/dev/null || true

# Iniciar scraper
echo "🚀 Iniciando scraper..."
pm2 start scraper-advanced.js --name scraper-advanced --no-autorestart

echo ""
echo "✅ CONFIGURAÇÃO COMPLETA!"
echo ""
echo "📊 Comandos úteis:"
echo "  pm2 logs scraper-advanced        # Ver logs"
echo "  pm2 status                       # Ver status"
echo "  node analyze-status.js           # Ver progresso"
echo ""