-- ============================================================
-- Delivery (jul-2026): cronómetro + KPI de tiempo + ticket sin delivery.
--
-- 1. El cronómetro del encargado gana el tipo 'delivery'
--    (registro del pedido → entrega al motorizado).
-- 2. upselling_daily guarda el tiempo medido de delivery y el detalle
--    de pedidos/venta delivery del día (para EXCLUIRLOS del ticket
--    promedio del programa de incentivos — en delivery no se puede
--    sugerir extras, el equipo no controla ese ticket).
-- 3. kpi_targets gana la meta de tiempo de delivery (configurable).
--
-- Correr en Neon (SQL Editor) DESPUÉS de un snapshot. Idempotente.
-- ============================================================

-- 1. Permitir 'delivery' en el cronómetro
ALTER TABLE service_timings DROP CONSTRAINT IF EXISTS service_timings_kind_check;
ALTER TABLE service_timings
  ADD CONSTRAINT service_timings_kind_check
  CHECK (kind IN ('mostrador','mesa','delivery'));

-- 2. Registro diario: tiempo medido + detalle delivery del día
ALTER TABLE upselling_daily ADD COLUMN IF NOT EXISTS tiempo_delivery_min numeric(6,1);
ALTER TABLE upselling_daily ADD COLUMN IF NOT EXISTS delivery_pedidos integer;
ALTER TABLE upselling_daily ADD COLUMN IF NOT EXISTS delivery_venta numeric(12,2);

-- 3. Meta de tiempo de delivery (por defecto el código usa 20 min)
ALTER TABLE kpi_targets ADD COLUMN IF NOT EXISTS tiempo_delivery_max_min numeric(6,1);

-- Verificación:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name IN ('upselling_daily','kpi_targets') AND column_name LIKE '%delivery%';
