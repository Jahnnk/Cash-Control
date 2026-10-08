-- Candidatos a reemplazo: de dónde sale cada producto de la carta y qué insumos usa solo él
-- (pedido de Jahnn, 8-oct-2026). Lo llena la subida del Excel de pricing (Grupo → Recetas y costos).
--   origen:  'Atelier' | 'Cafetería' | 'Externo' | 'Por definir'  (columna «Origen» de PRICING)
--   insumos: [{ "sku": "…", "nombre": "…", "exclusivo": true|false }] de su receta (sin empaques)
ALTER TABLE costos_carta ADD COLUMN IF NOT EXISTS origen TEXT;
ALTER TABLE costos_carta ADD COLUMN IF NOT EXISTS insumos JSONB;
