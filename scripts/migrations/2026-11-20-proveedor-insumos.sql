-- Conecta los productos de Proveedores con los insumos de Recetas y costos (Jahnn, 20-nov-2026).
-- Un producto puede ser un insumo de Atelier y/o uno de las cafeterías (un insumo por origen).
-- `factor` convierte el precio por unidad del producto al precio por unidad del insumo (ej. g → kg = 1000).
-- Solo crea una tabla nueva: no toca precios de insumos ni recetas. Idempotente.
CREATE TABLE IF NOT EXISTS proveedor_producto_insumos (
  producto_id int NOT NULL REFERENCES proveedor_productos(id),
  origen text NOT NULL CHECK (origen IN ('Atelier','Cafetería')),
  sku text NOT NULL,
  factor numeric(12,6) NOT NULL CHECK (factor > 0),
  creado_por text NOT NULL,
  creado_el timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, origen)
)
