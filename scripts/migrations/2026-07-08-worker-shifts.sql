-- ============================================================
-- Mejor vendedor por TURNO (hándicap), jul-2026.
-- Guarda el turno de cada trabajador (mañana/tarde/completo) para
-- comparar a cada quien contra lo normal de SU turno, no contra el pico.
-- Correr en Neon (SQL Editor) DESPUÉS de un snapshot. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS worker_shifts (
  id           serial PRIMARY KEY,
  business_id  integer NOT NULL,
  nombre       text NOT NULL,                 -- nombre tal como viene del reporte de Byte
  turno        text NOT NULL DEFAULT 'completo'
               CHECK (turno IN ('mañana','tarde','completo')),
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, nombre)
);

-- Verificación:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'worker_shifts';
