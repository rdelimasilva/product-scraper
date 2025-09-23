import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testSupabaseConnection() {
  console.log('Testando conexão com Supabase...');
  console.log('URL:', process.env.SUPABASE_URL);

  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .limit(1);

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        console.log('\n⚠️  Tabela "products" não existe no Supabase.');
        console.log('\n📝 Para criar a tabela:');
        console.log('1. Acesse: https://aseetrfsmvrckrqlgllk.supabase.co');
        console.log('2. Vá para o SQL Editor');
        console.log('3. Execute o seguinte SQL:');
        console.log('----------------------------------------');
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
        console.log('----------------------------------------');
      } else {
        console.error('Erro ao conectar:', error);
      }
    } else {
      console.log('✅ Conexão com Supabase estabelecida com sucesso!');
      console.log('✅ Tabela "products" encontrada.');
    }
  } catch (error) {
    console.error('Erro geral:', error);
  }
}

testSupabaseConnection();