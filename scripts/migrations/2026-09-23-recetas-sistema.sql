-- Recetas creadas o modificadas en el sistema (Grupo → Recetas).
--
-- Pedido de Jahnn (23-sep-2026): "si agregamos una nueva receta o sub receta
-- o modificamos alguna existente, que no tenga que subir el Excel completo
-- solo por una receta". Caso que lo motivó: la masa del Pie de Manzana no
-- existía como sub-receta y Luis no la podía registrar en mermas.
--
-- Una receta guarda solo sus ingredientes (ítems de la lista de costos +
-- cantidad); el costo se calcula con los precios vigentes (lib/recetas.ts).
-- Si reemplaza a un ítem del Excel (reemplaza_ref), gana la del sistema
-- también después de subir un Excel nuevo (decisión de Jahnn).
--
-- Migración ADITIVA: una tabla nueva y una columna opcional en la lista de
-- costos (la receta del Excel detrás de cada costo, para poder abrirla).

ALTER TABLE costos_preparaciones ADD COLUMN IF NOT EXISTS detalle jsonb;

CREATE TABLE IF NOT EXISTS recetas_sistema (
  id              serial PRIMARY KEY,
  business_id     integer NOT NULL,
  nombre          text NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('producto', 'preparacion')),
  categoria       text,
  detalle         jsonb NOT NULL,
  reemplaza_ref   text,
  actualizado_por text,
  creado_el       timestamptz NOT NULL DEFAULT NOW(),
  actualizado_el  timestamptz NOT NULL DEFAULT NOW()
);

-- Un ítem del Excel se reemplaza una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS recetas_sistema_reemplaza_uq
  ON recetas_sistema (business_id, reemplaza_ref) WHERE reemplaza_ref IS NOT NULL;
