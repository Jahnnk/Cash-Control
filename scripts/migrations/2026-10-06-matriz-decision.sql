-- Matriz de decisión del Sistema de Dirección (pedido de Jahnn, 6-oct-2026, capítulo
-- «Convierte números en decisiones»).
--
-- 1. reserva_minima: la plata que una sede no toca (por defecto, 4 semanas de costos fijos,
--    la del libro). Jahnn puede cambiarla por sede en Configuración: en semanas de costos
--    fijos o como un monto fijo en soles (si hay monto, manda el monto).
-- 2. fondos_mutuos_saldo: el saldo de los fondos mutuos de cada sede, que Jahnn anota del
--    estado de cuenta (el sistema solo ve los movimientos de ahorro y rescate, no el saldo
--    ni los intereses). Cuenta como parte de la reserva.
--
-- Migración ADITIVA: dos tablas nuevas. No toca ninguna fila existente.

CREATE TABLE IF NOT EXISTS reserva_minima (
  business_id     int PRIMARY KEY,
  semanas         numeric(5,2) CHECK (semanas IS NULL OR semanas >= 0),
  monto           numeric(12,2) CHECK (monto IS NULL OR monto >= 0),
  actualizado_por text,
  actualizado_el  timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fondos_mutuos_saldo (
  id             bigserial PRIMARY KEY,
  business_id    int NOT NULL,
  fecha          date NOT NULL,
  saldo          numeric(12,2) NOT NULL CHECK (saldo >= 0),
  nota           text,
  registrado_por text,
  registrado_el  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, fecha)
);
