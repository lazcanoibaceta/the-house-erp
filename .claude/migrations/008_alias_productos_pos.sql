-- Migración 008: alias de productos del punto de venta (POS)
--
-- Problema: el punto de venta (Justo/POS) manda nombres que no coinciden
--   exactamente con la carta de `products`. Ejemplos reales vistos en Merma:
--     "cocacola", "coca cola lata 350 cc"          → producto "Coca-Cola"
--     "chicken pops"                                → producto "Chicken Pop"
--     "bebida lata regular 350 cc sprite"           → producto "Sprite"
--     "promo futbolera"                             → combo de 3 productos
--   Esos productos SÍ tienen receta, pero como el nombre no calza, las ventas
--   caían en "Productos vendidos sin receta calzada" y no entraban al teórico.
--
-- Solución: una tabla puente nombre-del-POS → producto. Un mismo nombre puede
--   apuntar a VARIOS productos (combos como la Promo Futbolera). El cruce de
--   merma.js consulta esta tabla cuando el nombre no calza directo, y la página
--   de Merma tiene un botón "Asignar" para agregar nuevos alias sin tocar código.
--
-- `alias_name` se guarda normalizado (minúsculas, sin tildes, espacios simples),
--   igual que lo produce la función normalize() de merma.js.
--
-- Ejecutar en: Supabase → SQL Editor

-- ================================================================
-- 1. Tabla de alias (un nombre del POS puede mapear a 1..N productos)
-- ================================================================
CREATE TABLE IF NOT EXISTS product_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_name  text NOT NULL,                              -- nombre normalizado que manda el POS
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (alias_name, product_id)                         -- evita duplicar el mismo calce
);

-- ================================================================
-- 2. RLS: mismo patrón que el resto del ERP (authenticated = acceso total)
-- ================================================================
ALTER TABLE product_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON product_aliases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ================================================================
-- 3. Semilla: los alias que ya conocemos (julio 2026)
--    Se referencia el producto por nombre para no depender de IDs.
-- ================================================================
INSERT INTO product_aliases (alias_name, product_id)
VALUES
  ('cocacola',                         (SELECT id FROM products WHERE name = 'Coca-Cola')),
  ('coca cola lata 350 cc',            (SELECT id FROM products WHERE name = 'Coca-Cola')),
  ('cocacola zero',                    (SELECT id FROM products WHERE name = 'Coca-Cola Zero')),
  ('coca cola zero lata 350 cc',       (SELECT id FROM products WHERE name = 'Coca-Cola Zero')),
  ('bebida lata regular 350 cc sprite',(SELECT id FROM products WHERE name = 'Sprite')),
  ('chicken pops',                     (SELECT id FROM products WHERE name = 'Chicken Pop')),
  -- Promo Futbolera = Classic + Bacon Rings + Chicken Pop (combo → 3 filas)
  ('promo futbolera',                  (SELECT id FROM products WHERE name = 'Classic Burger')),
  ('promo futbolera',                  (SELECT id FROM products WHERE name = 'Bacon Rings')),
  ('promo futbolera',                  (SELECT id FROM products WHERE name = 'Chicken Pop'))
ON CONFLICT (alias_name, product_id) DO NOTHING;

-- Verificación: listar los alias sembrados con su producto
SELECT a.alias_name, p.name AS producto
FROM product_aliases a
JOIN products p ON p.id = a.product_id
ORDER BY a.alias_name;
