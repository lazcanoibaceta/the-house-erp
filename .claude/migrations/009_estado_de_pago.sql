-- Migración 009: estado de pago en compras y gastos
--
-- Problema: hoy no hay forma de saber si una factura está pagada o pendiente.
--   Varios proveedores venden a crédito (sobre todo en Los Andes, también San
--   Felipe), así que se necesita distinguir lo ya pagado de lo que se debe, con
--   una fecha de vencimiento opcional para poder proyectar el flujo de caja.
--
-- Solución: tres columnas nuevas en purchases y en operating_expenses:
--   - payment_status: 'pagado' | 'por_pagar'  (default 'pagado')
--   - due_date:       fecha de vencimiento del crédito (opcional)
--   - paid_date:      cuándo se marcó como pagada (se llena al pagar)
--
-- Las filas existentes quedan como 'pagado' (son históricas, ya pagadas).
--
-- Ejecutar en: Supabase → SQL Editor

-- ================================================================
-- 1. Compras (facturas de proveedores)
-- ================================================================
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pagado'
    CHECK (payment_status IN ('pagado', 'por_pagar')),
  ADD COLUMN IF NOT EXISTS due_date  date,
  ADD COLUMN IF NOT EXISTS paid_date date;

-- ================================================================
-- 2. Gastos operativos
-- ================================================================
ALTER TABLE operating_expenses
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pagado'
    CHECK (payment_status IN ('pagado', 'por_pagar')),
  ADD COLUMN IF NOT EXISTS due_date  date,
  ADD COLUMN IF NOT EXISTS paid_date date;

-- ================================================================
-- 3. Índices parciales: la página de pendientes filtra por 'por_pagar'
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_purchases_por_pagar
  ON purchases (location_id, due_date)
  WHERE payment_status = 'por_pagar';

CREATE INDEX IF NOT EXISTS idx_expenses_por_pagar
  ON operating_expenses (location_id, due_date)
  WHERE payment_status = 'por_pagar';

-- Verificación: contar pendientes en cada tabla (debería dar 0 recién migrado)
SELECT 'purchases por pagar'  AS tabla, count(*) FROM purchases          WHERE payment_status = 'por_pagar'
UNION ALL
SELECT 'gastos por pagar',              count(*) FROM operating_expenses WHERE payment_status = 'por_pagar';
