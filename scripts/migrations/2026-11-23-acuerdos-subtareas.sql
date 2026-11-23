-- Subtareas en Acuerdos y tareas — pedido de Jahnn, 23-nov-2026.
--
-- QUÉ ES: una tarea puede tener subtareas completas (responsable, fecha y estado propios). Un solo nivel:
-- una subtarea no tiene subtareas (lo controla el código). Cada subtarea cuenta en el cumplimiento de su
-- responsable. Si se borra la madre, la subtarea queda suelta. Solo AGREGA una columna. Idempotente.

ALTER TABLE acuerdos ADD COLUMN IF NOT EXISTS padre_id int REFERENCES acuerdos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS acuerdos_padre_idx ON acuerdos (padre_id);
