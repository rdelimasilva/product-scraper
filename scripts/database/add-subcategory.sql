-- Adicionar campo subcategoria na tabela products
ALTER TABLE products
ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Criar índice para melhorar performance de buscas
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);