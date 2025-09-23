# Configuração de Proxies para Bypass do Cloudflare

## Opções de Proxy Gratuitos

### 1. Webshare (Recomendado)
- Site: https://proxy.webshare.io
- Oferece 10 proxies gratuitos
- Rotação automática
- Suporte a HTTP/HTTPS

**Como configurar:**
1. Crie uma conta em https://proxy.webshare.io/register
2. Acesse o dashboard
3. Vá em "Proxy List"
4. Copie os proxies no formato: `http://username:password@proxy.webshare.io:port`
5. Adicione no arquivo `scraper-proxy.js` na variável `PROXIES`

### 2. ProxyScrape
- Site: https://proxyscrape.com
- Lista de proxies gratuitos públicos
- Menos confiável, mas totalmente gratuito

### 3. Bright Data (Luminati) - Trial
- Site: https://brightdata.com
- Oferece $5 de crédito grátis
- Proxies residenciais de alta qualidade

## Configurando no Scraper

1. Edite o arquivo `scraper-proxy.js`
2. Adicione seus proxies na variável `PROXIES`:

```javascript
const PROXIES = [
  'http://user:pass@proxy1.webshare.io:8080',
  'http://user:pass@proxy2.webshare.io:8080',
  'http://user:pass@proxy3.webshare.io:8080',
];
```

3. Execute: `node scraper-proxy.js`

## Testando Proxies

Use o arquivo `test-proxy.js` para testar se os proxies funcionam:

```bash
node test-proxy.js
```

## Notas Importantes

- Proxies gratuitos podem ser lentos
- Alguns podem não funcionar com Cloudflare
- Rotação de proxy aumenta chances de sucesso
- Para produção, considere proxies pagos

## Alternativas sem Proxy

1. **Unflare/Puppeteer Stealth**: `scraper-unflare.js`
   - Usa técnicas de anti-detecção
   - Não requer proxy
   - Mais lento mas gratuito

2. **Scraper API**: `scraper-complete-pagination.js`
   - Serviço pago ($29/mês)
   - Mais confiável
   - Limite de requisições