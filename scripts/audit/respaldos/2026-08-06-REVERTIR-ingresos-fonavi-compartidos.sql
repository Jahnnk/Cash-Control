-- Reversión: devuelve los 2 ingresos existentes a su estado antes de la corrección
BEGIN;

UPDATE bank_income_items SET is_special_loan=false, loan_via_bank=false, note=null WHERE id='0df066a7-9d80-4231-a400-17a3d01f323d';
UPDATE bank_income_items SET is_special_loan=false, loan_via_bank=false, note="Reembolso Fonavi" WHERE id='811176f6-9ca0-4824-9bac-b54bb1954df0';

-- Además, borrar las filas NUEVAS creadas por 2026-08-06-fonavi-compartidos-a-prestamo.mjs
-- (sus ids se imprimen al ejecutar ese script con --apply)

COMMIT;
