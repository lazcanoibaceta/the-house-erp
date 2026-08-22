-- Migración 015: correlativo global + pagos múltiples + entrega + historial
--
-- Sobre la beta del POS (013 + 014):
--   1. sale_code: correlativo alfanumérico GLOBAL ('V-00001'...) generado por una
--      secuencia de Postgres. NO se reinicia con el arqueo (a diferencia de
--      order_number, que sí va por cierre de caja = "número de cuenta del día").
--   2. pos_payments: varios pagos por venta (parte efectivo + parte tarjeta, o un
--      pago extra si se agregó algo después de pagar). Reemplaza al campo único
--      pos_sales.payment_method (que queda como legacy).
--   3. pos_sales.status suma 'parcial'. Nueva columna 'delivered' (entregado) para
--      sacar la venta de la vista del cajero sin borrarla (historial + reabrir).
--
-- Ejecutar en: Supabase → SQL Editor

-- ── 1. Correlativo global (secuencia que nunca se reinicia) ─────────────────
CREATE SEQUENCE IF NOT EXISTS pos_sale_code_seq;

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_code text;
ALTER TABLE pos_sales
  ALTER COLUMN sale_code SET DEFAULT ('V-' || lpad(nextval('pos_sale_code_seq')::text, 5, '0'));

-- Backfill de ventas ya existentes, en orden cronológico
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM pos_sales WHERE sale_code IS NULL ORDER BY created_at, order_number LOOP
    UPDATE pos_sales SET sale_code = 'V-' || lpad(nextval('pos_sale_code_seq')::text, 5, '0') WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_sale_code_uniq ON pos_sales (sale_code);

-- ── 2. Estado 'parcial' + entrega ───────────────────────────────────────────
ALTER TABLE pos_sales DROP CONSTRAINT IF EXISTS pos_sales_status_check;
ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_status_check
  CHECK (status IN ('por_pagar', 'parcial', 'pagado', 'anulado'));

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS delivered boolean NOT NULL DEFAULT false;

-- ── 3. Pagos (uno o varios por venta) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_payments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method     text NOT NULL CHECK (method IN ('efectivo', 'tarjeta', 'transferencia')),
  amount     numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_payments_sale_idx ON pos_payments (sale_id);

ALTER TABLE pos_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON pos_payments;
CREATE POLICY "authenticated_all" ON pos_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Migrar pagos antiguos (ventas ya pagadas con payment_method único)
INSERT INTO pos_payments (sale_id, method, amount, created_at)
SELECT id, payment_method, total, COALESCE(paid_at, created_at)
FROM pos_sales s
WHERE s.status = 'pagado' AND s.payment_method IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM pos_payments p WHERE p.sale_id = s.id);

-- ── Verificación ────────────────────────────────────────────────────────────
SELECT 'ventas con sale_code' AS check, count(*)::text AS valor FROM pos_sales WHERE sale_code IS NOT NULL
UNION ALL SELECT 'pos_payments', count(*)::text FROM pos_payments
UNION ALL SELECT 'columna delivered',
  (SELECT count(*)::text FROM information_schema.columns WHERE table_name='pos_sales' AND column_name='delivered');
