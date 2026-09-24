-- Seguimiento de "Preparar reemplazo" (Grupo → Productos → Candidatos a reemplazo).
--
-- Pedido de Jahnn (24-sep-2026): que la pestaña diga cuánto falta para
-- decidir (4 semanas desde que el producto entró a la lista) y permita anotar
-- con qué se lo reemplazaría, aunque todavía no tenga fecha de salida.
--
-- `desde` es cuándo entró a "Preparar reemplazo"; si sale de esa lista se
-- pone en NULL y el reloj vuelve a empezar si regresa. `reemplazo` se
-- conserva.
--
-- Migración ADITIVA: una tabla nueva. No toca ninguna fila existente.

CREATE TABLE IF NOT EXISTS candidatos_seguimiento (
  clave          text PRIMARY KEY,
  nombre         text NOT NULL,
  desde          date,
  reemplazo      text,
  actualizado_el timestamptz NOT NULL DEFAULT NOW()
);
