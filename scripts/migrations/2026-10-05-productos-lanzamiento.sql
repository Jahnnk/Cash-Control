-- Fecha exacta de lanzamiento de los productos nuevos (Grupo → Productos).
--
-- Pedido de Jahnn (5-oct-2026): un producto nuevo tiene 3 meses de prueba antes de
-- juzgarlo y un ritmo muy bueno se destaca desde las 2 semanas. Los reportes de
-- rotación son mensuales, así que el día en que salió a la venta solo se estimaba
-- (el 15 del primer mes con ventas). Con la fecha exacta anotada, los 90 días y los
-- 14 días son exactos (ver pruebaDe en lib/productos/candidatos.ts).
--
-- La clave es el nombre normalizado del producto de Byte (claveByte): junta las
-- variantes "PROMO MOSTRADOR", con o sin tilde, etc. Una fecha por producto: la carta
-- de Fonavi y Centro es la misma.
--
-- Migración ADITIVA: una tabla nueva. No toca ninguna fila existente.

CREATE TABLE IF NOT EXISTS productos_lanzamiento (
  clave          text PRIMARY KEY,
  nombre         text NOT NULL,
  fecha          date NOT NULL,
  registrado_por text,
  registrado_el  timestamptz NOT NULL DEFAULT NOW()
);
