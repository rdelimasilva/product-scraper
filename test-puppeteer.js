import puppeteer from 'puppeteer';

(async () => {
  console.log('Testando Puppeteer...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('Acessando casoca.com.br...');
  await page.goto('https://casoca.com.br');

  const title = await page.title();
  console.log('Título:', title);

  // Tirar screenshot para debug
  await page.screenshot({ path: 'casoca-home.png' });
  console.log('Screenshot salva: casoca-home.png');

  // Verificar links de categorias
  const categories = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="moveis"], a[href*="decoracao"]'));
    return links.map(a => ({ text: a.innerText, href: a.href })).slice(0, 5);
  });

  console.log('Categorias encontradas:', categories);

  await browser.close();

  console.log('✅ Teste completo!');
})();