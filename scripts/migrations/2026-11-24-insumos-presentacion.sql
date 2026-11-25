-- Presentación de compra de cada insumo — Grupo → Insumos y packaging, 24-nov-2026.
--
-- QUÉ ES: cómo se compra el insumo, además de su unidad de receta. Ej. leche condensada: precio por kg (para las
-- recetas) y se compra en «lata» de 393 g. El sistema convierte: 12 latas = 4.716 kg; precio por lata = precio
-- por kg × 0.393. Sirve para contar compras y stock en latas más adelante.
--   presentacion           el envase o paquete (lata, bolsa, caja…); null = se compra por la unidad de receta
--   presentacion_cantidad  cuánto trae una (393)
--   presentacion_unidad    en qué (g, kg, ml, l, und)
-- Solo AGREGA columnas vacías a insumos_ficha. Idempotente.

ALTER TABLE insumos_ficha ADD COLUMN IF NOT EXISTS presentacion text;
ALTER TABLE insumos_ficha ADD COLUMN IF NOT EXISTS presentacion_cantidad numeric(14,4);
ALTER TABLE insumos_ficha ADD COLUMN IF NOT EXISTS presentacion_unidad text;
