-- Migración 007: traspasos de insumos entre locales
--
-- Problema: cuando San Felipe le manda productos a Los Andes (o viceversa),
--   no hay forma de mover el inventario de un local a otro. Hoy habría que
--   "descontar" a mano de un lado y "comprar" del otro, lo que ensucia los datos.
--
-- Solución: dos tablas nuevas para registrar el traspaso (cabecera + ítems),
--   igual que purchases / purchase_items. La app se encarga de bajar el stock
--   en el origen y subirlo en el destino (tabla insumo_costs), y deja la
--   bitácora en stock_movements.
--
-- Ejecutar en: Supabase → SQL Editor

-- ================================================================
-- 1. Cabecera del traspaso
-- ================================================================
CREATE TABLE IF NOT EXISTS transfers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date             date NOT NULL,
  from_location_id uuid NOT NULL REFERENCES locations(id),
  to_location_id   uuid NOT NULL REFERENCES locations(id),
  notes            text,
  created_at       timestamptz DEFAULT now(),
  CHECK (from_location_id <> to_location_id)   -- origen y destino deben ser distintos
);

-- ================================================================
-- 2. Ítems del traspaso (un insumo + cantidad por fila)
-- ================================================================
CREATE TABLE IF NOT EXISTS transfer_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  insumo_id   uuid NOT NULL REFERENCES insumos(id),
  quantity    numeric NOT NULL,
  unit_cost   numeric   -- costo neto del insumo en el ORIGEN al momento del traspaso (para valorizar)
);

-- ================================================================
-- 3. RLS: mismo patrón que el resto del ERP (authenticated = acceso total)
-- ================================================================
ALTER TABLE transfers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON transfers      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON transfer_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Verificación: confirmar que las tablas existen
SELECT 'transfers' AS tabla, count(*) FROM transfers
UNION ALL
SELECT 'transfer_items', count(*) FROM transfer_items;
