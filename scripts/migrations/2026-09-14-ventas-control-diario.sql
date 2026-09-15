-- Control diario de ventas de Kelly (pestaña "CONTROL VENTAS <MES><AA>").
--
-- Pedido de Jahnn (14-sep-2026): el reporte mensual de Atelier mostraba
-- "Ventas Byte" con el detalle diario en cero, porque la pestaña
-- "Control de VTAS" solo separa lo cobrado (efectivo/Yape/POS) y Atelier
-- vende casi todo al crédito. Kelly armó una pestaña nueva con el reporte
-- diario de Byte y su separación en crédito y contado.
--
-- Acá se guarda SOLO lo que escribe Kelly (crédito, contado, nota) y la
-- copia del total de Byte que ella hizo, para compararla. TOTAL y
-- VARIACIÓN no se guardan: los recalcula el sistema
-- (src/lib/ventas-control-conciliacion.ts) contra la carga oficial de
-- Byte que sube Luis (byte_ventas_daily).
--
-- Migración ADITIVA: una tabla nueva, vacía. El import reemplaza el mes
-- completo (DELETE + INSERT en la misma transacción), igual que el resto
-- de las tablas del Excel.

CREATE TABLE IF NOT EXISTS ventas_control_diario (
  business_id       integer NOT NULL,
  date              date    NOT NULL,
  pedidos           integer NOT NULL DEFAULT 0,
  descuentos        numeric(12,2) NOT NULL DEFAULT 0,
  total_vendido     numeric(12,2) NOT NULL DEFAULT 0,   -- la copia de Byte que hizo Kelly
  venta_credito     numeric(12,2) NOT NULL DEFAULT 0,
  venta_contado     numeric(12,2) NOT NULL DEFAULT 0,
  nota              text,
  imported_from_excel boolean NOT NULL DEFAULT true,
  import_batch_id   uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, date)
);
