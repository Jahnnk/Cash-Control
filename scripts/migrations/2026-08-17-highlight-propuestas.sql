-- ============================================================
-- Propuestas de Highlight de los administradores
-- Pedido de Jahnn (17-ago-2026)
-- ============================================================
--
-- "Habrán ocasiones en donde cada administrador sugiera algún
--  highlight, quién mejor que ellos que están en la operación diaria
--  para darse cuenta en lo que se debe mejorar."
--
-- POR QUÉ UNA TABLA APARTE Y NO UN ESTADO MÁS EN `highlights`
--
-- `highlights` tiene UNIQUE (business_id, fecha): un solo Highlight por
-- sede y día. Está documentado ahí mismo como "es la regla, no una
-- optimización" — es lo que hace que la tarea del día sea UNA.
--
-- Una propuesta para un día que YA tiene Highlight asignado chocaría
-- contra esa regla. Las dos salidas dentro de la misma tabla eran malas:
--
--   · Aflojar el UNIQUE a un índice parcial → cada consulta que hoy
--     lee "el Highlight de esta sede y día" tendría que acordarse de
--     filtrar las propuestas. El día que una se olvide, el admin ve una
--     propuesta sin aprobar como si fuera su tarea asignada.
--   · Guardar la propuesta en otra fecha "de mentira" → mentirle a los
--     datos para no tocar el esquema.
--
-- Separadas, cada cosa es lo que es: una propuesta es un PEDIDO, y solo
-- se vuelve Highlight cuando dirección la aprueba. La regla de "uno por
-- sede y día" queda intacta y sin excepciones.
-- ============================================================

CREATE TABLE IF NOT EXISTS highlight_propuestas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    integer NOT NULL,

  -- Para qué día la propone el administrador.
  fecha          date    NOT NULL,

  -- Mismo contenido que un Highlight: qué y por qué.
  texto          text    NOT NULL,
  por_que        text,

  -- Quién la propuso (el nombre del administrador de la sesión).
  propuesta_por  text    NOT NULL,

  estado         text    NOT NULL DEFAULT 'pendiente',

  -- La respuesta de dirección (Jahnn o Juani).
  resuelta_por   text,
  resuelta_en    timestamptz,
  -- Por qué se rechazó. Sin esto el admin solo ve un "no" y deja de
  -- proponer; el motivo es lo que hace que la próxima sea mejor.
  motivo         text,
  -- El Highlight que se creó al aprobarla, para poder rastrear el hilo.
  highlight_id   uuid,

  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  -- 'caducada' NO se guarda: se deduce de (pendiente + fecha pasada).
  -- Guardarla obligaría a un proceso que barra la tabla todos los días,
  -- y un estado que depende del reloj mentiría apenas ese proceso falle.
  CONSTRAINT highlight_propuestas_estado_check
    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  CONSTRAINT highlight_propuestas_texto_no_vacio
    CHECK (length(btrim(texto)) > 0)
);

-- Una sola propuesta pendiente por sede y día: el mismo espíritu que la
-- regla de los Highlights. No le impide proponer para el jueves y para
-- el viernes, pero sí mandar tres veces lo mismo para mañana.
CREATE UNIQUE INDEX IF NOT EXISTS highlight_propuestas_una_por_dia
  ON highlight_propuestas (business_id, fecha)
  WHERE estado = 'pendiente';

-- Dirección pide "todo lo pendiente de las 3 sedes"; el admin pide "lo
-- mío, lo último primero".
CREATE INDEX IF NOT EXISTS highlight_propuestas_pendientes_idx
  ON highlight_propuestas (fecha) WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS highlight_propuestas_sede_idx
  ON highlight_propuestas (business_id, creado_en DESC);
