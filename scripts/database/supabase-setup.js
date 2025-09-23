import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function createProductsTable() {
  const { error } = await supabase.rpc('create_products_table_if_not_exists');

  if (error && error.code === '42883') {
    console.log('Tabela products precisa ser criada manualmente no Supabase.');
    console.log('\nExecute o seguinte SQL no editor SQL do Supabase:\n');
    console.log(`
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  link TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
    `);
  } else if (!error) {
    console.log('Tabela products verificada/criada com sucesso!');
  }
}

export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('count')
      .limit(1);

    if (error && error.code === '42P01') {
      console.log('Tabela products não existe. Criando...');
      await createProductsTable();
    } else if (error) {
      console.error('Erro ao conectar com Supabase:', error);
      return false;
    } else {
      console.log('Conexão com Supabase estabelecida com sucesso!');
      return true;
    }
  } catch (error) {
    console.error('Erro ao testar conexão:', error);
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testConnection();
}