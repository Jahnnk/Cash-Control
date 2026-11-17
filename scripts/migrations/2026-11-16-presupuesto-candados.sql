-- Candados del presupuesto (16-nov-2026).
--
-- Pedido de Jahnn: hay costos que no se pueden bajar (el alquiler va por contrato; los sueldos no se rebajan).
-- Las palancas del EBITDA (Dashboard → sección 4) no deben proponer recortarlos. Cada fila dice si una categoría de
-- una sede tiene candado. Sin fila manda el valor por defecto de lib/candados.ts (ALQUILER y PLANILLA con candado).
--
-- Migración ADITIVA: una tabla nueva, vacía. No toca ninguna tabla existente. Sin esta tabla la app usa los
-- candados por defecto y no deja cambiarlos.

CREATE TABLE IF NOT EXISTS presupuesto_candados (
  business_id  integer     NOT NULL,            -- 1 Atelier · 2 Fonavi · 3 Centro
  categoria    text        NOT NULL,            -- nombre de la lista única (ALQUILER, PLANILLA…)
  bloqueado    boolean     NOT NULL,
  cambiado_por text        NOT NULL,
  cambiado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, categoria)
);
