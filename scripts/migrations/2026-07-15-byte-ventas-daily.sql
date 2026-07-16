-- ============================================================
-- Ventas diarias de Byte (reporte "Ventas de <MES> <AÑO>"), jul-2026.
-- Los admins de Fonavi/Centro y la supervisora de Atelier suben el
-- reporte semanal de ventas; esta tabla es la fuente del deck de la
-- reunión (acumulado del mes + comparativos semana/mes).
-- # Pedidos ≠ personas: en las cafeterías el tráfico se cuenta a mano
-- (upselling_daily.personas) y NO se pisa con este import.
-- Correr en Neon (SQL Editor) DESPUÉS de un snapshot. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS byte_ventas_daily (
  id           serial PRIMARY KEY,
  business_id  integer NOT NULL REFERENCES businesses(id),
  date         date NOT NULL,
  pedidos      integer NOT NULL DEFAULT 0,
  descuentos   numeric(12,2) NOT NULL DEFAULT 0,
  total        numeric(12,2) NOT NULL,
  source       text NOT NULL DEFAULT 'import',  -- 'import' (reporte semanal) | 'manual' (registro diario)
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, date)
);

-- Verificación:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'byte_ventas_daily';
