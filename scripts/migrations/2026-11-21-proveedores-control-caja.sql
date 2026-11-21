-- Proveedores ← Control de Caja (Jahnn, 21-nov-2026): los proveedores y los precios reales de cada compra se traen
-- de Control de Caja. Cada fila recuerda de dónde vino para no traerla dos veces.
-- Solo agrega columnas opcionales y amplía decimales del precio (una hoja cuesta centavos). Idempotente.
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS caja_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS proveedores_caja_id ON proveedores (caja_id) WHERE caja_id IS NOT NULL;
ALTER TABLE proveedor_precios ADD COLUMN IF NOT EXISTS caja_item_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS proveedor_precios_caja_item ON proveedor_precios (caja_item_id) WHERE caja_item_id IS NOT NULL;
ALTER TABLE proveedor_precios ALTER COLUMN precio TYPE numeric(12,4)
