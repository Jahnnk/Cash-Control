-- Recetas revisadas (27-nov-2026): Jahnn revisa las recetas una por una (Atelier y cafeterías), como en Insumos.
-- Aditiva: solo crea la tabla. Una fila = esa receta está revisada; desmarcar = borrar la fila.
CREATE TABLE IF NOT EXISTS recetas_revisadas (
  business_id  integer     NOT NULL,
  ref          text        NOT NULL,
  revisado_el  timestamptz NOT NULL DEFAULT now(),
  revisado_por text,
  PRIMARY KEY (business_id, ref)
);
