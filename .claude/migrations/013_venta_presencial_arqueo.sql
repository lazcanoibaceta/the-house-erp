-- Migración 013: Venta presencial + Arqueo de caja (BETA)
--
-- Módulo POS auto-contenido para eventos del foodtruck (y respaldo de caja en
-- los locales). Es el PRIMER registro de ventas transacción-por-transacción del
-- sistema: hoy las ventas viven como agregados mensuales en sales_periods.
--
-- Decisiones (definidas con Alonso):
--   1. El foodtruck es un TERCER local ('FT'). Antes del evento se traspasan
--      insumos SF→FT y LA→FT (módulo Traspasos ya existente); durante el evento
--      la venta se registra en FT; después se devuelve lo que sobró.
--   2. En esta beta NO se descuenta inventario en vivo por cada venta: el stock
--      se cuadra con conteo físico antes/después (igual que el food cost).
--   3. Módulo aislado: NO alimenta sales_periods ni /resultados por ahora.
--
-- Convención IVA: los precios de products.sale_price están CON IVA, así que
-- pos_sale_items.unit_price y pos_sales.total quedan CON IVA (precio al cliente).
--
-- Ejecutar en: Supabase → SQL Editor

-- ── 1. Local Foodtruck ──────────────────────────────────────────────────────
INSERT INTO locations (name, short_code, is_active)
SELECT 'Foodtruck', 'FT', true
WHERE NOT EXISTS (SELECT 1 FROM locations WHERE short_code = 'FT');

-- ── 2. Arqueo de caja (sesiones) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     uuid NOT NULL REFERENCES locations(id),
  opening_amount  numeric NOT NULL DEFAULT 0,   -- efectivo inicial en caja
  opened_at       timestamptz NOT NULL DEFAULT now(),
  opened_by       text,                          -- email del usuario que abrió
  status          text NOT NULL DEFAULT 'abierta'
                    CHECK (status IN ('abierta', 'cerrada')),
  closing_counted numeric,                       -- efectivo REAL contado al cierre
  expected_cash   numeric,                       -- calculado: inicial + ventas efectivo
  difference      numeric,                       -- closing_counted - expected_cash
  closed_at       timestamptz,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

-- Solo una caja abierta por local a la vez (evita dos sesiones simultáneas)
CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_una_abierta_por_local
  ON cash_sessions (location_id)
  WHERE status = 'abierta';

-- ── 3. Ventas presenciales (pedidos) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  location_id    uuid NOT NULL REFERENCES locations(id),
  order_number   int  NOT NULL,                  -- correlativo dentro de la sesión
  customer_name  text,
  total          numeric NOT NULL DEFAULT 0,     -- CON IVA (suma de items)
  status         text NOT NULL DEFAULT 'por_pagar'
                   CHECK (status IN ('por_pagar', 'pagado', 'anulado')),
  payment_method text CHECK (payment_method IN ('efectivo', 'tarjeta', 'transferencia')),
  created_at     timestamptz DEFAULT now(),
  paid_at        timestamptz
);

CREATE INDEX IF NOT EXISTS pos_sales_session_idx ON pos_sales (session_id);

-- ── 4. Ítems de cada venta ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id      uuid NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES products(id),
  product_name text NOT NULL,                    -- snapshot del nombre al vender
  unit_price   numeric NOT NULL,                 -- snapshot precio CON IVA
  quantity     int NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS pos_sale_items_sale_idx ON pos_sale_items (sale_id);

-- ── 5. RLS (patrón del proyecto: FOR ALL TO authenticated) ──────────────────
ALTER TABLE cash_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON cash_sessions;
CREATE POLICY "authenticated_all" ON cash_sessions  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON pos_sales;
CREATE POLICY "authenticated_all" ON pos_sales      FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all" ON pos_sale_items;
CREATE POLICY "authenticated_all" ON pos_sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT 'Foodtruck creado' AS check, count(*) FROM locations WHERE short_code = 'FT'
UNION ALL SELECT 'cash_sessions',  count(*) FROM cash_sessions
UNION ALL SELECT 'pos_sales',      count(*) FROM pos_sales
UNION ALL SELECT 'pos_sale_items', count(*) FROM pos_sale_items;
