-- ============================================================
-- Feedback de administradores (jul-2026) — 3 cambios de schema
-- Correr en Neon (SQL Editor) DESPUÉS de crear un snapshot.
-- Todo es idempotente: correrlo dos veces no daña nada.
-- ============================================================

-- 1) KPI de tiempos partido en dos: MOSTRADOR (meta <6 min) y MESA (<15 min).
--    La columna existente tiempo_atencion_min pasa a ser "mostrador".
ALTER TABLE upselling_daily ADD COLUMN IF NOT EXISTS tiempo_mesa_min numeric(6,1);
ALTER TABLE kpi_targets ADD COLUMN IF NOT EXISTS tiempo_mesa_max_min numeric(6,1);

-- Metas iniciales de tiempos para las filas de metas ya existentes
-- (mostrador 6 min si estaba vacío, mesa 15 min).
UPDATE kpi_targets
SET tiempo_max_min = COALESCE(tiempo_max_min, 6),
    tiempo_mesa_max_min = COALESCE(tiempo_mesa_max_min, 15)
WHERE business_id IN (2, 3);

-- 2) Detalle de mermas por producto (como el cuadro de Notion).
CREATE TABLE IF NOT EXISTS merma_items (
  id           serial PRIMARY KEY,
  business_id  integer NOT NULL,
  date         date NOT NULL,
  producto     text NOT NULL,
  cantidad     numeric(10,3) NOT NULL DEFAULT 1,
  unidad       text,
  costo_unit   numeric(10,2) NOT NULL DEFAULT 0,
  total        numeric(10,2) NOT NULL,
  motivo       text,
  accion       text,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merma_items_biz_date ON merma_items (business_id, date);

-- 3) Estado de las banderas de control (resuelta / descartada, con nota
--    y quién la atendió — admin o dirección).
CREATE TABLE IF NOT EXISTS control_flag_status (
  id           serial PRIMARY KEY,
  business_id  integer NOT NULL,
  month        text NOT NULL,               -- 'YYYY-MM'
  flag_id      text NOT NULL,               -- id estable de la bandera
  status       text NOT NULL CHECK (status IN ('resuelta','descartada')),
  nota         text,
  resolved_by  text NOT NULL,               -- 'admin' | 'direccion'
  resolved_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, month, flag_id)
);

-- Verificación rápida (debe devolver las 2 tablas y 2 columnas nuevas):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'upselling_daily' AND column_name = 'tiempo_mesa_min';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'kpi_targets' AND column_name = 'tiempo_mesa_max_min';
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('merma_items','control_flag_status');
