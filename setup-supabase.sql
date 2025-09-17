-- ==============================================
-- SCRIPT DE CONFIGURAÇÃO DO SUPABASE
-- ==============================================

-- 1. CRIAR TABELA DE PRODUTOS
-- ----------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT, -- Categoria do produto
  image_url TEXT, -- URL original da imagem (para referência)
  image_path TEXT, -- Caminho da imagem no bucket do Supabase
  link TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

-- ==============================================
-- 2. CONFIGURAR STORAGE (Execute no Dashboard)
-- ==============================================
-- No painel do Supabase:
-- 1. Vá para "Storage" no menu lateral
-- 2. Clique em "New bucket"
-- 3. Nome do bucket: product-images
-- 4. Marque "Public bucket" se quiser acesso público às imagens
-- 5. Clique em "Create bucket"

-- ==============================================
-- 3. POLÍTICAS DE SEGURANÇA (RLS) - OPCIONAL
-- ==============================================
-- Se quiser permitir leitura pública dos produtos:
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON products
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert" ON products
  FOR INSERT WITH CHECK (true);

-- ==============================================
-- 4. VERIFICAR CONFIGURAÇÃO
-- ==============================================
-- Execute esta query para verificar se tudo está OK:
SELECT
  table_name,
  COUNT(*) as column_count
FROM
  information_schema.columns
WHERE
  table_name = 'products'
GROUP BY
  table_name;