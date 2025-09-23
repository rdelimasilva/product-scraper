import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Usar stealth plugin
puppeteer.use(StealthPlugin());

async function testBypass() {
  console.log('🧪 Teste de Bypass do Cloudflare\n');
  console.log('══════════════════════════════\n');
  
  const browser = await puppeteer.launch({
    headless: false, // Ver o que acontece
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });
  
  try {
    const page = await browser.newPage();
    
    // Anti-detecção
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('🌐 Acessando: https://casoca.com.br/iluminacao.html');
    console.log('⏳ Aguardando carregamento...\n');
    
    await page.goto('https://casoca.com.br/iluminacao.html', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Aguardar um pouco
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verificar título
    const title = await page.title();
    console.log('📄 Título da página:', title);
    
    if (title.includes('Just a moment')) {
      console.log('⚠️ Cloudflare detectado! Aguardando...\n');
      
      // Aguardar mais
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      const newTitle = await page.title();
      console.log('📄 Novo título:', newTitle);
      
      if (!newTitle.includes('Just a moment')) {
        console.log('✅ Bypass bem-sucedido!\n');
      } else {
        console.log('❌ Cloudflare ainda ativo\n');
      }
    } else {
      console.log('✅ Página carregou sem Cloudflare!\n');
    }
    
    // Verificar se há produtos
    const products = await page.evaluate(() => {
      return document.querySelectorAll('.product').length;
    });
    
    console.log(`📦 Produtos encontrados: ${products}`);
    
    // Salvar screenshot
    await page.screenshot({ path: 'cloudflare-test.png' });
    console.log('📷 Screenshot salvo: cloudflare-test.png');
    
    // Aguardar para ver
    console.log('\n⏳ Browser ficará aberto por 10 segundos...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await browser.close();
    console.log('\n✅ Teste completo!');
  }
}

testBypass();