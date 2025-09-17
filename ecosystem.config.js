module.exports = {
  apps: [{
    name: 'casoca-scraper',
    script: './production-scraper.js',
    instances: 1,
    exec_mode: 'fork',

    // Restart automático
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',

    // Configuração de logs
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,

    // Variáveis de ambiente
    env: {
      NODE_ENV: 'production',
      MAX_CONCURRENT_REQUESTS: 5,
      BATCH_SIZE: 1000,
      LOG_LEVEL: 'info'
    },

    // Estratégia de restart
    min_uptime: '10s',
    max_restarts: 10,

    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,

    // Monitoramento
    monitoring: {
      http: true,
      https: true
    }
  }]
};