-- Financiamientos que se pagan mes a mes (pedido de Jahnn, 9-nov-2026). Aditiva: solo CREA una tabla nueva y 4 filas.
-- Una fila = una deuda de UNA sede. Lo que no se sabe todavía queda en NULL y la pantalla lo marca «falta dato».
CREATE TABLE IF NOT EXISTS financiamientos (
  id serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id),
  nombre text NOT NULL,
  -- Quién dio la plata (banco, tarjeta, socio, familiar, proveedor…). Texto libre.
  acreedor text,
  -- Palabra(s) que aparecen en el concepto de sus pagos del Excel (expresión regular, sin mayúsculas). Ej: diners
  patron text,
  -- Día del mes en que suele pagarse y monto de la cuota: para reconocer pagos cuyo concepto no dice el nombre.
  dia_pago integer CHECK (dia_pago IS NULL OR dia_pago BETWEEN 1 AND 31),
  cuota numeric(12,2) CHECK (cuota IS NULL OR cuota > 0),
  monto_original numeric(12,2) CHECK (monto_original IS NULL OR monto_original > 0),
  cuotas_total integer CHECK (cuotas_total IS NULL OR cuotas_total > 0),
  -- Si la cuota incluye intereses (true), el monto devuelto no es solo capital. NULL = no sabemos.
  incluye_intereses boolean,
  -- Solo cuentan pagos desde esta fecha (por defecto, todos).
  desde date,
  activo boolean NOT NULL DEFAULT true,
  nota text,
  creado_el timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, nombre)
);
INSERT INTO financiamientos (business_id, nombre, acreedor, patron, dia_pago, cuota, nota) VALUES
  (1, 'Préstamo Diners', 'Diners Club', 'diners', 8, 1595.89, 'Datos de Kelly pendientes: monto original, cuotas y fin.'),
  (2, 'Préstamo Diners', 'Diners Club', 'diners', 8, 411.60, 'Datos de Kelly pendientes: monto original, cuotas y fin.'),
  (1, 'Deuda antigua', NULL, NULL, 16, 750, 'Datos de Kelly pendientes: a quién se debe, total y cuotas.'),
  (2, 'Deuda antigua', NULL, NULL, 16, 750, 'Datos de Kelly pendientes: a quién se debe, total y cuotas.'),
  (2, 'Congeladora', NULL, 'congeladora', 4, 652.50, 'Datos de Kelly pendientes: cuotas y si se pagó la 2da.')
ON CONFLICT (business_id, nombre) DO NOTHING;
