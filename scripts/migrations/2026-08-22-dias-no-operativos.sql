-- ============================================================
-- Días no operativos: los que NO cuentan para la meta del equipo
-- Pedido de Jahnn (22-ago-2026)
-- ============================================================
--
-- "Hoy por un problema eléctrico no hubo atención en Centro… yo debería
--  poder pausar ese día para que no les cuente y baje el ticket
--  promedio… que las sedes no se perjudiquen por situaciones que
--  escapan a la responsabilidad de los colaboradores."
--
-- QUÉ RESUELVE (y qué ya estaba resuelto)
--
-- El motor de incentivos ya filtraba los días con 0 personas y 0 venta,
-- así que un día CERRADO no bajaba el ticket. Lo que faltaba:
--
--   1. Ese día quedaba en rojo como "KPI sin registrar", sin poder
--      distinguir "no abrimos" de "se les olvidó".
--   2. El día PARCIAL sí arrastraba el promedio: si abren y cierran a
--      media tarde hay venta y hay personas, y el día entra al cálculo.
--   3. La proyección del pozo repartía sobre todos los días del mes,
--      incluido el cerrado.
--
-- POR QUÉ TABLA APARTE Y NO UNA COLUMNA EN upselling_daily
--
-- Un día puede no tener NINGUNA fila en upselling_daily (no abrieron,
-- nadie registró nada) y aun así hay que poder marcarlo. Con una
-- columna habría que inventar una fila vacía solo para poner la marca,
-- y esa fila fantasma se colaría en los conteos de "días registrados".
--
-- EL MOTIVO ES OBLIGATORIO (CHECK abajo)
--
-- Un día excluido sin explicación es justo lo que haría dudar del bono
-- dentro de tres meses. Con motivo, la exclusión se puede auditar.
--
-- QUIÉN PUEDE MARCARLO: solo dirección, nunca el administrador — esto
-- mueve dinero, y quien cobra el bono no puede borrar sus propios días
-- flojos. Eso se hace cumplir en la action, no acá.
--
-- RIESGO: ninguno para los datos existentes. Tabla nueva y vacía; no
-- toca upselling_daily ni ninguna otra.
-- ============================================================

CREATE TABLE IF NOT EXISTS dias_no_operativos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  integer NOT NULL,
  fecha        date    NOT NULL,

  -- Por qué no cuenta: "Corte de luz", "Feriado", "Local cerrado por
  -- mantenimiento". Obligatorio a propósito.
  motivo       text    NOT NULL,

  -- Quién lo marcó (Jahnn / Kelly). Para poder responder "¿y esto quién
  -- lo sacó?" sin adivinar.
  marcado_por  text    NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dias_no_operativos_motivo_no_vacio
    CHECK (length(btrim(motivo)) > 0),

  -- Un día se pausa una sola vez por sede. Volver a marcarlo actualiza
  -- el motivo en vez de duplicar.
  UNIQUE (business_id, fecha)
);

-- El panel pregunta "los días pausados de esta sede en este rango".
CREATE INDEX IF NOT EXISTS dias_no_operativos_sede_fecha_idx
  ON dias_no_operativos (business_id, fecha DESC);
