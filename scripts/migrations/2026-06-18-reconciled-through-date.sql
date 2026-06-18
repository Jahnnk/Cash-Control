-- ============================================================================
-- Marcador "Cuadrado hasta [fecha]" por local
-- Fecha: 2026-06-18
-- Aplicar manualmente en Neon (console.neon.tech → SQL Editor).
-- ⚠️ ANTES DE EMPEZAR: crear snapshot manual en Neon.
--
-- Qué hace:
--   Agrega una columna por negocio que recuerda hasta qué fecha Jahnn
--   confirmó que el banco real = el saldo del sistema. A partir de ese día,
--   la búsqueda de diferencias y el feed de Movimientos diarios se enfocan
--   solo en lo posterior (los días anteriores quedan colapsados).
--
--   NULL = nunca cuadrado (comportamiento actual, no cambia ningún saldo).
--   Es una sola columna anulable: no toca datos existentes ni cálculos.
-- ============================================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS reconciled_through_date date;

-- Verificación (debe devolver 1 fila: columna 'reconciled_through_date', date, nullable=YES):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'businesses' AND column_name = 'reconciled_through_date';

-- Estado inicial (las 3 deben salir en NULL = nunca cuadrado):
SELECT id, name, reconciled_through_date FROM businesses ORDER BY id;
