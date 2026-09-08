-- Horas TRABAJADAS por persona y por mes, copiadas de Planilla.
--
-- Por qué una tabla nueva y no una columna en `staff`: las horas de
-- contrato son un atributo de la persona (una sola, vigente hoy), pero
-- las trabajadas son un hecho de CADA MES. Guardarlas en `staff` haría
-- que reabrir la liquidación de un mes viejo la recalculara con las
-- horas del mes actual — el mismo error que ya tapamos con el candado
-- de vigencia del bono por horas.
--
-- Por qué se copia y no se lee Planilla en vivo: son dos bases Neon
-- distintas y el plan gratuito cuenta horas de compute. Mismo criterio
-- que el roster (ver src/app/actions/roster-sync.ts).
--
-- Decisión de Jahnn, 8-sep-2026.

CREATE TABLE IF NOT EXISTS staff_month_hours (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   integer NOT NULL,
  -- DNI y no staff_id: es la llave que Planilla y Cash Control comparten,
  -- y sobrevive a que alguien se dé de baja y vuelva (fila nueva en staff,
  -- mismo DNI). Ver `planificarSync`.
  dni           text    NOT NULL,
  month         text    NOT NULL,          -- YYYY-MM
  horas         numeric(7,2) NOT NULL,     -- horas trabajadas en el mes
  horas_extra   numeric(7,2) NOT NULL DEFAULT 0,
  sincronizado_en timestamp NOT NULL DEFAULT now(),
  UNIQUE (business_id, dni, month)
);

CREATE INDEX IF NOT EXISTS staff_month_hours_lookup
  ON staff_month_hours (business_id, month);
