-- La fuente de dirección: los reportes de Byte que sube Jahnn.
--
-- Pedido de Jahnn (28-sep-2026): "quiero agregar una fuente más, la mía",
-- para cruzar lo que registran los administradores, el Excel y los reportes
-- de Byte que él baja cada semana (del 01 del mes a ayer):
--   1. Ventas de <MES>            → byte_ventas_direccion (manda sobre la carga de la sede)
--   2. Platos con mayor rotación  → ya existía: product_period_sales con origen 'direccion'
--   3. Platos con menor rotación  → productos_menor_rotacion (foto por sede)
--
-- Migración ADITIVA: dos tablas y una vista. No toca datos existentes.

CREATE TABLE IF NOT EXISTS byte_ventas_direccion (
  business_id  integer       NOT NULL,
  date         date          NOT NULL,
  pedidos      integer       NOT NULL DEFAULT 0,
  descuentos   numeric(12,2) NOT NULL DEFAULT 0,
  total        numeric(12,2) NOT NULL,
  file_name    text,
  imported_at  timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, date)
);

-- La venta de Byte que vale para todo el sistema: la de dirección donde la
-- hay; la que subió la sede, en los días que dirección no cubre.
CREATE OR REPLACE VIEW byte_ventas_efectiva AS
  SELECT d.business_id, d.date, d.pedidos, d.descuentos, d.total,
         'import'::text AS source, d.imported_at AS updated_at, 'direccion'::text AS origen
    FROM byte_ventas_direccion d
  UNION ALL
  SELECT v.business_id, v.date, v.pedidos, v.descuentos, v.total,
         v.source, v.updated_at, 'sede'::text AS origen
    FROM byte_ventas_daily v
   WHERE NOT EXISTS (SELECT 1 FROM byte_ventas_direccion d WHERE d.business_id = v.business_id AND d.date = v.date);

-- "Platos con menor rotación": la última foto por sede (se reemplaza en cada carga).
CREATE TABLE IF NOT EXISTS productos_menor_rotacion (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   integer       NOT NULL,
  desde         date          NOT NULL,
  hasta         date          NOT NULL,
  producto      text          NOT NULL,
  -- La categoría que Byte le da al producto (columna "Tipo"): solo referencia.
  tipo_byte     text,
  stock         numeric(12,2),
  vendido       numeric(12,2) NOT NULL DEFAULT 0,
  ultima_venta  date,
  nunca_vendido boolean       NOT NULL DEFAULT false,
  precio        numeric(10,2),
  file_name     text,
  imported_at   timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS productos_menor_rotacion_bid ON productos_menor_rotacion (business_id);
