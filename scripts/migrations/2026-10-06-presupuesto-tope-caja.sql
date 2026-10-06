-- Presupuesto ↔ Control de Caja (pedido de Jahnn, 6-oct-2026). Aditiva.
-- De cada categoría, la parte que maneja el administrador de la sede (su tope en Control de Caja).
ALTER TABLE presupuesto_linea ADD COLUMN IF NOT EXISTS tope_caja numeric(12,2) CHECK (tope_caja IS NULL OR tope_caja >= 0);
-- Cuándo se mandaron los topes a Control de Caja y, si falló, por qué.
ALTER TABLE presupuesto_mes ADD COLUMN IF NOT EXISTS caja_enviado_el timestamptz;
ALTER TABLE presupuesto_mes ADD COLUMN IF NOT EXISTS caja_error text;
