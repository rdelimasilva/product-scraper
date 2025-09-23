import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

puppeteer.use(StealthPlugin());

// Categorias que estão faltando (0% ou muito baixo)
const MISSING_CATEGORIES = [
    { name: 'Revestimentos', url: 'https://casoca.com.br/revestimentos.html', expectedTotal: 3336 },
    { name: 'Comercial', url: 'https://casoca.com.br/comercial.html', expectedTotal: 600 },
    { name: 'Construção', url: 'https://casoca.com.br/construcao.html', expectedTotal: 192 }
];

const CHECKPOINT_FILE = 'checkpoint-missing.json';
const MAX_RETRIES = 3;

class MissingCategoryScraper {
    constructor() {
        this.browser = null;
        this.checkpoint = {
            categories: {},
            lastUpdated: new Date().toISOString()
        };
        this.stats = {
            totalSaved: 0,
            duplicates: 0,
            errors: 0
        };
    }

    async loadCheckpoint() {
        try {
            const data = await fs.readFile(CHECKPOINT_FILE, 'utf8');
            this.checkpoint = JSON.parse(data);
            console.log('✅ Checkpoint carregado');
        } catch {
            console.log('📝 Iniciando novo checkpoint');
        }
    }

    async saveCheckpoint() {
        this.checkpoint.lastUpdated = new Date().toISOString();
        await fs.writeFile(CHECKPOINT_FILE, JSON.stringify(this.checkpoint, null, 2));
    }

    async initBrowser() {
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });
    }

    async getCategoryCount(categoryName) {
        const { data, error } = await supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('category', categoryName);

        return error ? 0 : data?.length || 0;
    }

    async saveProduct(product) {
        try {
            // Verifica se já existe
            const { data: existing } = await supabase
                .from('products')
                .select('id')
                .eq('link', product.link)
                .limit(1);

            if (existing && existing.length > 0) {
                this.stats.duplicates++;
                return { success: false, duplicate: true };
            }

            // Insere novo produto
            const { error } = await supabase
                .from('products')
                .insert(product);

            if (error) {
                console.error('❌ Erro ao salvar:', error.message);
                this.stats.errors++;
                return { success: false, error };
            }

            this.stats.totalSaved++;
            return { success: true };
        } catch (err) {
            console.error('❌ Erro:', err.message);
            this.stats.errors++;
            return { success: false, error: err };
        }
    }

    async scrapePage(page, url) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('.detail-product', { timeout: 10000 });

        const products = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('.detail-product').forEach(item => {
                const name = item.querySelector('h2')?.textContent?.trim() ||
                           item.querySelector('.product-name')?.textContent?.trim() ||
                           item.querySelector('a')?.title;
                const link = item.querySelector('a')?.href;
                const imageUrl = item.querySelector('.photo.image img')?.src ||
                               item.querySelector('img')?.src ||
                               item.querySelector('img')?.dataset?.src;

                if (name && link && imageUrl) {
                    items.push({
                        name,
                        image_url: imageUrl,
                        link
                    });
                }
            });
            return items;
        });

        return products;
    }

    async scrapeCategory(category) {
        const page = await this.browser.newPage();

        try {
            const currentCount = await this.getCategoryCount(category.name);
            console.log(`\n📊 ${category.name}: ${currentCount}/${category.expectedTotal} produtos`);

            if (currentCount >= category.expectedTotal * 0.95) {
                console.log(`✅ Categoria já está completa!`);
                return;
            }

            const startPage = this.checkpoint.categories[category.name]?.lastPage || 1;
            let currentPage = startPage;
            let emptyPages = 0;

            while (emptyPages < 3) {
                try {
                    const url = `${category.url}?page=${currentPage}`;
                    console.log(`  📄 Página ${currentPage}`);

                    const products = await this.scrapePage(page, url);

                    if (products.length === 0) {
                        emptyPages++;
                        if (emptyPages >= 3) {
                            console.log('  ⚠️ Fim da categoria');
                            break;
                        }
                    } else {
                        emptyPages = 0;
                        let saved = 0;

                        for (const product of products) {
                            product.category = category.name;
                            const result = await this.saveProduct(product);
                            if (result.success) saved++;
                        }

                        console.log(`    💾 Salvos: ${saved}/${products.length}`);
                    }

                    // Atualiza checkpoint
                    this.checkpoint.categories[category.name] = {
                        lastPage: currentPage,
                        totalSaved: await this.getCategoryCount(category.name)
                    };
                    await this.saveCheckpoint();

                    currentPage++;
                    await new Promise(r => setTimeout(r, 2000));

                } catch (err) {
                    console.error(`  ❌ Erro na página ${currentPage}:`, err.message);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

        } finally {
            await page.close();
        }
    }

    async run() {
        console.log('🚀 SCRAPER - CATEGORIAS FALTANTES');
        console.log('==================================');

        await this.loadCheckpoint();
        await this.initBrowser();

        try {
            for (const category of MISSING_CATEGORIES) {
                await this.scrapeCategory(category);
            }

            console.log('\n📊 RESUMO FINAL:');
            console.log('================');
            console.log(`✅ Total salvo: ${this.stats.totalSaved}`);
            console.log(`⚠️ Duplicados: ${this.stats.duplicates}`);
            console.log(`❌ Erros: ${this.stats.errors}`);

            // Mostra status final
            for (const category of MISSING_CATEGORIES) {
                const count = await this.getCategoryCount(category.name);
                const percent = ((count / category.expectedTotal) * 100).toFixed(1);
                console.log(`${category.name}: ${count}/${category.expectedTotal} (${percent}%)`);
            }

        } finally {
            await this.browser.close();
        }
    }
}

// Executa
const scraper = new MissingCategoryScraper();
scraper.run().catch(console.error);