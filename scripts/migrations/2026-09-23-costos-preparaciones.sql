-- Costos de preparaciones de Atelier para el registro de mermas.
--
-- Pedido de Jahnn (23-sep-2026): "si mi administrador coloca en mermas 70
-- cookies XL, que el sistema automáticamente genere el costo en insumos".
--
-- La lista sale del Excel maestro de pricing (hoja PRICING + ATE · Sub-Recetas
-- + ATE · Insumos) que Jahnn sube en Grupo → Configuración. Cada subida
-- reemplaza la lista de esa sede entera (es una foto del Excel vigente). Las
-- mermas ya registradas NO dependen de esta tabla: cada merma guarda su costo
-- del día, así que cambiar precios no mueve los reportes pasados.
--
-- Migración ADITIVA: una tabla nueva, una columna nueva opcional y más
-- decimales en el costo unitario de la merma (2 → 4: un Delisol cuesta
-- S/0.173 y redondeado a S/0.17 descuadra al multiplicar por 70). Ninguna
-- fila existente cambia de valor.

CREATE TABLE IF NOT EXISTS costos_preparaciones (
  business_id  integer NOT NULL,
  ref          text NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('producto', 'preparacion', 'insumo')),
  nombre       text NOT NULL,
  categoria    text,
  unidad       text NOT NULL CHECK (unidad IN ('und', 'kg', 'l')),
  costo        numeric(14,6) NOT NULL CHECK (costo >= 0),
  archivo      text,
  cargado_el   timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, ref)
);

ALTER TABLE merma_items ALTER COLUMN costo_unit TYPE numeric(12,4);

-- De qué ítem de la lista salió el costo (null = escrito a mano).
ALTER TABLE merma_items ADD COLUMN IF NOT EXISTS costo_ref text;
