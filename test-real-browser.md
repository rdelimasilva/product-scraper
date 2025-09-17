# Teste Manual dos Links

## Links Salvos no Banco de Dados:

1. https://casoca.com.br/poltrona-sempre-oggi-rodrigo-laureano.html
2. https://casoca.com.br/cadeira-poltrona-chanel-jmarcon.html
3. https://casoca.com.br/banqueta-chanel-jmarcon.html
4. https://casoca.com.br/mesa-de-jantar-daphne-jmarcon.html
5. https://casoca.com.br/mesa-de-apoio-lumini-rudnick.html

## Como testar:

### Método 1: Acesso Direto (pode não funcionar)
- Copie e cole o link diretamente no navegador

### Método 2: Via Site (recomendado)
1. Acesse primeiro: https://casoca.com.br
2. Navegue para: Móveis
3. Procure pelo produto ou use o link

### Observações:

- Os links estão no formato correto: `/nome-do-produto.html`
- O Puppeteer consegue navegar normalmente para esses links
- O site possui proteção Cloudflare que pode bloquear acesso direto

## Solução Alternativa:

Se os links diretos não funcionam para uso manual, podemos:
1. Salvar apenas o slug (parte após a última /)
2. Criar um campo adicional com ID do produto
3. Usar a busca do site para encontrar produtos

Os links estão tecnicamente corretos e funcionam dentro do contexto de navegação do site.