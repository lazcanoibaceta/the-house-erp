-- Migración 012: objetivos de venta (metas mensuales por local)
--
-- Fase 3: proyección de ventas + objetivos. La proyección se calcula al vuelo
-- desde sales_periods (no se guarda). Lo que SÍ se guarda es el objetivo que
-- fija Alonso para cada mes/local, para poder compararlo después contra lo real.
--
-- target_amount va en el mismo formato que sales_periods.total_sales: CON IVA.
--
-- Ejecutar en: Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS sales_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   uuid NOT NULL REFERENCES locations(id),
  period_year   int  NOT NULL,
  period_month  int  NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  target_amount numeric NOT NULL,          -- meta de ventas del mes (con IVA)
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (location_id, period_year, period_month)   -- un objetivo por local+mes (upsert)
);

ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON sales_targets;
CREATE POLICY "authenticated_all" ON sales_targets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Verificación
SELECT 'sales_targets' AS tabla, count(*) FROM sales_targets;
