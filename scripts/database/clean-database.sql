-- SQL para limpar a base de dados de produtos

-- Deletar todos os registros da tabela products
DELETE FROM products;

-- Resetar o contador de ID para começar do 1 novamente
ALTER SEQUENCE products_id_seq RESTART WITH 1;

-- Opcional: Verificar que a tabela está vazia
-- SELECT COUNT(*) FROM products;

-- Opcional: Ver a estrutura da tabela
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'products';