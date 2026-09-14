-- Supervisiones de Juani — tercer requisito del bono (desde octubre 2026).
--
-- Decisiones de Jahnn (14-sep-2026), después de la reunión de socios:
--   · Juani revisa con una LISTA FIJA de puntos, igual para las sedes.
--   · Cada "no cumple" es una OBSERVACIÓN con plazo fijo por gravedad:
--     crítica 24 h, normal 7 días.
--   · El administrador sube la foto de la corrección; Juani confirma.
--   · Requisito del bono: todas las CRÍTICAS del mes corregidas a tiempo.
--   · Un mes sin visita no bloquea el bono.
-- La lógica vive en src/lib/supervisiones.ts; acá solo se guarda.
--
-- Migración ADITIVA: tablas nuevas, una columna nueva con default false
-- y la lista inicial de puntos. Lo único que toca filas existentes es el
-- paso 6, que activa el requisito SOLO en la política de octubre 2026 de
-- Fonavi y Centro (filas creadas el 14-sep, respaldadas).
-- Las fotos van en la tabla `attachments` que ya existe (record_type
-- 'supervision_problema' / 'supervision_correccion'): no hace falta tabla.

-- 1 · La lista de puntos que revisa Juani (editable desde la app).
CREATE TABLE IF NOT EXISTS supervision_items (
  id           serial PRIMARY KEY,
  nombre       text    NOT NULL,
  descripcion  text,
  -- La gravedad con la que nace la observación si el punto no se cumple.
  gravedad     text    NOT NULL,
  orden        integer NOT NULL DEFAULT 0,
  -- Desactivar en vez de borrar: las visitas viejas siguen apuntando acá.
  activo       boolean NOT NULL DEFAULT true,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervision_items_gravedad_check CHECK (gravedad IN ('critica', 'normal')),
  CONSTRAINT supervision_items_nombre_no_vacio CHECK (length(btrim(nombre)) > 0)
);

-- 2 · Cada visita de Juani a una sede.
CREATE TABLE IF NOT EXISTS supervision_visits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       integer NOT NULL,
  fecha             date    NOT NULL,       -- día de la visita: define el mes
  registrada_por    text    NOT NULL,
  notas             text,
  -- Guardados al registrar: el puntaje de una visita no cambia si después
  -- se edita la lista.
  puntos_evaluados  integer NOT NULL,
  puntos_cumplidos  integer NOT NULL,
  registrada_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supervision_visits_sede_fecha_idx
  ON supervision_visits (business_id, fecha DESC);

-- 3 · El resultado de cada punto en cada visita (con el nombre copiado:
--     la visita cuenta lo que se revisó ESE día, aunque el punto cambie).
CREATE TABLE IF NOT EXISTS supervision_results (
  visit_id     uuid    NOT NULL REFERENCES supervision_visits(id) ON DELETE CASCADE,
  item_id      integer NOT NULL REFERENCES supervision_items(id),
  item_nombre  text    NOT NULL,
  resultado    text    NOT NULL,
  PRIMARY KEY (visit_id, item_id),
  CONSTRAINT supervision_results_resultado_check CHECK (resultado IN ('cumple', 'no_cumple', 'no_aplica'))
);

-- 4 · Las observaciones: lo que hay que corregir, con su plazo.
CREATE TABLE IF NOT EXISTS supervision_observations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id            integer NOT NULL,
  visit_id               uuid    NOT NULL REFERENCES supervision_visits(id) ON DELETE CASCADE,
  item_id                integer REFERENCES supervision_items(id),   -- null = observación libre
  titulo                 text    NOT NULL,
  detalle                text,
  gravedad               text    NOT NULL,
  creada_en              timestamptz NOT NULL DEFAULT now(),
  plazo_hasta            timestamptz NOT NULL,
  estado                 text    NOT NULL DEFAULT 'abierta',
  -- Lo que hace el administrador
  corregida_en           timestamptz,
  corregida_por          text,
  comentario_correccion  text,
  -- Lo que hace Juani
  confirmada_en          timestamptz,
  confirmada_por         text,
  rechazos               integer NOT NULL DEFAULT 0,
  ultimo_rechazo         text,
  -- Desde cuándo cuenta la foto de corrección: tras un rechazo, la foto
  -- vieja ya no sirve para volver a marcarla corregida.
  rechazada_en           timestamptz,
  -- Una corrección llegó tarde alguna vez: un rechazo (con plazo nuevo)
  -- no puede lavar ese atraso. Ver src/lib/supervisiones.ts.
  vencida_alguna_vez     boolean NOT NULL DEFAULT false,
  CONSTRAINT supervision_obs_gravedad_check CHECK (gravedad IN ('critica', 'normal')),
  CONSTRAINT supervision_obs_estado_check CHECK (estado IN ('abierta', 'corregida', 'confirmada')),
  CONSTRAINT supervision_obs_titulo_no_vacio CHECK (length(btrim(titulo)) > 0)
);
CREATE INDEX IF NOT EXISTS supervision_obs_sede_estado_idx
  ON supervision_observations (business_id, estado);
CREATE INDEX IF NOT EXISTS supervision_obs_visita_idx
  ON supervision_observations (visit_id);

-- 5 · ¿La política de ese mes exige pasar las supervisiones?
ALTER TABLE incentive_config ADD COLUMN IF NOT EXISTS requiere_supervision boolean NOT NULL DEFAULT false;

-- 6 · Activarlo en la política de octubre 2026 (Fonavi y Centro).
UPDATE incentive_config SET requiere_supervision = true
 WHERE business_id IN (2, 3) AND effective_month = '2026-10';

-- 7 · Lista inicial de puntos (borrador para que Juani la ajuste).
--     Solo si la tabla está vacía: correr la migración dos veces no duplica.
INSERT INTO supervision_items (nombre, descripcion, gravedad, orden)
SELECT v.nombre, v.descripcion, v.gravedad, v.orden
FROM (VALUES
  ('Alimentos rotulados y bien conservados', 'Fecha de preparación visible, cadena de frío, nada vencido.', 'critica', 1),
  ('Cocina y zona de preparación limpias', 'Superficies, utensilios y pisos limpios; basura tapada.', 'critica', 2),
  ('Baños limpios y abastecidos', 'Papel, jabón y papelera; sin olores.', 'critica', 3),
  ('Higiene y uniforme del personal', 'Uniforme completo, cabello recogido, manos y uñas limpias.', 'critica', 4),
  ('Vitrina completa y ordenada', 'Productos del día exhibidos, precios visibles, sin espacios vacíos.', 'normal', 5),
  ('Salón y mesas limpios', 'Mesas limpias y ordenadas, sillas en su lugar.', 'normal', 6),
  ('Atención y ofrecimiento', 'Saludo, recomendación de un producto adicional, despedida.', 'normal', 7),
  ('Caja y zona de cobro ordenadas', 'Mostrador despejado, medios de pago a la vista.', 'normal', 8),
  ('Ambiente del local', 'Música, iluminación y temperatura adecuadas.', 'normal', 9),
  ('Fachada y entrada limpias', 'Vereda, letrero y puerta limpios.', 'normal', 10)
) AS v(nombre, descripcion, gravedad, orden)
WHERE NOT EXISTS (SELECT 1 FROM supervision_items);
