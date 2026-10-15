-- Ajustes de Profit First y de la regla 33-33-33 (pedido de Jahnn, 15-oct-2026).
--
-- Una sola fila (id = 1) con lo que el CEO puede cambiar en Reportes → Profit First:
--   · utilidad_pct       % de la venta que se aparta para utilidades (por defecto 25).
--   · ebitda_pct         EBITDA objetivo, % de la venta (por defecto 33.33 = un tercio).
--   · socios_de_utilidad false = el sueldo de los socios sigue dentro de la planilla (hoy);
--                        true  = sale del EBITDA y se paga de la utilidad (el modelo del coach).
--
-- Migración ADITIVA: una tabla nueva y vacía. No toca ninguna fila existente. Sin la fila, la app
-- usa los valores por defecto de arriba; el código tolera que la tabla todavía no exista.

CREATE TABLE IF NOT EXISTS profit_first_config (
  id                smallint PRIMARY KEY CHECK (id = 1),
  utilidad_pct      numeric(5,2) NOT NULL DEFAULT 25    CHECK (utilidad_pct > 0 AND utilidad_pct <= 60),
  ebitda_pct        numeric(5,2) NOT NULL DEFAULT 33.33 CHECK (ebitda_pct > 0 AND ebitda_pct <= 80),
  socios_de_utilidad boolean     NOT NULL DEFAULT false,
  actualizado_por   text,
  actualizado_el    timestamptz NOT NULL DEFAULT NOW(),
  CHECK (utilidad_pct <= ebitda_pct)
);
