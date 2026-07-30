-- Sistema de Dirección (ASDR CORE) — pedido de Jahnn, 29-jul-2026,
-- inspirado en la pizarra de dirección de su asesor Kerly.
--
-- QUÉ ES: el tablero con el que un CEO dirige — objetivos del año, los
-- números que mandan, la salud del sistema, las personas clave, las
-- decisiones de la semana y los principios que evitan autoengaños.
-- Todo EDITABLE: las metas son de Yayi's, no copiadas de nadie.
--
-- UNA sola tabla para los seis bloques (el campo `block` los separa).
-- Sin esta migración la pantalla avisa que falta correrla y no rompe
-- nada del resto del sistema.

CREATE TABLE IF NOT EXISTS direccion_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'objetivo' | 'numero' | 'salud' | 'persona' | 'decision' | 'alerta'
  block         text NOT NULL,
  position      integer NOT NULL DEFAULT 0,
  title         text NOT NULL,
  detail        text,
  -- salud: 'bien' | 'atencion' | 'roto'
  -- decision: 'tomada' | 'pendiente' | 'delegada'
  status        text,
  -- Números que mandan: si trae metric_key, el valor lo calcula el
  -- sistema solo; si es NULL, el valor lo escribe Jahnn a mano.
  metric_key    text,
  manual_value  numeric(14,2),
  target_value  numeric(14,2),
  target_unit   text,                       -- 'S/' | '%' | 'pts' | 'días'
  higher_is_better boolean NOT NULL DEFAULT true,
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS direccion_items_block_idx
  ON direccion_items (block, archived, position);
