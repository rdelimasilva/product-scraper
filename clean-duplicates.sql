-- Script para limpar produtos duplicados no Supabase
-- Remove duplicates keeping the first occurrence

-- 1. Remove duplicados exatos (mesmo link)
DELETE FROM products
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY link ORDER BY id) as rn
        FROM products
    ) t
    WHERE rn > 1
);

-- 2. Remove duplicados por nome e imagem (mantém o primeiro)
DELETE FROM products
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY name, image_url ORDER BY id) as rn
        FROM products
    ) t
    WHERE rn > 1
);

-- 3. Verifica quantidade final
SELECT COUNT(*) as total_products FROM products;

-- 4. Mostra estatísticas por categoria
SELECT category, COUNT(*) as count
FROM products
GROUP BY category
ORDER BY count DESC;