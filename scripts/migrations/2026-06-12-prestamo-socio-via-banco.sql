-- ============================================================================
-- Unificar préstamos de socio: nueva columna loan_via_bank
-- Fecha: 2026-06-12
-- Aplicar manualmente en Neon (console.neon.tech → SQL Editor).
-- ⚠️ ANTES DE EMPEZAR: crear snapshot manual en Neon.
--
-- Contexto:
--   La pantalla "Préstamos del socio" lee is_special_loan = true, y la
--   fórmula del saldo BCP EXCLUYE esas filas (los préstamos históricos
--   nunca pasaron por el banco). El préstamo de S/1,000 del 21/05
--   ("Préstamo de Jahnn para pago RestaPro") SÍ entró al BCP, así que se
--   registró como ingreso no operativo — por eso el banco cuadra pero la
--   pantalla no lo muestra.
--
--   loan_via_bank = true marca un préstamo/devolución que SÍ pasó por la
--   cuenta BCP: la cadena del saldo lo sigue contando (banco intacto) y
--   la pantalla de préstamos lo muestra (un solo registro, cero doble conteo).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PASO A — Aplicar AHORA, ANTES de mergear el PR.
-- Solo agrega columnas con DEFAULT false: ningún número de la app cambia.
-- El código nuevo necesita que estas columnas existan para poder deployar.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE bank_income_items
  ADD COLUMN IF NOT EXISTS loan_via_bank boolean NOT NULL DEFAULT false;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS loan_via_bank boolean NOT NULL DEFAULT false;

-- Verificación Paso A (debe devolver 2 filas, ambas con default false):
SELECT table_name, column_name, column_default
FROM information_schema.columns
WHERE column_name = 'loan_via_bank';


-- ────────────────────────────────────────────────────────────────────────────
-- PASO B — Aplicar DESPUÉS de mergear el PR a main (producción ya deployada).
-- Reclasifica el préstamo de S/1,000 como préstamo del socio que entró al
-- banco. Si se corre ANTES del deploy, el saldo BCP caería S/1,000 en el
-- próximo recálculo — por eso el orden importa.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE bank_income_items
SET is_special_loan = true,
    loan_via_bank   = true
WHERE id = '564f3079-ae31-4460-87c0-e6a894de633c'  -- S/1,000 · 21/05 · RestaPro
  AND business_id = 1
  AND amount = 1000;

-- Verificación Paso B:
-- 1) La fila quedó reclasificada (1 fila, ambos flags true):
SELECT id, date, amount, note, is_special_loan, loan_via_bank
FROM bank_income_items
WHERE id = '564f3079-ae31-4460-87c0-e6a894de633c';

-- 2) Saldo pendiente con socio ahora = 8016.53 (antes 7016.53):
SELECT
  (SELECT COALESCE(SUM(amount), 0) FROM bank_income_items
    WHERE business_id = 1 AND is_special_loan = true)
  -
  (SELECT COALESCE(SUM(amount), 0) FROM expenses
    WHERE business_id = 1 AND is_special_loan = true)
  AS saldo_pendiente_socio;
