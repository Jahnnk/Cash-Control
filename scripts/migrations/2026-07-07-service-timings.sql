-- ============================================================
-- Cronómetro de tiempos de atención (encargado de salón), jul-2026.
-- Correr en Neon (SQL Editor) DESPUÉS de un snapshot. Idempotente.
--
-- Depende de la migración de tiempos partidos (2026-07-06):
-- upselling_daily.tiempo_mesa_min. Si esa aún no corrió, el código
-- se degrada solo (escribe solo el tiempo de mostrador), pero lo
-- ideal es correr ambas.
-- ============================================================

CREATE TABLE IF NOT EXISTS service_timings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      integer NOT NULL,
  date             date NOT NULL,                 -- fecha Lima de la atención
  kind             text NOT NULL CHECK (kind IN ('mostrador','mesa')),
  label            text NOT NULL DEFAULT '',      -- "Mesa 5", "Mostrador #3", cliente
  started_at       timestamptz NOT NULL,          -- comanda / pedido tomado
  ended_at         timestamptz,                   -- despacho / servido (null = en curso)
  duration_seconds integer,                       -- calculado al cerrar (server-side)
  created_by       text,                          -- 'verif' | 'admin' | 'full'
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT NOW()
);

-- Consultas del día por sede (en curso + completos).
CREATE INDEX IF NOT EXISTS idx_service_timings_biz_date ON service_timings (business_id, date);
-- Cronómetros en curso (ended_at IS NULL).
CREATE INDEX IF NOT EXISTS idx_service_timings_running ON service_timings (business_id, ended_at)
  WHERE ended_at IS NULL;

-- gen_random_uuid() viene de pgcrypto; en Neon suele estar activa. Si
-- diera error "function gen_random_uuid() does not exist", correr antes:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verificación:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'service_timings';
