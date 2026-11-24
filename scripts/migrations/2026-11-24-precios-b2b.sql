-- Precio B2B de los productos de Atelier — fase A de «recetas y precios en el sistema», 24-nov-2026.
--
-- QUÉ ES: el precio al que Atelier vende un producto a clientes B2B (no a las cafeterías). Hasta hoy solo
-- vivía en el Excel de pricing (hoja PRICING, columna K). Aquí se guarda el que se pone en el sistema al
-- crear una receta nueva. ref = la ref del producto (REC:<id> para recetas del sistema, AT-… del Excel).
-- El precio interno (a las cafeterías) sigue en carta_sistema.costo: no se duplica.
-- Solo CREA una tabla nueva. Idempotente.

CREATE TABLE IF NOT EXISTS precios_b2b (
  ref             text PRIMARY KEY,
  precio          numeric(12, 2) NOT NULL CHECK (precio > 0),
  actualizado_por text NOT NULL,
  actualizado_el  timestamptz NOT NULL DEFAULT now()
);
