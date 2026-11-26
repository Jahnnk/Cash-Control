-- Proveedor elegido por insumo (pedido de Jahnn, 26-nov-2026).
--
-- Caso: un insumo se compra a un proveedor más caro porque su calidad es mejor. El comparador sugería siempre el
-- más barato; ahora, si el insumo tiene un proveedor
-- elegido, ese manda (su precio es el que se ofrece pasar a Recetas) y queda anotado el motivo.
--
-- Migración ADITIVA: una tabla nueva. Una fila por insumo (origen + SKU); se guarda también en su pareja de la
-- otra lista (Atelier ↔ cafeterías), igual que la conexión con productos de proveedor.

CREATE TABLE IF NOT EXISTS insumo_proveedor_elegido (
  origen        text NOT NULL CHECK (origen IN ('Atelier', 'Cafetería')),
  sku           text NOT NULL,
  proveedor_id  integer NOT NULL REFERENCES proveedores (id),
  motivo        text NOT NULL CHECK (motivo IN ('calidad', 'precio', 'disponibilidad', 'servicio', 'otro')),
  nota          text,
  elegido_por   text,
  elegido_el    timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (origen, sku)
);
