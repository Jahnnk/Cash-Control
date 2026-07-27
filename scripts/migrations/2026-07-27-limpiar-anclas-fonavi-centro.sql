-- Limpieza de "anclas" de saldo bancario calculadas con base errada
-- (auditoría Jahnn + Kelly, 27-jul-2026).
--
-- QUÉ PASÓ: el recálculo automático (pensado para Atelier, que registra
-- su saldo BCP real a diario) escribió en Fonavi y Centro saldos
-- calculados desde CERO (ignorando el saldo inicial del corte) en filas
-- sueltas de daily_records. El saldo del dashboard tomaba la última de
-- esas "anclas" como si fuera una lectura real del banco:
--   Fonavi decía S/-4,458.20 cuando el real era S/19,234.37.
--
-- QUÉ HACE: borra SOLO el campo bank_balance_real (lo pone NULL) de las
-- 22 filas afectadas de Fonavi (2) y Centro (3). No borra filas ni toca
-- movimientos. Con el campo NULL, el saldo vuelve al cálculo correcto:
-- saldo inicial del corte + movimientos posteriores. Verificado con la
-- BD real: Fonavi queda en S/19,234.37 exactos (el saldo real de Jahnn
-- al 24/07); Centro queda en S/16,891.80 (a validar con Kelly).
--
-- El código (PR de la misma fecha) ya impide que el recálculo vuelva a
-- escribir anclas calculadas en sedes con reset — correr este SQL
-- DESPUÉS de mergear ese PR, con snapshot de Neon previo.

UPDATE daily_records
SET bank_balance_real = NULL
WHERE business_id IN (2, 3)
  AND bank_balance_real IS NOT NULL;

-- Verificación esperada: 22 filas actualizadas (19 de Fonavi, 3 de Centro).
