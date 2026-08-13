-- Migración 011: pagos parciales (abonos) a los pasivos / créditos grandes
--
-- Problema: a los créditos grandes (Ingrid Vidal, Aconcagua, etc.) rara vez se
--   les paga el total de una — se abona de a poco. Se necesita poder registrar
--   un pago parcial que baje el saldo y quede en el pendiente con lo que falta.
--
-- Solución:
--   - liabilities.original_amount: monto original de la deuda (para ver progreso).
--   - liabilities.amount pasa a ser el SALDO pendiente (baja con cada abono).
--   - Tabla liability_payments: un registro por abono, con fecha. Sirve además
--     para el análisis de flujo de caja (efectivo real que sale de la cuenta).
--
-- Ejecutar en: Supabase → SQL Editor

-- ================================================================
-- 1. Monto original en liabilities (backfill = saldo actual)
-- ================================================================
ALTER TABLE liabilities
  ADD COLUMN IF NOT EXISTS original_amount numeric;

UPDATE liabilities SET original_amount = amount WHERE original_amount IS NULL;

-- ================================================================
-- 2. Tabla de abonos
-- ================================================================
CREATE TABLE IF NOT EXISTS liability_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id uuid NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  amount       numeric NOT NULL CHECK (amount > 0),   -- monto del abono
  paid_date    date NOT NULL DEFAULT current_date,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_liability_payments_liability
  ON liability_payments (liability_id);

-- ================================================================
-- 3. RLS: mismo patrón que el resto del ERP
-- ================================================================
ALTER TABLE liability_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON liability_payments;
CREATE POLICY "authenticated_all" ON liability_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Verificación
SELECT 'liabilities con original' AS chk, count(*) FROM liabilities WHERE original_amount IS NOT NULL
UNION ALL
SELECT 'abonos registrados', count(*) FROM liability_payments;
