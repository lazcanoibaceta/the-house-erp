-- Migración 014: Modificadores de producto + notas por ítem + arqueo tarjeta/transferencia
--
-- Complementa la beta del POS (migración 013):
--   1. pos_modifiers: catálogo de extras/modificadores con precio (agranda papas,
--      extra hamburguesa, NotCo, extra queso, etc.). Editable en Supabase.
--   2. pos_sale_items: nota libre por ítem ("sin tomate", "bien cocida") + los
--      modificadores elegidos (jsonb con snapshot de nombre y precio).
--   3. cash_sessions: montos externos reportados para cuadrar tarjeta (maquinita)
--      y transferencias contra lo que registró el sistema.
--
-- Convención IVA: los precios de modificadores van CON IVA (igual que products.sale_price).
--
-- Ejecutar en: Supabase → SQL Editor

-- ── 1. Catálogo de modificadores ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_modifiers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  price      numeric NOT NULL DEFAULT 0,   -- CON IVA
  applies_to text NOT NULL DEFAULT 'burger', -- category de products a la que aplica, o 'all'
  sort_order int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pos_modifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON pos_modifiers;
CREATE POLICY "authenticated_all" ON pos_modifiers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Semilla (solo si la tabla está vacía)
INSERT INTO pos_modifiers (name, price, applies_to, sort_order)
SELECT * FROM (VALUES
  ('Agranda papas',        990,  'burger', 1),
  ('Extra hamburguesa',    2500, 'burger', 2),
  ('Cambio a NotCo',       0,    'burger', 3),
  ('Extra queso cheddar',  990,  'burger', 4),
  ('Extra tocino',         1290, 'burger', 5),
  ('Extra pepinillos',     590,  'burger', 6),
  ('Extra lechuga',        590,  'burger', 7),
  ('Extra tomate',         590,  'burger', 8)
) AS v(name, price, applies_to, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM pos_modifiers);

-- ── 2. Nota + modificadores por ítem vendido ────────────────────────────────
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS note      text;
ALTER TABLE pos_sale_items ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]'::jsonb;
-- modifiers = [{ "name": "Extra tocino", "price": 1290, "qty": 1 }, ...]
-- unit_price sigue siendo el precio BASE del producto; el total del ítem =
-- (unit_price + Σ modifier.price*qty) * quantity  (se calcula en la app)

-- ── 3. Arqueo: montos externos de tarjeta y transferencia ───────────────────
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS card_reported     numeric; -- total impreso por la maquinita
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS transfer_reported numeric; -- suma de transferencias recibidas

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT 'pos_modifiers' AS tabla, count(*)::text AS valor FROM pos_modifiers
UNION ALL SELECT 'columnas pos_sale_items (note/modifiers)',
  (SELECT count(*)::text FROM information_schema.columns
   WHERE table_name='pos_sale_items' AND column_name IN ('note','modifiers'))
UNION ALL SELECT 'columnas cash_sessions (card/transfer reported)',
  (SELECT count(*)::text FROM information_schema.columns
   WHERE table_name='cash_sessions' AND column_name IN ('card_reported','transfer_reported'));
