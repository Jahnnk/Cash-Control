-- Marca «Revisado» de cada insumo — Grupo → Insumos y packaging, 24-nov-2026.
--
-- QUÉ ES: Jahnn y Luis revisan los insumos uno por uno (precio, presentación, proveedor, archivar). La marca dice
-- quién lo revisó y cuándo, para saber dónde quedaron y seguir otro día. Cambiar el precio también lo marca.
-- Va por lista (Atelier y cafeterías por separado: cada lado tiene su precio).
-- Solo AGREGA dos columnas vacías a insumos_ficha. Idempotente.

ALTER TABLE insumos_ficha ADD COLUMN IF NOT EXISTS revisado_el timestamptz;
ALTER TABLE insumos_ficha ADD COLUMN IF NOT EXISTS revisado_por text;
