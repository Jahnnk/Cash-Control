-- Recetas archivadas (pedido de Jahnn, 26-nov-2026): en Grupo → Recetas y costos las recetas que ya no se usan
-- (un producto que salió de la carta y no se vende) pasan a la categoría «Archivados». Siguen costeando (mermas y
-- recetas que las usan no cambian): solo dejan de verse en la lista principal.
--
-- Migración ADITIVA: una tabla nueva. ref = la del ítem en la lista de costos (AT-…, SUB:…, REC:n);
-- business_id 1 = Atelier, 2 = cafeterías.

CREATE TABLE IF NOT EXISTS recetas_archivadas (
  business_id    integer NOT NULL,
  ref            text NOT NULL,
  archivada_por  text,
  archivada_el   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, ref)
);
