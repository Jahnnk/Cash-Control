-- Productos archivados de "Candidatos a reemplazo" (Grupo → Productos).
--
-- Pedido de Jahnn (24-sep-2026): "si yo confirmo que tal producto no se
-- vende, que el sistema me dé la opción de marcarlo y archivarlo". Un
-- producto archivado deja de aparecer en los candidatos; si vuelve a
-- venderse en un mes posterior, reaparece marcado (ver lib/productos/candidatos.ts).
--
-- La clave es el nombre normalizado del producto de Byte (claveByte): junta
-- las variantes "PROMO MOSTRADOR", con o sin tilde, etc.
--
-- Migración ADITIVA: una tabla nueva. No toca ninguna fila existente.

CREATE TABLE IF NOT EXISTS productos_archivados (
  clave         text PRIMARY KEY,
  nombre        text NOT NULL,
  motivo        text NOT NULL CHECK (motivo IN ('ya-no-se-vende', 'sacado-de-carta')),
  archivado_por text,
  archivado_el  timestamptz NOT NULL DEFAULT NOW()
);
