-- "Foto" del Excel de Kelly en cada carga (pedido de Jahnn, 25-sep-2026).
--
-- Para que el sistema verifique solo, después de importar y cada vez que se
-- abre Grupo → Resumen, que lo cargado coincide con el Excel al céntimo, hay
-- que guardar lo que el Excel decía: ingresos y gastos del mes de la pestaña
-- (sin el saldo inicial) y los saldos finales según el libro de Kelly.
--
-- Migración ADITIVA: 4 columnas nuevas y vacías. No toca ninguna fila.

ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS excel_ingresos numeric(12,2);
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS excel_egresos numeric(12,2);
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS excel_saldo_banco numeric(12,2);
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS excel_saldo_efectivo numeric(12,2);
