-- Candado de ventas del bono por ticket promedio (desde octubre 2026).
--
-- Decisión de Jahnn tras la reunión de socios del 14-sep-2026:
--   · Para cobrar, las ventas del mes deben cubrir el punto de equilibrio
--     de referencia (todo o nada).
--   · Se elimina el piso de tráfico: el candado de ventas lo cubre.
--
-- Migración ADITIVA: no borra ni modifica filas existentes. Los meses
-- anteriores conservan su piso y quedan sin candado (requiere_equilibrio
-- = false por defecto).

-- 1 · El piso de tráfico puede no existir (NULL = sin piso).
ALTER TABLE incentive_config ALTER COLUMN traffic_floor DROP NOT NULL;

-- 2 · ¿La política de ese mes exige cubrir el punto de equilibrio?
ALTER TABLE incentive_config ADD COLUMN IF NOT EXISTS requiere_equilibrio boolean NOT NULL DEFAULT false;

-- 3 · La meta de ventas CONGELADA de cada mes. Se fija el primer lunes
--     del mes (cuando ya llegó el Excel de Kelly del mes anterior) y no
--     se mueve después: el equipo conoce su meta desde el inicio y nadie
--     se la cambia a mitad de camino.
CREATE TABLE IF NOT EXISTS incentive_sales_targets (
  business_id       integer   NOT NULL,
  month             text      NOT NULL,          -- YYYY-MM
  meta              numeric(12,2) NOT NULL,      -- redondeada hacia arriba a S/100
  meta_exacta       numeric(12,2) NOT NULL,      -- el punto de equilibrio sin redondear
  meses_referencia  text[]    NOT NULL,
  congelado_en      timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, month)
);
