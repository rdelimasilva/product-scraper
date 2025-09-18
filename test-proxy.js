import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// Adicione seus proxies aqui
const PROXIES = [
  // 'http://user:pass@proxy.webshare.io:8080',
];

async function testProxy() {
  console.log('🧪 Teste de Proxy para Bypass do Cloudflare\n');
  console.log('════════════════════════════════\n');

  if (PROXIES.length === 0) {
    console.log('⚠️ Nenhum proxy configurado!');
    console.log('Por favor, adicione proxies na variável PROXIES\n');
    console.log('Testando sem proxy...\n');
  }

  for (let i = 0; i < Math.max(1, PROXIES.length); i++) {
    const proxy = PROXIES[i];

    if (proxy) {
      console.log(`\n🔄 Testando Proxy ${i + 1}/${PROXIES.length}`);
      console.log(`   ${proxy.split('@')[1] || proxy}\n`);
    } else {
      console.log('🌐 Testando sem proxy\n');
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ];

    if (proxy) {
      args.push(`--proxy-server=${proxy}`);
    }

    const browser = await puppeteer.launch({
      headless: false, // Ver o que acontece
      args
    });

    try {
      const page = await browser.newPage();

      // Anti-detecção
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });

      // Teste 1: IP Check
      console.log('1️⃣ Verificando IP...');
      try {
        await page.goto('https://httpbin.org/ip', { waitUntil: 'networkidle2', timeout: 30000 });
        const ipData = await page.evaluate(() => document.body.textContent);
        const ip = JSON.parse(ipData).origin;
        console.log(`   ✅ IP: ${ip}`);
      } catch (error) {
        console.log(`   ❌ Erro ao verificar IP: ${error.message}`);
      }

      // Teste 2: Site Casoca
      console.log('\n2️⃣ Acessando casoca.com.br...');
      try {
        await page.goto('https://casoca.com.br/iluminacao.html', {
          waitUntil: 'networkidle2',
          timeout: 60000
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        const title = await page.title();
        console.log(`   📄 Título: ${title}`);

        if (title.includes('Just a moment')) {
          console.log('   ⚠️ Cloudflare detectado!');

          // Aguardar mais
          console.log('   ⏳ Aguardando bypass...');
          await new Promise(resolve => setTimeout(resolve, 15000));

          const newTitle = await page.title();
          if (!newTitle.includes('Just a moment')) {
            console.log('   ✅ Cloudflare contornado!');
          } else {
            console.log('   ❌ Cloudflare ainda ativo');
          }
        } else {
          console.log('   ✅ Site acessado sem Cloudflare!');
        }

        // Verificar produtos
        const products = await page.evaluate(() => {
          return document.querySelectorAll('.product').length;
        });

        console.log(`   📦 Produtos encontrados: ${products}`);

        if (products > 0) {
          console.log(`   ✅ Proxy ${proxy ? 'FUNCIONA' : 'NÃO NECESSÁRIO'}!`);
        } else {
          console.log(`   ⚠️ Nenhum produto encontrado`);
        }

      } catch (error) {
        console.log(`   ❌ Erro ao acessar site: ${error.message}`);
      }

      // Screenshot
      await page.screenshot({ path: `proxy-test-${i}.png` });
      console.log(`   📷 Screenshot salvo: proxy-test-${i}.png`);

    } catch (error) {
      console.log(`❌ Erro geral: ${error.message}`);
    } finally {
      await browser.close();
    }
  }

  console.log('\n════════════════════════════════');
  console.log('✅ Teste completo!\n');

  if (PROXIES.length === 0) {
    console.log('💡 PRÓXIMOS PASSOS:');
    console.log('1. Obtenha proxies gratuitos em https://proxy.webshare.io');
    console.log('2. Adicione os proxies neste arquivo');
    console.log('3. Execute o teste novamente');
  }
}

testProxy();