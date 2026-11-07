-- Hoja «Carta» del Excel de pricing (7-nov-2026): lo que ve el cliente.
--   seccion:  sección de la carta («Postres», «Café Fríos»…)
--   en_carta: true = está en la carta; false = solo exhibidor/fuera de carta; NULL = no se sabe
-- Solo agrega columnas (no toca datos). Lo llena la subida del Excel de pricing (Productos → Reportes de rotación).
ALTER TABLE costos_carta ADD COLUMN IF NOT EXISTS seccion TEXT;
ALTER TABLE costos_carta ADD COLUMN IF NOT EXISTS en_carta BOOLEAN;
