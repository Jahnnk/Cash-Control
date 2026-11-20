-- Proveedores y precios por sede (Jahnn, 20-nov-2026).
-- Una sola lista para las 3 sedes (cada proveedor marca qué sedes le compran). Los técnicos (electricista,
-- gasfitero) también van aquí, con tipo = 'tecnico'. Los precios se comparan por producto y por unidad.
-- Solo crea 3 tablas nuevas: no toca ni borra datos de otras tablas. Idempotente.
CREATE TABLE IF NOT EXISTS proveedores (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'proveedor' CHECK (tipo IN ('proveedor','tecnico')),
  rubro text NOT NULL,
  contacto text,
  telefono text,
  telefono2 text,
  email text,
  direccion text,
  ciudad text,
  notas text,
  -- business_id de las sedes que le compran (1 Atelier, 2 Fonavi, 3 Centro).
  sedes int[] NOT NULL DEFAULT '{1,2,3}',
  costo_envio numeric(10,2),
  pedido_minimo numeric(10,2),
  activo boolean NOT NULL DEFAULT true,
  creado_por text NOT NULL,
  creado_el timestamptz NOT NULL DEFAULT now(),
  actualizado_por text,
  actualizado_el timestamptz
);
CREATE TABLE IF NOT EXISTS proveedor_productos (
  id serial PRIMARY KEY,
  nombre text NOT NULL,
  -- La unidad con la que se compara el precio: hoja, unidad, kg, litro…
  unidad text NOT NULL,
  rubro text,
  activo boolean NOT NULL DEFAULT true,
  creado_por text NOT NULL,
  creado_el timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proveedor_productos_nombre_unidad ON proveedor_productos (lower(nombre), lower(unidad)) WHERE activo;
-- Cada precio es una fila nueva: el vigente es el último; los anteriores son el historial.
CREATE TABLE IF NOT EXISTS proveedor_precios (
  id serial PRIMARY KEY,
  proveedor_id int NOT NULL REFERENCES proveedores(id),
  producto_id int NOT NULL REFERENCES proveedor_productos(id),
  presentacion text NOT NULL,
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  precio numeric(10,2) NOT NULL CHECK (precio >= 0),
  fecha date NOT NULL,
  nota text,
  sede_id int,
  registrado_por text NOT NULL,
  creado_el timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proveedor_precios_prov_prod ON proveedor_precios (proveedor_id, producto_id, fecha DESC)
