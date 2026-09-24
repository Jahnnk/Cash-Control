-- Candidatos a reemplazo (Grupo → Productos).
--
-- Pedido de Jahnn (24-sep-2026): decidir con datos qué productos sacar de la
-- carta de Fonavi y Centro, y cuándo, mirando ventas y rentabilidad por meses
-- y semanas. Decisiones de Jahnn:
--   · la rentabilidad sale del Excel maestro de pricing (hoja PRICING,
--     "Costo para cafetería" y "Precio público carta");
--   · desde ahora se guarda CADA carga del reporte de rotación de Byte, para
--     poder comparar semana contra semana (hasta hoy cada carga del sábado
--     reemplazaba a la anterior del mismo mes y solo quedaba el total).
--
-- Migración ADITIVA: tres tablas nuevas. La de cortes arranca con una copia
-- de lo que ya está cargado (la foto de hoy). No cambia ninguna fila existente.

-- Costo y precio de carta de cada producto (la carta es la misma en las dos
-- cafeterías). Se reemplaza entera con cada Excel que sube Jahnn.
CREATE TABLE IF NOT EXISTS costos_carta (
  ref          text PRIMARY KEY,
  nombre       text NOT NULL,
  nombre_carta text,
  categoria    text,
  costo        numeric(12,4) NOT NULL CHECK (costo >= 0),
  precio       numeric(12,2),
  archivo      text,
  cargado_el   timestamptz NOT NULL DEFAULT NOW()
);

-- Vínculos a mano: "este nombre de Byte es este producto del Excel" para lo
-- que el sistema no enlaza solo por nombre. Sobreviven a cada Excel nuevo.
CREATE TABLE IF NOT EXISTS carta_vinculos (
  clave           text PRIMARY KEY,
  nombre_byte     text NOT NULL,
  ref             text NOT NULL,
  actualizado_por text,
  actualizado_el  timestamptz NOT NULL DEFAULT NOW()
);

-- Cada carga del reporte de rotación, tal como llegó (nunca se reemplaza).
-- La semana sale de la diferencia entre dos cargas "del 01 a hoy" seguidas.
CREATE TABLE IF NOT EXISTS rotacion_cortes (
  id               bigserial PRIMARY KEY,
  business_id      integer NOT NULL,
  origen           text NOT NULL,
  month            text NOT NULL,
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  product_name_raw text NOT NULL,
  units            numeric(12,3) NOT NULL,
  revenue          numeric(12,2) NOT NULL,
  import_batch_id  text,
  cargado_el       timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rotacion_cortes_sede_mes ON rotacion_cortes (business_id, month, cargado_el);

-- La foto de lo que ya está cargado, para que el historial arranque completo.
INSERT INTO rotacion_cortes (business_id, origen, month, period_start, period_end, product_name_raw, units, revenue, import_batch_id, cargado_el)
SELECT p.business_id, p.origen, p.month, p.period_start, p.period_end, p.product_name_raw, p.units, p.revenue, p.import_batch_id::text, p.imported_at
FROM product_period_sales p
WHERE p.source = 'byte'
  AND NOT EXISTS (SELECT 1 FROM rotacion_cortes c WHERE c.import_batch_id = p.import_batch_id::text);
