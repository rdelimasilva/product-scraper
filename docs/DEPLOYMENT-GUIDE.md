# 🚀 Guia de Deploy - ScraperAPI + Hetzner

## 📋 Passo a Passo

### 1️⃣ **Criar conta no ScraperAPI**
- Acesse: https://www.scraperapi.com
- Cadastre-se (tem trial grátis de 5000 requests)
- Plano Hobby: $39/mês = 100.000 requests
- Copie sua API Key

### 2️⃣ **Criar VPS na Hetzner**
- Acesse: https://console.hetzner.cloud
- Criar novo projeto
- Adicionar servidor:
  - **Tipo**: CX22 (€3.79/mês)
  - **Localização**: Alemanha (Nuremberg ou Falkenstein)
  - **Imagem**: Ubuntu 22.04
  - **SSH Key**: Adicione sua chave SSH

### 3️⃣ **Conectar ao servidor**
```bash
ssh root@seu-ip-hetzner
```

### 4️⃣ **Executar script de deploy**
```bash
# Baixar e executar script
wget https://raw.githubusercontent.com/seu-usuario/web-scraper-supabase/main/deploy-hetzner.sh
chmod +x deploy-hetzner.sh
./deploy-hetzner.sh
```

### 5️⃣ **Configurar variáveis de ambiente**
```bash
nano /opt/casoca-scraper/.env
```

Adicione sua ScraperAPI key:
```env
SCRAPER_API_KEY=sua_chave_aqui
```

### 6️⃣ **Iniciar o scraper**
```bash
cd /opt/casoca-scraper
pm2 start production-scraper.js --name casoca
```

## 📊 Monitoramento

### Ver logs em tempo real:
```bash
pm2 logs casoca
```

### Ver status:
```bash
pm2 status
```

### Monitor interativo:
```bash
pm2 monit
```

### Ver métricas:
```bash
./monitor.sh
```

## 🛠️ Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `pm2 start casoca` | Iniciar scraper |
| `pm2 stop casoca` | Parar scraper |
| `pm2 restart casoca` | Reiniciar scraper |
| `pm2 logs casoca` | Ver logs |
| `pm2 delete casoca` | Remover processo |
| `pm2 save` | Salvar configuração |

## 💾 Checkpoints

O scraper salva automaticamente o progresso em `checkpoint.json`.

Se precisar parar e retomar:
1. `pm2 stop casoca` - Para o processo
2. O checkpoint é salvo automaticamente
3. `pm2 start casoca` - Retoma de onde parou

## 📈 Estimativas

Com ScraperAPI Hobby ($39):
- **100.000 requests/mês**
- **~100.000 produtos** (1 request por página)
- **Tempo**: ~30 horas rodando 24/7
- **Taxa**: ~55 produtos/minuto

## 🚨 Troubleshooting

### Erro de API Key:
```bash
# Verificar .env
cat /opt/casoca-scraper/.env
```

### Processo morreu:
```bash
# Ver logs de erro
pm2 logs casoca --err
```

### Usar menos memória:
```bash
# Editar ecosystem.config.js
nano /opt/casoca-scraper/ecosystem.config.js
# Mudar max_memory_restart para '512M'
```

### Verificar uso de recursos:
```bash
htop
```

## 💰 Custos Totais

| Serviço | Custo/Mês |
|---------|-----------|
| Hetzner CX22 | €3.79 (~$4) |
| ScraperAPI Hobby | $39 |
| **TOTAL** | **~$43/mês** |

## 🎯 Dicas de Otimização

1. **Rodar à noite**: Menos concorrência no site
2. **Ajustar concorrência**: MAX_CONCURRENT_REQUESTS no .env
3. **Monitorar custos**: Dashboard do ScraperAPI
4. **Backup dos dados**: Exportar do Supabase regularmente

## 📞 Suporte

- **ScraperAPI**: support@scraperapi.com
- **Hetzner**: Via console (tickets)
- **Logs do sistema**: `/opt/casoca-scraper/logs/`