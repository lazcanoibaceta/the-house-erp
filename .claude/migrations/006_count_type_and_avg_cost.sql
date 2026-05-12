-- Migración 006: tipo de conteo + recalcular avg_cost desde historial de compras
--
-- Problema 1: inventory_counts no distingue entre cierre de mes y seguimiento semanal.
-- Solución: agregar columna count_type ('cierre_mes' | 'seguimiento').
--
-- Problema 2: avg_cost en insumos está en null/0 para muchos insumos porque
--   la actualización no se aplicó retroactivamente cuando se cargaron las compras.
-- Solución: recalcular avg_cost como promedio ponderado de todo el historial de purchase_items.
--
-- Ejecutar en: Supabase → SQL Editor

-- ================================================================
-- 1. Agregar count_type a inventory_counts
-- ================================================================
ALTER TABLE inventory_counts
  ADD COLUMN IF NOT EXISTS count_type text NOT NULL DEFAULT 'cierre_mes'
  CHECK (count_type IN ('cierre_mes', 'seguimiento'));

-- ================================================================
-- 2. Recalcular avg_cost en insumos desde historial de compras
--    (promedio ponderado: sum(qty × unit_price) / sum(qty))
--    Solo actualiza los que tienen avg_cost = 0 o NULL.
-- ================================================================
UPDATE insumos i
SET avg_cost = sub.avg_cost
FROM (
  SELECT
    pi.insumo_id,
    SUM(pi.quantity * pi.unit_price) / SUM(pi.quantity) AS avg_cost
  FROM purchase_items pi
  WHERE pi.quantity > 0
  GROUP BY pi.insumo_id
) sub
WHERE i.id = sub.insumo_id
  AND (i.avg_cost IS NULL OR i.avg_cost = 0);

-- Verificación: ver cuántos insumos tienen avg_cost ahora
SELECT
  COUNT(*) FILTER (WHERE avg_cost > 0)  AS con_costo,
  COUNT(*) FILTER (WHERE avg_cost IS NULL OR avg_cost = 0) AS sin_costo,
  COUNT(*) AS total
FROM insumos;
