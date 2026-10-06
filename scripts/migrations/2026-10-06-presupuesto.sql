-- Presupuesto por sede y mes (pedido de Jahnn, 6-oct-2026, capítulo «El presupuesto»).
-- Aditiva: dos tablas nuevas. La tabla vieja `budgets` no se toca (la siguen leyendo reportes).

-- Cabecera del mes de cada sede: la venta esperada (base de los %) y la aprobación.
CREATE TABLE IF NOT EXISTS presupuesto_mes (
  business_id     int  NOT NULL,
  mes             char(7) NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  venta_esperada  numeric(12,2) CHECK (venta_esperada IS NULL OR venta_esperada >= 0),
  aprobado_el     timestamptz,
  aprobado_por    text,
  actualizado_el  timestamptz NOT NULL DEFAULT NOW(),
  actualizado_por text,
  PRIMARY KEY (business_id, mes)
);

-- Una línea por categoría: en soles (fijos) o en % de la venta (variables).
CREATE TABLE IF NOT EXISTS presupuesto_linea (
  business_id     int  NOT NULL,
  mes             char(7) NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  categoria       text NOT NULL,
  modo            text NOT NULL CHECK (modo IN ('soles', 'pct')),
  valor           numeric(12,2) NOT NULL CHECK (valor >= 0 AND (modo = 'soles' OR valor <= 100)),
  actualizado_el  timestamptz NOT NULL DEFAULT NOW(),
  actualizado_por text,
  PRIMARY KEY (business_id, mes, categoria)
);
