import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testStorageAndTable() {
  console.log('🔍 Testando configuração do Supabase...\n');

  // 1. Testar conexão com a tabela
  console.log('1️⃣ Verificando tabela products...');
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Erro ao acessar tabela:', error.message);
    } else {
      console.log('✅ Tabela products configurada corretamente!');
      console.log(`   Produtos existentes: ${data.length}`);
    }
  } catch (error) {
    console.error('❌ Erro:', error);
  }

  // 2. Testar acesso ao bucket
  console.log('\n2️⃣ Verificando bucket product-images...');
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('❌ Erro ao listar buckets:', listError.message);
    } else {
      const bucketExists = buckets?.some(b => b.name === 'product-images');

      if (!bucketExists) {
        console.error('❌ Bucket "product-images" não existe!');
        console.log('\n📝 Para criar o bucket:');
        console.log('   1. Acesse: https://aseetrfsmvrckrqlgllk.supabase.co');
        console.log('   2. Vá para Storage no menu lateral');
        console.log('   3. Clique em "New bucket"');
        console.log('   4. Nome: product-images');
        console.log('   5. Marque "Public bucket" ✅');
        console.log('   6. Clique em "Create bucket"');
      } else {
        console.log('✅ Bucket product-images existe!');

        // Verificar se está público
        const publicBucket = buckets.find(b => b.name === 'product-images');
        if (publicBucket && publicBucket.public) {
          console.log('✅ Bucket está configurado como público');
        } else {
          console.log('⚠️  Bucket existe mas não está público');
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro:', error);
  }

  // 3. Testar upload de imagem teste
  console.log('\n3️⃣ Testando upload de imagem...');
  try {
    const testImage = Buffer.from('test-image-data');
    const fileName = `test_${Date.now()}.txt`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, testImage, {
        contentType: 'text/plain',
        upsert: false
      });

    if (error) {
      console.error('❌ Erro no upload:', error.message);
    } else {
      console.log('✅ Upload funcionando!');
      console.log(`   Arquivo salvo: ${data.path}`);

      // Limpar arquivo de teste
      await supabase.storage
        .from('product-images')
        .remove([fileName]);
    }
  } catch (error) {
    console.error('❌ Erro:', error);
  }

  console.log('\n✨ Teste concluído!');
}

testStorageAndTable();