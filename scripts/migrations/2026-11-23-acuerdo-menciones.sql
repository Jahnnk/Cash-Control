-- Menciones (@) en los comentarios de Acuerdos y tareas — pedido de Jahnn, 23-nov-2026.
--
-- QUÉ ES: cuando un comentario menciona a alguien con «@», se guarda aquí. La persona ve «Te mencionaron»
-- en su Panel de Sede y en Grupo → Acuerdos y tareas hasta que abre la tarea (visto_el). La mención también
-- le deja leer y responder esa tarea. Solo CREA una tabla nueva: no cambia datos existentes. Idempotente.

CREATE TABLE IF NOT EXISTS acuerdo_menciones (
  id          serial PRIMARY KEY,
  acuerdo_id  int NOT NULL REFERENCES acuerdos(id) ON DELETE CASCADE,
  evento_id   int REFERENCES acuerdo_eventos(id) ON DELETE CASCADE,  -- el comentario
  clave       text NOT NULL,          -- a quién: «jahnn», «kelly» o «u:<id>»
  nombre      text NOT NULL,
  por         text NOT NULL,          -- quién mencionó (nombre visible)
  creado_el   timestamptz NOT NULL DEFAULT now(),
  visto_el    timestamptz
);
CREATE INDEX IF NOT EXISTS acuerdo_menciones_pendientes_idx ON acuerdo_menciones (clave) WHERE visto_el IS NULL;
CREATE INDEX IF NOT EXISTS acuerdo_menciones_acuerdo_idx ON acuerdo_menciones (acuerdo_id, clave);
