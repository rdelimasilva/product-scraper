# Web Scraper Supabase

Automação para extrair dados de produtos do site Casoca e salvar no Supabase.

## 📁 Estrutura do Projeto

```
├── src/                      # Código fonte principal
│   ├── index.js             # Arquivo principal de entrada
│   └── scrapers/            # Implementações dos scrapers
│       ├── production/      # Scrapers prontos para produção
│       │   ├── production-scraper.js
│       │   ├── professional-scraper-api.js
│       │   ├── scraper-final-production.js
│       │   └── working-scraper.js
│       └── development/     # Scrapers experimentais/desenvolvimento
│           ├── scraper-*.js
│           └── ...
│
├── scripts/                 # Scripts utilitários
│   ├── analysis/           # Scripts de análise do site
│   │   ├── analyze-*.js
│   │   └── investigate-real-links.js
│   ├── database/           # Scripts de banco de dados
│   │   ├── *.sql
│   │   ├── supabase-setup.js
│   │   ├── create-test-records.js
│   │   └── remove-duplicates*.js
│   ├── deployment/         # Scripts de deploy
│   │   ├── deploy.sh
│   │   └── deploy-hetzner.sh
│   ├── debug-*.js         # Scripts de debug
│   ├── check-products.js   # Verificação de produtos
│   ├── estimate-scraping-time.js
│   ├── quick-test.js
│   ├── run-scraper.js
│   └── simple-5-products.js
│
├── tests/                  # Testes e arquivos de teste
│   ├── test-*.js
│   └── ...
│
├── config/                 # Arquivos de configuração
│   ├── ecosystem.config.js # Configuração do PM2
│   └── category-targets.json (se existir)
│
├── docs/                   # Documentação
│   ├── DEPLOYMENT-GUIDE.md
│   ├── PROXY_SETUP.md
│   └── test-real-browser.md
│
├── assets/                 # Recursos e arquivos estáticos
│   ├── *.png              # Imagens de análise
│   └── *.html             # Arquivos HTML de teste
│
├── logs/                   # Arquivos de log
│   ├── *.log
│   └── *.json
│
├── .env                    # Variáveis de ambiente
├── .gitignore             # Arquivos ignorados pelo Git
├── package.json           # Dependências do projeto
└── package-lock.json      # Lock das dependências
```

## 🚀 Como Usar

### Instalação
```bash
npm install
```

### Executar o scraper principal
```bash
npm start
```

### Modo de desenvolvimento (com watch)
```bash
npm run dev
```

### Executar em produção com PM2
```bash
pm2 start config/ecosystem.config.js
```

## 📂 Categorização dos Arquivos

### 🔧 **src/scrapers/production/**
Scrapers testados e prontos para uso em produção:
- `production-scraper.js` - Scraper principal para produção
- `professional-scraper-api.js` - Versão profissional usando API
- `working-scraper.js` - Versão funcional estável

### 🧪 **src/scrapers/development/**
Scrapers experimentais e versões de desenvolvimento com diferentes abordagens e features.

### 📊 **scripts/analysis/**
Scripts para análise e investigação do site alvo:
- Análise de filtros, produtos, navegação
- Investigação de links e estrutura do site
- Estimativas de tempo de scraping

### 🗄️ **scripts/database/**
Scripts relacionados ao banco de dados:
- Setup do Supabase
- Limpeza e remoção de duplicatas
- Criação de registros de teste
- Queries SQL

### 🧪 **tests/**
Testes diversos incluindo:
- Testes de conectividade
- Testes de bypass do Cloudflare
- Testes de proxy
- Testes de API

### ⚙️ **config/**
Arquivos de configuração do projeto:
- Configuração do PM2 para produção
- Targets de categorias (se aplicável)

## 🔧 Tecnologias Utilizadas

- **Node.js** - Runtime JavaScript
- **Puppeteer** - Automação de browser
- **Supabase** - Banco de dados e storage
- **PM2** - Process manager para produção
- **ScraperAPI** - API para contornar limitações

## 📝 Logs

Os logs são salvos na pasta `logs/` com diferentes níveis:
- Logs de erro
- Logs combinados
- Logs específicos do PM2

## 🚀 Deploy

Consulte a documentação em `docs/DEPLOYMENT-GUIDE.md` para instruções detalhadas de deploy.

## 🔒 Configuração

1. Copie `.env.example` para `.env`
2. Configure as variáveis de ambiente necessárias:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SCRAPER_API_KEY` (se usar ScraperAPI)

## 📖 Documentação Adicional

- `docs/PROXY_SETUP.md` - Configuração de proxy
- `docs/test-real-browser.md` - Testes com browser real
