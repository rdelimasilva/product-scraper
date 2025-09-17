#!/bin/bash

# Deploy Script para Hetzner VPS
# ScraperAPI + Casoca Scraper

echo "🚀 DEPLOY PARA HETZNER VPS"
echo "================================"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Verificar se está rodando como root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Este script precisa rodar como root${NC}"
   exit 1
fi

echo -e "${GREEN}📦 Atualizando sistema...${NC}"
apt update && apt upgrade -y

echo -e "${GREEN}📦 Instalando Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

echo -e "${GREEN}📦 Instalando Git...${NC}"
apt install -y git

echo -e "${GREEN}📦 Instalando PM2 (Process Manager)...${NC}"
npm install -g pm2

echo -e "${GREEN}📦 Instalando dependências do Chromium (para backup)...${NC}"
apt install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6

echo -e "${GREEN}📂 Criando diretório do projeto...${NC}"
mkdir -p /opt/casoca-scraper
cd /opt/casoca-scraper

echo -e "${GREEN}📥 Clonando repositório...${NC}"
# SUBSTITUA com seu repositório
# git clone https://github.com/SEU-USUARIO/web-scraper-supabase.git .

echo -e "${GREEN}📝 Criando arquivo de ambiente...${NC}"
cat > .env << 'EOF'
# ScraperAPI
SCRAPER_API_KEY=SUA_CHAVE_AQUI

# Supabase
SUPABASE_URL=https://aseetrfsmvrckrqlgllk.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# Configurações
NODE_ENV=production
LOG_LEVEL=info
MAX_CONCURRENT_REQUESTS=5
BATCH_SIZE=1000
EOF

echo -e "${YELLOW}⚠️  IMPORTANTE: Edite o arquivo .env com suas chaves!${NC}"
echo -e "${YELLOW}   nano /opt/casoca-scraper/.env${NC}"

echo -e "${GREEN}📦 Instalando dependências do projeto...${NC}"
npm install

echo -e "${GREEN}🔧 Configurando PM2...${NC}"
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo -e "${GREEN}📊 Configurando monitoramento...${NC}"
# Criar script de monitoramento
cat > monitor.sh << 'EOF'
#!/bin/bash
echo "📊 STATUS DO SCRAPER"
echo "===================="
echo ""
echo "🔄 Processos PM2:"
pm2 list
echo ""
echo "📈 Uso de recursos:"
pm2 monit
EOF

chmod +x monitor.sh

echo -e "${GREEN}📝 Configurando logs rotativos...${NC}"
cat > /etc/logrotate.d/casoca-scraper << 'EOF'
/opt/casoca-scraper/logs/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

echo -e "${GREEN}🛡️ Configurando firewall básico...${NC}"
ufw allow 22/tcp  # SSH
ufw --force enable

echo -e "${GREEN}✅ Deploy concluído!${NC}"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo "   1. Edite o .env com suas chaves:"
echo "      ${YELLOW}nano /opt/casoca-scraper/.env${NC}"
echo ""
echo "   2. Inicie o scraper:"
echo "      ${YELLOW}cd /opt/casoca-scraper${NC}"
echo "      ${YELLOW}pm2 start production-scraper.js --name casoca-scraper${NC}"
echo ""
echo "   3. Monitore o progresso:"
echo "      ${YELLOW}pm2 logs casoca-scraper${NC}"
echo "      ${YELLOW}pm2 monit${NC}"
echo ""
echo "   4. Ver status:"
echo "      ${YELLOW}./monitor.sh${NC}"
echo ""
echo "📊 COMANDOS ÚTEIS:"
echo "   pm2 list              - Ver processos"
echo "   pm2 logs              - Ver logs"
echo "   pm2 stop casoca       - Parar scraper"
echo "   pm2 restart casoca    - Reiniciar scraper"
echo "   pm2 monit             - Monitor em tempo real"