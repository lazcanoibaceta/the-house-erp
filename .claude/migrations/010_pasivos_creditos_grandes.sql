-- Migración 010: pasivos / créditos grandes (cuentas por pagar de financiamiento)
--
-- Problema: aparte de las facturas de proveedores (purchases) y los gastos
--   (operating_expenses), The House tiene deudas grandes de financiamiento que
--   NO son compras de insumos ni gastos del P&L: préstamos de personas
--   (Ingrid Vidal, Andrés Barraza, Sebastian Tacchi), un crédito Coopeuch, la
--   deuda con el importador Aconcagua Imports y el saldo de tarjeta de crédito.
--   Pagar un préstamo baja un pasivo, no es un gasto — por eso van en su
--   propia tabla, no en operating_expenses.
--
-- Uso: alimentan la sección "Créditos grandes" de la página Pendientes de pago
--   y son la base para proyectar el flujo de caja futuro.
--
-- Nota: montos según planilla de Pipe al 08-jul-2026. Pueden estar desactualizados
--   (se hicieron pagos a Ingrid y otros desde entonces) — revisar y ajustar.
--
-- Ejecutar en: Supabase → SQL Editor

-- ================================================================
-- 1. Tabla de pasivos
-- ================================================================
CREATE TABLE IF NOT EXISTS liabilities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor      text NOT NULL,                       -- a quién se le debe
  kind          text NOT NULL DEFAULT 'otro'         -- tipo de deuda
                  CHECK (kind IN ('prestamo', 'importador', 'tarjeta', 'proveedor', 'otro')),
  amount        numeric NOT NULL,                     -- monto adeudado (lo que se paga)
  status        text NOT NULL DEFAULT 'por_pagar'
                  CHECK (status IN ('por_pagar', 'pagado')),
  is_overdue    boolean NOT NULL DEFAULT false,       -- marcado como vencido en la planilla
  due_date      date,                                 -- vencimiento (opcional)
  paid_date     date,                                 -- cuándo se saldó (al marcar pagado)
  location_id   uuid REFERENCES locations(id),        -- null = deuda a nivel empresa
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ================================================================
-- 2. RLS: mismo patrón que el resto del ERP (authenticated = acceso total)
-- ================================================================
ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON liabilities;
CREATE POLICY "authenticated_all" ON liabilities FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_liabilities_por_pagar
  ON liabilities (status, due_date)
  WHERE status = 'por_pagar';

-- ================================================================
-- 3. Carga inicial de los pasivos (planilla Pipe 08-jul-2026)
--    Solo se insertan si la tabla está vacía (evita duplicar al re-ejecutar).
-- ================================================================
INSERT INTO liabilities (creditor, kind, amount, is_overdue, notes)
SELECT * FROM (VALUES
  ('Ingrid Vidal',          'prestamo',   15259081, false, 'Monto al 08-jul-2026; se hicieron pagos posteriores, revisar con Pipe'),
  ('Andrés Barraza',        'prestamo',    5110649, false, 'Monto al 08-jul-2026'),
  ('Sebastian Tacchi',      'prestamo',    2050494, false, 'Monto al 08-jul-2026'),
  ('Coopeuch Ingrid Vidal', 'prestamo',    3746710, false, 'Crédito Coopeuch a nombre de Ingrid Vidal; monto al 08-jul-2026'),
  ('Aconcagua Imports',     'importador',  7032144, true,  'Porción VENCIDA al 08-jul-2026'),
  ('Aconcagua Imports',     'importador',  2704859, false, 'Porción por pagar (no vencida) al 08-jul-2026'),
  ('Tarjeta de crédito',    'tarjeta',     1967466, false, 'Saldo TC por pagar al 08-jul-2026')
) AS v(creditor, kind, amount, is_overdue, notes)
WHERE NOT EXISTS (SELECT 1 FROM liabilities);

-- Verificación: total de pasivos por pagar (debería dar 37.871.403)
SELECT count(*) AS pasivos, sum(amount) AS total_por_pagar
FROM liabilities
WHERE status = 'por_pagar';
