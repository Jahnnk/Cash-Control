-- Plazo con rango (Desde → Hasta) — pedido de Jahnn, 19-nov-2026.
-- Agrega «fecha_inicio», vacía. Si está vacía, el plazo empieza el día en que se creó la tarea (como antes).
-- «Hasta» sigue siendo fecha_limite. Idempotente; no cambia datos existentes.
ALTER TABLE acuerdos ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE acuerdos DROP CONSTRAINT IF EXISTS acuerdos_fecha_inicio_check;
ALTER TABLE acuerdos ADD CONSTRAINT acuerdos_fecha_inicio_check CHECK (fecha_inicio IS NULL OR fecha_inicio <= fecha_limite);
