-- Prioridad de los acuerdos (Alta, Media, Baja) — pedido de Jahnn, 19-nov-2026 (referencia: Jira).
-- Solo agrega una columna con valor por defecto «media»: los acuerdos existentes quedan en Media. Idempotente.
ALTER TABLE acuerdos ADD COLUMN IF NOT EXISTS prioridad text NOT NULL DEFAULT 'media';
ALTER TABLE acuerdos DROP CONSTRAINT IF EXISTS acuerdos_prioridad_check;
ALTER TABLE acuerdos ADD CONSTRAINT acuerdos_prioridad_check CHECK (prioridad IN ('alta','media','baja'));
