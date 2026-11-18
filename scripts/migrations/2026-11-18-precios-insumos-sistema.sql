-- Precios de insumos editados en el sistema (fase 1 de «la carta vive en el sistema», pedido de Jahnn, 18-nov-2026).
-- Un mismo insumo puede tener el mismo día la foto del Excel y un cambio hecho en el sistema: la clave
-- pasa a incluir la fuente. Las 473 filas que ya existen quedan como 'excel'. No borra ni cambia precios.
ALTER TABLE insumos_precios ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'excel';  -- 'excel' o 'sistema'
ALTER TABLE insumos_precios DROP CONSTRAINT IF EXISTS insumos_precios_pkey;
ALTER TABLE insumos_precios ADD PRIMARY KEY (fecha, origen, sku, fuente);
