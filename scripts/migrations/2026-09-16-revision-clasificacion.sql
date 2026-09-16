-- Revisión de la clasificación de gastos: "Por definir".
--
-- Pedido de Jahnn (16-sep-2026): cruzar la clasificación de Kelly
-- ("Categorías PE" de su Excel) con la del sistema, y cuando algo no calce
-- o se vea raro, pedirle a él que lo defina. Decisiones de Jahnn:
--   · Su decisión se aplica YA en el sistema, y a Kelly se le arma una
--     lista de correcciones que se cierra sola cuando su Excel las trae.
--   · Se revisan: diferencias por categoría, grupos que nadie tiene
--     clasificados, gastos de S/100+ en el bolsón OTROS/PENDIENTE, gastos
--     de S/300+ que son 5× o más lo normal de su categoría, y grupos que no
--     calzan con la categoría del sistema.
--   · Bandeja en Grupo + aviso al importar (la importación no se frena).
-- La lógica vive en src/lib/revision-clasificacion.ts.
--
-- Migración ADITIVA.

-- 1 · Tipo para el punto de equilibrio decidido para un gasto puntual.
--     NULL = manda la lista de Kelly (o el catálogo).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tipo_pe text;

-- 2 · Huella de un gasto: lo identifica aunque el Excel se vuelva a subir
--     (la importación borra y re-inserta las filas con ids nuevos). Una
--     sola definición, usada por la detección y por la importación.
CREATE OR REPLACE FUNCTION huella_gasto(bid integer, d date, monto numeric, concepto text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(bid::text || '|' || d::text || '|' || to_char(monto, 'FM9999999990.00') || '|' ||
             upper(regexp_replace(btrim(COALESCE(concepto, '')), '\s+', ' ', 'g')))
$$;

-- 3 · El texto de un grupo normalizado (sin tildes, MAYÚSCULAS, espacios
--     simples) — el mismo criterio que normGrupoPE en src/lib/pe-kelly.ts.
CREATE OR REPLACE FUNCTION norm_grupo(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(btrim(translate(COALESCE(t, ''),
    'áéíóúàèìòùäëïöüâêîôûñÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ',
    'aeiouaeiouaeiouaeiounAEIOUAEIOUAEIOUAEIOUN')), '\s+', ' ', 'g'))
$$;

-- 4 · La bandeja.
CREATE TABLE IF NOT EXISTS clasificacion_revisiones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        integer NOT NULL,
  -- 'categoria' (un grupo del Excel con su categoría del sistema) o
  -- 'gasto' (un gasto puntual, identificado por su huella).
  alcance            text    NOT NULL,
  -- Por qué apareció: 'difiere' | 'sin_kelly' | 'sin_sistema' | 'no_calza'
  -- | 'bolson' | 'atipico'.
  motivo             text    NOT NULL,
  clave              text    NOT NULL,
  datos              jsonb   NOT NULL,       -- el contexto para decidir
  estado             text    NOT NULL DEFAULT 'pendiente',
  decision           jsonb,
  decidido_por       text,
  decidido_en        timestamptz,
  -- La decisión contradice el Excel: Kelly tiene que corregirlo.
  kelly_pendiente    boolean NOT NULL DEFAULT false,
  kelly_corregido_en timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clasif_rev_alcance_check CHECK (alcance IN ('categoria', 'gasto')),
  CONSTRAINT clasif_rev_estado_check CHECK (estado IN ('pendiente', 'resuelta')),
  UNIQUE (business_id, alcance, clave)
);
CREATE INDEX IF NOT EXISTS clasif_rev_estado_idx ON clasificacion_revisiones (estado, business_id);
