-- Apoyos en Acuerdos y tareas — pedido de Jahnn, 23-nov-2026.
--
-- QUÉ ES: una tarea puede tener, además del responsable principal, una o varias personas de apoyo.
-- Los apoyos la ven en «Mis tareas», cambian su estado y comentan. El cumplimiento y las alertas
-- siguen contando solo al principal (responsable_clave). Solo AGREGA columnas: no cambia ni borra datos.
-- Idempotente.

ALTER TABLE acuerdos ADD COLUMN IF NOT EXISTS apoyo_claves  text[] NOT NULL DEFAULT '{}';
ALTER TABLE acuerdos ADD COLUMN IF NOT EXISTS apoyo_nombres text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS acuerdos_apoyo_idx ON acuerdos USING gin (apoyo_claves);
