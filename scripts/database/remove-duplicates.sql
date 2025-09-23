-- ================================================
-- SCRIPT DE REMOÇÃO DE DUPLICATAS
-- Critério: Remove produtos com mesmo name E image_url
-- Mantém: O registro mais antigo (menor ID)
-- ================================================

-- 1. PRIMEIRO: Ver quantas duplicatas existem
WITH duplicates AS (
  SELECT
    name,
    image_url,
    COUNT(*) as total,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY id) as all_ids,
    STRING_AGG(category::text, ', ' ORDER BY id) as categories
  FROM products
  WHERE name IS NOT NULL
    AND image_url IS NOT NULL
  GROUP BY name, image_url
  HAVING COUNT(*) > 1
)
SELECT
  COUNT(*) as grupos_duplicados,
  SUM(total - 1) as total_para_remover
FROM duplicates;

-- ================================================
-- 2. VER EXEMPLOS DE DUPLICATAS (opcional)
-- ================================================
WITH duplicates AS (
  SELECT
    name,
    image_url,
    COUNT(*) as total,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY id) as all_ids
  FROM products
  WHERE name IS NOT NULL
    AND image_url IS NOT NULL
  GROUP BY name, image_url
  HAVING COUNT(*) > 1
)
SELECT
  name,
  total as quantidade_duplicatas,
  keep_id as id_mantido,
  all_ids as todos_ids
FROM duplicates
ORDER BY total DESC
LIMIT 10;

-- ================================================
-- 3. DELETAR DUPLICATAS (CUIDADO - NÃO TEM VOLTA!)
-- ================================================
-- Descomente e execute apenas após verificar os resultados acima

/*
DELETE FROM products
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY name, image_url
        ORDER BY id
      ) as rn
    FROM products
    WHERE name IS NOT NULL
      AND image_url IS NOT NULL
  ) t
  WHERE rn > 1
);
*/

-- ================================================
-- 4. ALTERNATIVA: Deletar com mais controle
-- ================================================
-- Esta versão mostra exatamente o que será deletado

/*
WITH to_delete AS (
  SELECT id
  FROM (
    SELECT
      id,
      name,
      image_url,
      ROW_NUMBER() OVER (
        PARTITION BY name, image_url
        ORDER BY id
      ) as rn
    FROM products
    WHERE name IS NOT NULL
      AND image_url IS NOT NULL
  ) t
  WHERE rn > 1
)
DELETE FROM products
WHERE id IN (SELECT id FROM to_delete)
RETURNING id, name, category;
*/

-- ================================================
-- 5. VERIFICAR RESULTADO APÓS LIMPEZA
-- ================================================
-- Execute após o DELETE para confirmar

/*
SELECT
  COUNT(*) as total_produtos,
  COUNT(DISTINCT CONCAT(name, '|||', image_url)) as produtos_unicos
FROM products;
*/