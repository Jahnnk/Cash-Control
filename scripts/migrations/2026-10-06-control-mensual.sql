-- Tu sistema mensual de control financiero (pedido de Jahnn, 6-oct-2026). Aditiva.

-- La revisión semanal de cada lunes: quién la hizo y cuándo (una por semana, la del lunes en que empieza).
CREATE TABLE IF NOT EXISTS revision_semanal (
  semana date PRIMARY KEY CHECK (extract(isodow FROM semana) = 1),
  revisado_el timestamptz NOT NULL DEFAULT NOW(),
  revisado_por text,
  nota text
);

-- El checklist mensual: lo que marcó el dueño en cada mes.
CREATE TABLE IF NOT EXISTS checklist_mensual (
  mes char(7) NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  item text NOT NULL,
  marcado_el timestamptz NOT NULL DEFAULT NOW(),
  marcado_por text,
  PRIMARY KEY (mes, item)
);

-- Compromisos de pago anotados a mano (lo que el sistema no puede detectar solo).
CREATE TABLE IF NOT EXISTS compromisos_manuales (
  id bigserial PRIMARY KEY,
  business_id int NOT NULL,
  fecha date NOT NULL,
  concepto text NOT NULL,
  monto numeric(12,2) NOT NULL CHECK (monto > 0),
  creado_por text,
  creado_el timestamptz NOT NULL DEFAULT NOW()
);

-- Compromisos detectados que el dueño descartó (categoría|tramo|mes): ese mes no se cuentan.
CREATE TABLE IF NOT EXISTS compromisos_ignorados (
  business_id int NOT NULL,
  clave text NOT NULL,
  creado_por text,
  creado_el timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, clave)
);
