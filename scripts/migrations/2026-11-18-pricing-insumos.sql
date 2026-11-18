-- Simulador de alza de insumos e historial de precios (pedido de Jahnn, 18-nov-2026).
-- Migración ADITIVA: una columna nueva y una tabla nueva; no toca datos existentes.

-- B · El costo de cada producto de la carta repartido por insumo (sub-recetas abiertas).
--     [{ "sku": "AC005", "nombre": "Mantequilla sin sal", "costo": 0.6357 }, …] — S/ por unidad.
ALTER TABLE costos_carta ADD COLUMN IF NOT EXISTS desglose jsonb;

-- C · Una foto del precio de compra de cada insumo cada vez que se sube el Excel de pricing.
CREATE TABLE IF NOT EXISTS insumos_precios (
  fecha       date        NOT NULL,
  origen      text        NOT NULL,  -- 'Atelier' (ATE · Insumos) o 'Cafetería' (CAF · Insumos)
  sku         text        NOT NULL,
  nombre      text        NOT NULL,
  unidad      text        NOT NULL,  -- 'kg', 'l' o 'und'
  precio      numeric     NOT NULL,  -- S/ por kg, litro o unidad
  archivo     text,
  cargado_el  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, origen, sku)
);
