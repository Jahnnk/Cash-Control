-- La venta que anota el administrador de Atelier (Luis), guardada APARTE
-- (pedido de Jahnn, 25-sep-2026).
--
-- Hasta hoy, cuando Luis subía el reporte semanal de Byte, la venta que él
-- había anotado cada día en su panel se reemplazaba por la de Byte y se
-- perdía. Guardada aparte sirve de tercer dato para decidir la venta del día
-- cuando el reporte de Byte y el Excel no coinciden (lib/kpis/venta-del-dia.ts).
--
-- ADITIVA: una columna nueva. El UPDATE solo copia a esa columna nueva las
-- ventas que Luis anotó y que el reporte de Byte todavía no reemplazó.

ALTER TABLE upselling_daily ADD COLUMN IF NOT EXISTS venta_admin numeric(12,2);

UPDATE upselling_daily SET venta_admin = revenue
WHERE business_id = 1 AND source = 'manual' AND revenue IS NOT NULL AND venta_admin IS NULL;
