-- Acuerdos y tareas (fase 1) — pedido de Jahnn, 19-nov-2026.
--
-- QUÉ ES: un solo lugar para los acuerdos de las reuniones (marketing, administración, operaciones,
-- finanzas, calidad) y las tareas del día a día. Cada uno con responsable, fecha límite y seguimiento.
-- Complementa al Highlight (una sola tarea por sede y semana), no lo reemplaza. Reglas en src/lib/acuerdos.ts.
--
-- Solo CREA tablas nuevas y agrega el rol «equipo» a app_users (coordinadora de marketing, socias):
-- no cambia ni borra datos existentes. Idempotente.

CREATE TABLE IF NOT EXISTS reuniones (
  id               serial PRIMARY KEY,
  fecha            date NOT NULL,
  area             text NOT NULL CHECK (area IN ('marketing','administracion','operaciones','finanzas','calidad')),
  titulo           text NOT NULL,
  asistentes       text,
  notas            text,
  creado_por       text NOT NULL,          -- nombre visible de quien la registró
  creado_por_clave text NOT NULL,          -- «jahnn», «kelly» o «u:<id de app_users>»
  creado_el        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acuerdos (
  id                    serial PRIMARY KEY,
  reunion_id            int REFERENCES reuniones(id) ON DELETE SET NULL,  -- null = tarea del día a día
  que                   text NOT NULL,
  detalle               text,
  area                  text NOT NULL CHECK (area IN ('marketing','administracion','operaciones','finanzas','calidad')),
  responsable_clave     text NOT NULL,
  responsable_nombre    text NOT NULL,
  fecha_limite          date NOT NULL,
  fecha_limite_original date NOT NULL,      -- la primera fecha: mover la fecha deja rastro
  -- «vencido» NO se guarda: lo calcula el sistema con la fecha límite.
  estado                text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','en_proceso','por_confirmar','cumplido','anulado')),
  tarde                 boolean NOT NULL DEFAULT false,  -- pegajoso: una vez tarde, tarde
  marcado_cumplido_el   timestamptz,        -- cuándo lo marcó el responsable (decide «a tiempo»)
  confirmado_el         timestamptz,
  confirmado_por        text,
  creado_por            text NOT NULL,
  creado_por_clave      text NOT NULL,
  creado_el             timestamptz NOT NULL DEFAULT now(),
  actualizado_el        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS acuerdos_responsable_idx ON acuerdos (responsable_clave, estado);
CREATE INDEX IF NOT EXISTS acuerdos_fecha_idx ON acuerdos (fecha_limite);
CREATE INDEX IF NOT EXISTS acuerdos_reunion_idx ON acuerdos (reunion_id);

-- Historial: cada cambio de estado, de fecha, de responsable, devoluciones y comentarios.
CREATE TABLE IF NOT EXISTS acuerdo_eventos (
  id         serial PRIMARY KEY,
  acuerdo_id int NOT NULL REFERENCES acuerdos(id) ON DELETE CASCADE,
  cuando     timestamptz NOT NULL DEFAULT now(),
  quien      text NOT NULL,
  tipo       text NOT NULL,   -- estado | fecha | responsable | editado | devuelto | confirmado | anulado | comentario
  detalle    text
);
CREATE INDEX IF NOT EXISTS acuerdo_eventos_acuerdo_idx ON acuerdo_eventos (acuerdo_id, cuando);

-- Rol nuevo «equipo»: ve todos los acuerdos, crea y asigna; sin acceso financiero.
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_scope_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_scope_check
  CHECK (scope = ANY (ARRAY[
    'admin-atelier', 'admin-fonavi', 'admin-centro',
    'verif-fonavi', 'verif-centro',
    'highlight',
    'lector',
    'equipo'
  ]::text[]));
