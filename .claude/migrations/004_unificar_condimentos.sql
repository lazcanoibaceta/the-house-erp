-- Migración 004: unificar condimentos duplicados
--
-- 1. Mayo ICB + Mayo Kraft  →  Mayo Kraft
-- 2. Todas las mostazas     →  Mostaza
-- 3. Todos los ketchup      →  Ketchup
--
-- Ejecutar en: Supabase → SQL Editor
-- Seguro de re-ejecutar (usa condiciones EXISTS / id != winner)

BEGIN;

DO $$
DECLARE
  winner_id uuid;
  loser     RECORD;
  loser_stock numeric;
BEGIN

  -- ================================================================
  -- BLOQUE REUTILIZABLE: merge_insumo(loser_id, winner_id)
  -- Mueve todas las referencias y suma el stock al ganador.
  -- ================================================================
  -- (inline por compatibilidad con Supabase SQL Editor)

  -- ================================================================
  -- 1. MAYO: mayo icb → mayo kraft
  -- ================================================================
  SELECT id INTO winner_id FROM insumos WHERE lower(name) = 'mayo kraft' LIMIT 1;

  IF winner_id IS NULL THEN
    RAISE NOTICE 'No se encontró "Mayo Kraft" — saltando fusión de mayo.';
  ELSE
    FOR loser IN
      SELECT id, name, stock FROM insumos
      WHERE lower(name) LIKE '%mayo%' AND id != winner_id
    LOOP
      RAISE NOTICE 'Fusionando "%" → Mayo Kraft', loser.name;

      -- Recetas: eliminar duplicados antes de actualizar
      DELETE FROM recipes
      WHERE insumo_id = loser.id
        AND product_id IN (SELECT product_id FROM recipes WHERE insumo_id = winner_id);
      UPDATE recipes SET insumo_id = winner_id WHERE insumo_id = loser.id;

      -- Sub-recetas (insumo preparado)
      DELETE FROM insumo_recipes
      WHERE insumo_id = loser.id
        AND ingredient_id IN (SELECT ingredient_id FROM insumo_recipes WHERE insumo_id = winner_id);
      UPDATE insumo_recipes SET insumo_id = winner_id WHERE insumo_id = loser.id;

      -- Sub-recetas (ingrediente base)
      DELETE FROM insumo_recipes
      WHERE ingredient_id = loser.id
        AND insumo_id IN (SELECT insumo_id FROM insumo_recipes WHERE ingredient_id = winner_id);
      UPDATE insumo_recipes SET ingredient_id = winner_id WHERE ingredient_id = loser.id;

      UPDATE purchase_items SET insumo_id = winner_id WHERE insumo_id = loser.id;
      UPDATE stock_movements SET insumo_id = winner_id WHERE insumo_id = loser.id;
      UPDATE inventory_count_items SET insumo_id = winner_id WHERE insumo_id = loser.id;

      -- Sumar stock
      UPDATE insumos SET stock = stock + loser.stock WHERE id = winner_id;

      DELETE FROM insumos WHERE id = loser.id;
    END LOOP;
  END IF;

  -- ================================================================
  -- 2. MOSTAZA: unificar todas en "Mostaza"
  -- ================================================================
  -- Primero intentamos usar el que ya se llame exactamente "Mostaza"
  SELECT id INTO winner_id FROM insumos WHERE lower(name) = 'mostaza' LIMIT 1;
  -- Si no existe, tomamos cualquier variante
  IF winner_id IS NULL THEN
    SELECT id INTO winner_id FROM insumos WHERE lower(name) LIKE '%mostaza%' LIMIT 1;
  END IF;

  IF winner_id IS NULL THEN
    RAISE NOTICE 'No se encontró ninguna mostaza — saltando.';
  ELSE
    -- Renombrar ganador al nombre canónico
    UPDATE insumos SET name = 'Mostaza' WHERE id = winner_id;

    FOR loser IN
      SELECT id, name, stock FROM insumos
      WHERE lower(name) LIKE '%mostaza%' AND id != winner_id
    LOOP
      RAISE NOTICE 'Fusionando "%" → Mostaza', loser.name;

      DELETE FROM recipes
      WHERE insumo_id = loser.id
        AND product_id IN (SELECT product_id FROM recipes WHERE insumo_id = winner_id);
      UPDATE recipes SET insumo_id = winner_id WHERE insumo_id = loser.id;

      DELETE FROM insumo_recipes
      WHERE insumo_id = loser.id
        AND ingredient_id IN (SELECT ingredient_id FROM insumo_recipes WHERE insumo_id = winner_id);
      UPDATE insumo_recipes SET insumo_id = winner_id WHERE insumo_id = loser.id;

      DELETE FROM insumo_recipes
      WHERE ingredient_id = loser.id
        AND insumo_id IN (SELECT insumo_id FROM insumo_recipes WHERE ingredient_id = winner_id);
      UPDATE insumo_recipes SET ingredient_id = winner_id WHERE ingredient_id = loser.id;

      UPDATE purchase_items SET insumo_id = winner_id WHERE insumo_id = loser.id;
      UPDATE stock_movements SET insumo_id = winner_id WHERE insumo_id = loser.id;
      UPDATE inventory_count_items SET insumo_id = winner_id WHERE insumo_id = loser.id;

      UPDATE insumos SET stock = stock + loser.stock WHERE id = winner_id;

      DELETE FROM insumos WHERE id = loser.id;
    END LOOP;
  END IF;

  -- ================================================================
  -- 3. KETCHUP: unificar todos en "Ketchup"
  -- ================================================================
  SELECT id INTO winner_id FROM insumos WHERE lower(name) = 'ketchup' LIMIT 1;
  IF winner_id IS NULL THEN
    SELECT id INTO winner_id FROM insumos WHERE lower(name) LIKE '%ketchup%' LIMIT 1;
  END IF;

  IF winner_id IS NULL THEN
    RAISE NOTICE 'No se encontró ningún ketchup — saltando.';
  ELSE
    UPDATE insumos SET name = 'Ketchup' WHERE id = winner_id;

    FOR loser IN
      SELECT id, name, stock FROM insumos
      WHERE lower(name) LIKE '%ketchup%' AND id != winner_id
    LOOP
      RAISE NOTICE 'Fusionando "%" → Ketchup', loser.name;

      DELETE FROM recipes
      WHERE insumo_id = loser.id
        AND product_id IN (SELECT product_id FROM recipes WHERE insumo_id = winner_id);
      UPDATE recipes SET insumo_id = winner_id WHERE insumo_id = loser.id;

      DELETE FROM insumo_recipes
      WHERE insumo_id = loser.id
        AND ingredient_id IN (SELECT ingredient_id FROM insumo_recipes WHERE insumo_id = winner_id);
      UPDATE insumo_recipes SET insumo_id = winner_id WHERE insumo_id = loser.id;

      DELETE FROM insumo_recipes
      WHERE ingredient_id = loser.id
        AND insumo_id IN (SELECT insumo_id FROM insumo_recipes WHERE ingredient_id = winner_id);
      UPDATE insumo_recipes SET ingredient_id = winner_id WHERE ingredient_id = loser.id;

      UPDATE purchase_items SET insumo_id = winner_id WHERE insumo_id = loser.id;
      UPDATE stock_movements SET insumo_id = winner_id WHERE insumo_id = loser.id;
      UPDATE inventory_count_items SET insumo_id = winner_id WHERE insumo_id = loser.id;

      UPDATE insumos SET stock = stock + loser.stock WHERE id = winner_id;

      DELETE FROM insumos WHERE id = loser.id;
    END LOOP;
  END IF;

END $$;

COMMIT;

-- Verificación: ver qué quedó
SELECT id, name, unit, stock FROM insumos
WHERE lower(name) LIKE '%mayo%'
   OR lower(name) LIKE '%mostaza%'
   OR lower(name) LIKE '%ketchup%'
ORDER BY name;
