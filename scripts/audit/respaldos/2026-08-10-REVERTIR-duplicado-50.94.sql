-- Revertir el borrado del ingreso duplicado de S/50.94 (10-ago-2026).
-- Solo correr si se comprueba que NO era duplicado.
INSERT INTO bank_income_items (id, date, amount, business_id, payment_method, is_byte_sale, archived)
VALUES ('4f15e896-8fa4-4460-a96c-4349fc3177f7', '2026-08-04', 50.94, 1, 'transferencia', false, false);
