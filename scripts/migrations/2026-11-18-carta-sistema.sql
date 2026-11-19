-- La carta vive en el sistema · fase 2 (pedido de Jahnn, 18-nov-2026).
-- Cambios de la carta hechos en el sistema (precio de carta, precio interno de Atelier, sección y, en la
-- fase 2b, productos nuevos con su receta). Ganan sobre el Excel de pricing, también después de subir otro:
-- costos_carta se borra y se reescribe en cada subida, esta tabla no. Migración ADITIVA: no toca datos.
CREATE TABLE IF NOT EXISTS carta_sistema (
  ref             text PRIMARY KEY,         -- ref del Excel que se cambia (CF-011, AT-046…) o la de un producto nuevo
  nombre          text,                     -- null = el del Excel
  nombre_carta    text,
  seccion         text,                     -- null = la del Excel
  origen          text,                     -- 'Cafetería', 'Atelier', 'Externo'
  categoria       text,
  precio          numeric,                  -- precio de carta (S/); null = el del Excel
  costo           numeric,                  -- Atelier/Externo: precio interno o de compra (S/); null = el del Excel
  receta          jsonb,                    -- fase 2b: receta de cafetería
  nuevo           boolean NOT NULL DEFAULT false,
  actualizado_el  timestamptz NOT NULL DEFAULT now()
);
