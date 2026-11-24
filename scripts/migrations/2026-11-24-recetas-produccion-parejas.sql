-- Parejas Producción ↔ Cash Control — Etapa 3c parte 2, 24-nov-2026.
--
-- QUÉ ES: Producción es la dueña de los ingredientes de las recetas de Atelier y Cash Control pone los precios.
-- Los nombres no coinciden entre las dos apps, así que aquí se guarda, una sola vez, con qué va cada cosa:
--   · tipo 'insumo': un insumo de Producción (prod_clave = su id) ↔ un insumo o preparación de Cash Control.
--     factor = unidades de Cash Control por 1 unidad interna de Producción (g → kg = 0.001; unidad → und = 1).
--   · tipo 'receta': una receta o formato de pan de Producción (prod_clave = «receta» o «receta-formato») ↔ un
--     producto o preparación del Excel. factor = unidades de Producción por 1 unidad del Excel (1 bandeja de
--     focaccia = 4 cuartos → 0.25; paquete de 5 panes → 5).
--   · cc_ref NULL = «sin pareja» a propósito (no sugerir nada).
-- Solo CREA una tabla nueva. Idempotente.

CREATE TABLE IF NOT EXISTS recetas_produccion_parejas (
  tipo            text NOT NULL CHECK (tipo IN ('insumo', 'receta')),
  prod_clave      text NOT NULL,
  prod_nombre     text NOT NULL,
  cc_ref          text,
  factor          numeric(14, 6) NOT NULL DEFAULT 1 CHECK (factor > 0),
  actualizado_por text NOT NULL,
  actualizado_el  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, prod_clave)
);
