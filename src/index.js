import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { createHash } from 'crypto';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class ProductScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.bucketName = 'product-images';
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
  }

  async scrapeProducts(url, selectors, category = null) {
    try {
      await this.page.goto(url, { waitUntil: 'networkidle2' });

      const products = await this.page.evaluate((sel) => {
        const items = document.querySelectorAll(sel.container);
        return Array.from(items).map(item => {
          const nameEl = item.querySelector(sel.name);
          const imageEl = item.querySelector(sel.image);
          const linkEl = item.querySelector(sel.link);
          const categoryEl = sel.category ? item.querySelector(sel.category) : null;

          return {
            name: nameEl ? nameEl.textContent.trim() : null,
            category: categoryEl ? categoryEl.textContent.trim() : null,
            image_url: imageEl ? imageEl.src || imageEl.dataset.src : null,
            link: linkEl ? linkEl.href : null
          };
        });
      }, selectors);

      // Se categoria foi passada como parâmetro, usar ela para todos os produtos
      if (category) {
        products.forEach(p => p.category = p.category || category);
      }

      return products.filter(p => p.name && p.image_url && p.link);
    } catch (error) {
      console.error('Erro ao fazer scraping:', error);
      return [];
    }
  }

  async downloadImage(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      console.error('Erro ao baixar imagem:', imageUrl, error);
      return null;
    }
  }

  async uploadImageToSupabase(imageBuffer, imageName) {
    try {
      const fileName = `${Date.now()}_${imageName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(fileName, imageBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Erro ao fazer upload da imagem:', error);
        return null;
      }

      return data.path;
    } catch (error) {
      console.error('Erro no upload:', error);
      return null;
    }
  }

  async processAndSaveProducts(products) {
    try {
      const processedProducts = [];

      for (const product of products) {
        console.log(`Processando: ${product.name}`);

        // Baixar e fazer upload da imagem
        let imagePath = null;
        if (product.image_url) {
          const imageBuffer = await this.downloadImage(product.image_url);
          if (imageBuffer) {
            const imageName = `${product.name.substring(0, 50)}.jpg`;
            imagePath = await this.uploadImageToSupabase(imageBuffer, imageName);
          }
        }

        processedProducts.push({
          name: product.name,
          category: product.category,
          image_url: product.image_url,
          image_path: imagePath,
          link: product.link
        });
      }

      // Salvar produtos no banco
      const { data, error } = await supabase
        .from('products')
        .insert(processedProducts)
        .select();

      if (error) {
        console.error('Erro ao salvar no Supabase:', error);
        return false;
      }

      console.log(`${data.length} produtos salvos com sucesso!`);
      return true;
    } catch (error) {
      console.error('Erro ao processar produtos:', error);
      return false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function main() {
  const scraper = new ProductScraper();

  try {
    await scraper.initialize();
    console.log('Navegador iniciado...');

    const config = {
      url: process.env.TARGET_URL || 'https://example.com',
      selectors: {
        container: '.product-item',
        name: '.product-name',
        category: '.product-category', // Seletor para categoria se existir no HTML
        image: '.product-image img',
        link: '.product-link'
      },
      defaultCategory: 'Geral' // Categoria padrão se não encontrar no HTML
    };

    console.log(`Fazendo scraping de ${config.url}...`);
    const products = await scraper.scrapeProducts(config.url, config.selectors, config.defaultCategory);

    if (products.length > 0) {
      console.log(`${products.length} produtos encontrados!`);
      await scraper.processAndSaveProducts(products);
    } else {
      console.log('Nenhum produto encontrado.');
    }

  } catch (error) {
    console.error('Erro na execução:', error);
  } finally {
    await scraper.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ProductScraper };