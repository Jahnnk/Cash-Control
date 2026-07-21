-- ============================================================
-- Consumo del personal (jul-2026, observación de Chari/Centro).
--
-- Beneficio del equipo: 20% de descuento en productos Yayi's,
-- descontado del sueldo a fin de mes. Esas compras pasan por Byte y
-- BAJAN el ticket promedio del programa de incentivos — pero a un
-- compañero nadie le hace upselling, así que castigar la meta por
-- ellas es injusto (misma lógica que el delivery, PR #90).
--
-- El registro diario gana el detalle "consumo del personal" del día
-- (pedidos + venta, DENTRO de los totales) para EXCLUIRLO del ticket
-- del programa. Informativo aparte, jamás castiga.
--
-- Correr en Neon (SQL Editor) DESPUÉS de un snapshot. Idempotente.
-- ============================================================

ALTER TABLE upselling_daily ADD COLUMN IF NOT EXISTS personal_pedidos integer;
ALTER TABLE upselling_daily ADD COLUMN IF NOT EXISTS personal_venta numeric(12,2);

-- Verificación:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'upselling_daily' AND column_name LIKE 'personal%';
