-- Decisiones sobre "Sacar de carta" (Grupo → Productos → Candidatos a reemplazo).
--
-- Pedido de Jahnn (24-sep-2026): programar la salida de un producto (fecha y
-- reemplazo), mantenerlo con un motivo (sale de la lista por 3 meses) y, al
-- archivarlo, guardar con qué se reemplazó para comparar después si el
-- reemplazo vende mejor.
--
-- Migración ADITIVA: una tabla nueva y dos columnas opcionales en los
-- archivados. No cambia ninguna fila existente.

CREATE TABLE IF NOT EXISTS decisiones_carta (
  clave         text PRIMARY KEY,
  nombre        text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('programar', 'mantener')),
  motivo        text,
  fecha_salida  date,
  reemplazo     text,
  hasta         date,
  decidido_por  text,
  decidido_el   timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE productos_archivados ADD COLUMN IF NOT EXISTS reemplazo text;
ALTER TABLE productos_archivados ADD COLUMN IF NOT EXISTS venta_dia_al_archivar numeric(12,2);
