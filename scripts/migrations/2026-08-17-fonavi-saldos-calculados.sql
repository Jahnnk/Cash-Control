-- ============================================================
-- Limpiar los saldos CALCULADOS que quedaron en Fonavi
-- Incidente del 17-ago-2026 — corrido con OK explícito de Jahnn
-- ============================================================
--
-- QUÉ PASÓ
--
-- La cadena que recalcula `bank_balance_real` estaba copiada en varios
-- archivos y una de las copias (record-edits.ts) se quedó sin el candado
-- de las sedes con reset. El 5-ago, al editar tres movimientos de Fonavi,
-- esa copia escribió saldos calculados arrancando de CERO:
--
--   28-jul:       0 + 802.44 −    54.79 =    747.65
--   30-jul:       0 + 839.84 − 1,517.24 =   −677.40
--   03-ago: −677.40 + 703.83 − 1,395.00 = −1,368.57
--
-- Ese −1,368.57 quedó como "último saldo del banco" de Fonavi, y el panel
-- mostraba −S/455.61 cuando el BCP real tenía S/15,594.02.
--
-- POR QUÉ SE PONEN EN NULO Y NO SE "CORRIGEN"
--
-- Fonavi arranca el 01-ago con saldo inicial S/12,689.75 (corte del
-- 31-jul). Su saldo BCP es VIRTUAL: inicial + flujo posterior. En esa
-- sede `bank_balance_real` está reservado a LECTURAS REALES del banco, y
-- ninguno de estos tres números lo es. Vaciarlos no pierde información:
-- devuelve la columna a su significado.
--
-- Además, dos de ellos son de julio, anteriores al corte del sistema.
--
-- RESULTADO ESPERADO
--
--   12,689.75 + 19,837.71 − 17,008.93 = 15,518.53
--
-- que es exactamente el saldo que calcula el Excel de Kelly (celda N113).
-- Contra el BCP real (S113 = 15,594.02) queda −75.49 de diferencia, que
-- es la misma que Kelly ya arrastra en su propia hoja (celda T113) — o
-- sea, el sistema queda cuadrado CON Kelly.
--
-- El código que causó esto ya está arreglado: la cadena vive en un solo
-- archivo (src/lib/saldo-bcp-sql.ts) y el candado viaja DENTRO del SQL,
-- así que ningún llamador puede olvidarlo.
--
-- REVERSIÓN (si hiciera falta):
--   UPDATE daily_records SET bank_balance_real = 747.65   WHERE business_id = 2 AND date = '2026-07-28';
--   UPDATE daily_records SET bank_balance_real = -677.40  WHERE business_id = 2 AND date = '2026-07-30';
--   UPDATE daily_records SET bank_balance_real = -1368.57 WHERE business_id = 2 AND date = '2026-08-03';
-- ============================================================

UPDATE daily_records
SET bank_balance_real = NULL
WHERE business_id = 2
  AND date IN ('2026-07-28', '2026-07-30', '2026-08-03')
  -- Cinturón: solo si siguen teniendo EXACTAMENTE los valores basura.
  -- Si alguien entró una lectura real en esos días mientras tanto, este
  -- script no la pisa.
  AND bank_balance_real IN (747.65, -677.40, -1368.57);
