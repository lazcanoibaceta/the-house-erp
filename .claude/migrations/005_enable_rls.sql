-- Migración 005: activar Row-Level Security en todas las tablas
--
-- Problema: las tablas eran públicas (cualquiera podía leer/editar/borrar).
-- Solución: habilitar RLS + política "solo usuarios autenticados".
--
-- Como el ERP es de uso interno y todos los usuarios hacen login,
-- la política es simple: authenticated = acceso total.
--
-- Ejecutar en: Supabase → SQL Editor

-- ================================================================
-- 1. Habilitar RLS en todas las tablas
-- ================================================================
ALTER TABLE locations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_locations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_recipes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases                ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_counts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_count_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_periods            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_by_channel         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_by_weekday         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_top_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settlements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_costs              ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- 2. Política: solo usuarios con sesión activa pueden operar
-- ================================================================
-- La política "FOR ALL" cubre SELECT, INSERT, UPDATE y DELETE.
-- USING (true) = cualquier fila es visible para el usuario autenticado.
-- WITH CHECK (true) = puede escribir cualquier fila.

CREATE POLICY "authenticated_all" ON locations             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON suppliers             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON supplier_locations    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON insumos               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON products              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON recipes               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON insumo_recipes        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON purchases             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON purchase_items        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON stock_movements       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON inventory_counts      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON inventory_count_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_periods         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_by_channel      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_by_weekday      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_top_products    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON platform_settlements  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON expense_categories    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON operating_expenses    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON labor_costs           FOR ALL TO authenticated USING (true) WITH CHECK (true);
