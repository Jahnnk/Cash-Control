-- Highlight diario (metodología "Make Time") — pedido de Jahnn, 10-ago-2026.
--
-- LA IDEA: "No se trata de hacer más cosas; se trata de asegurarte de
-- hacer las cosas que más importan" (Jake Knapp / John Zeratsky).
-- Cada día Jahnn le asigna a cada sede UNA sola actividad prioritaria.
-- El administrador la ve apenas entra a su panel, la cumple, y al
-- cerrarla hace un Reflect de 4 preguntas (mejora continua).
--
-- POR QUÉ UNA FILA POR SEDE Y DÍA: el Highlight es UNO. La restricción
-- UNIQUE(business_id, fecha) es la regla de negocio hecha schema — si
-- se pudieran cargar dos, dejaría de ser "lo más importante del día".
--
-- CICLO DE VIDA:
--   pendiente  → lo asignó Jahnn, el admin aún no lo cierra
--   logrado    → el admin dice que lo cumplió
--   no_logrado → el admin dice que no pudo (NO es un castigo: alimenta
--                el Reflect, que es donde está el aprendizaje)
--
-- El Reflect se guarda en la misma fila y no en tabla aparte a propósito:
-- una reflexión SIN su Highlight no significa nada, y así no hay forma
-- de que queden huérfanas o desparejadas.

CREATE TABLE IF NOT EXISTS highlights (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    integer NOT NULL,
  fecha          date    NOT NULL,

  -- Lo que Jahnn asigna
  texto          text    NOT NULL,
  por_que        text,                       -- por qué importa HOY (opcional)
  asignado_por   text,                       -- 'Jahnn' | 'Kelly'

  -- Lo que responde el administrador
  estado         text    NOT NULL DEFAULT 'pendiente',
  cerrado_en     timestamptz,

  -- Reflect (mejora continua). Las 3 preguntas abiertas; la cuarta
  -- ("¿logré mi Highlight?") ES `estado`, no se guarda dos veces.
  reflect_ayudo    text,
  reflect_distrajo text,
  reflect_manana   text,
  reflect_en       timestamptz,

  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT highlights_estado_check
    CHECK (estado IN ('pendiente', 'logrado', 'no_logrado')),
  CONSTRAINT highlights_texto_no_vacio
    CHECK (length(btrim(texto)) > 0),

  -- Un solo Highlight por sede y día. Es la regla, no una optimización.
  UNIQUE (business_id, fecha)
);

-- El panel del admin siempre pide "mi sede, hoy"; Jahnn pide "las 3
-- sedes, este día" y el historial reciente hacia atrás.
CREATE INDEX IF NOT EXISTS highlights_sede_fecha_idx
  ON highlights (business_id, fecha DESC);

CREATE INDEX IF NOT EXISTS highlights_fecha_idx
  ON highlights (fecha DESC);
