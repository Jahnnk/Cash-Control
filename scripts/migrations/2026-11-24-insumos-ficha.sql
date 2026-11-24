-- Ficha de cada insumo — fase 1 de la pantalla Grupo → Insumos, 24-nov-2026.
--
-- QUÉ ES: lo que Jahnn (y luego Luis) deciden de un insumo y que el Excel no trae:
--   categoria  la categoría elegida (null = la del Excel, por el prefijo del SKU)
--   critico    true/false puesto a mano (null = lo decide el sistema: los que hacen el 80% del gasto)
--   nombre     el nombre corregido (null = el del Excel); los precios siguen en insumos_precios
-- Clave = (origen, sku), igual que insumos_precios. Solo CREA una tabla nueva. Idempotente.

CREATE TABLE IF NOT EXISTS insumos_ficha (
  origen          text NOT NULL,
  sku             text NOT NULL,
  categoria       text,
  critico         boolean,
  nombre          text,
  actualizado_por text NOT NULL,
  actualizado_el  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origen, sku)
);
