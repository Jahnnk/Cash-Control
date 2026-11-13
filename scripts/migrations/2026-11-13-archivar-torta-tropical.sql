-- Jahnn (13-nov-2026): la torta tropical ya no se vende; debe estar archivada.
-- Última salida de Atelier: septiembre de 2026. Mismas dos filas que crearía «Archivar» en Grupo → Productos
-- (clave = claveByte del nombre): la porción y el entero (Byte: «TORTA TROPICAL - PORCIÓN», «TORTA TROPICAL - ENTERA»,
-- y en Atelier «Y-TORTA TROPICAL ENTERA», que comparte clave con el entero).
INSERT INTO productos_archivados (clave, nombre, motivo, archivado_por)
VALUES ('porcion tropical', 'TORTA TROPICAL - PORCIÓN', 'ya-no-se-vende', 'jahnn'),
       ('entero tropical', 'TORTA TROPICAL - ENTERA', 'ya-no-se-vende', 'jahnn')
ON CONFLICT (clave) DO NOTHING;
