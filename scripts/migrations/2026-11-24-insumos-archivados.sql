-- Insumos archivados — paso 1 de «una sola lista de insumos», 24-nov-2026.
--
-- QUÉ ES: un insumo que ya no se compra se archiva en Grupo → Recetas y costos → Precios de insumos. Sale de
-- los buscadores de recetas, pero las recetas que ya lo usan conservan su precio (no se borra nada). Sacar la
-- fila = desarchivar. Clave = (origen, sku), igual que insumos_precios.
-- Solo CREA una tabla nueva. Idempotente.

CREATE TABLE IF NOT EXISTS insumos_archivados (
  origen        text NOT NULL,
  sku           text NOT NULL,
  archivado_por text NOT NULL,
  archivado_el  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origen, sku)
);
