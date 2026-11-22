-- ============================================================
-- Vales de consumo digitales — iniciativa «Primer cliente»
-- Pedido de Jahnn (22-nov-2026)
-- ============================================================
--
-- Reemplaza el vale de papel: Jahnn emite un vale con un código único
-- (ej. 7K3Q-M2PA) que cubre uno o varios productos de la carta; el
-- encargado o administrador de la sede lo canjea en Cash Control y el
-- código queda inhabilitado para siempre.
--
-- QUÉ TOCA: crea UNA tabla nueva. No modifica ni lee ninguna tabla
-- existente (solo referencia businesses por id). Idempotente.
-- RIESGO: ninguno sobre datos actuales. Staging y producción comparten
-- esta BD, así que la tabla aparece en ambos al correrla.
--
-- POR QUÉ NO SE GUARDA 'vencido': se deduce de (emitido + vence_el pasó),
-- igual que 'caducada' en highlight_propuestas. Un estado que depende del
-- reloj mentiría apenas un proceso nocturno fallara.
--
-- POR QUÉ NO HAY DOBLE CANJE: canjear es un solo UPDATE con
-- WHERE estado = 'emitido'; si dos personas lo intentan a la vez, solo una
-- lo logra (Postgres serializa la fila).
-- ============================================================

CREATE TABLE IF NOT EXISTS vales_consumo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- «7K3Q-M2PA». 8 símbolos sin I/O/0/1 → más de un billón de combinaciones.
  codigo        text    NOT NULL UNIQUE,

  -- Sede donde se canjea (solo Fonavi o Centro; Atelier no atiende público).
  business_id   integer NOT NULL REFERENCES businesses(id),

  -- [{ "ref": "CF-011", "nombre": "Cappuccino", "cantidad": 1, "precio": 9.5 }]
  -- El nombre y el precio quedan congelados al emitir.
  items         jsonb   NOT NULL,
  -- Lo que costaría en carta lo que cubre el vale (para medir la cortesía).
  valor_carta   numeric(10,2) NOT NULL DEFAULT 0,

  -- A quién se entrega (el administrador, socio o invitado). Opcional.
  para          text,

  -- Vale HASTA este día, inclusive (hora de Lima).
  vence_el      date    NOT NULL,

  estado        text    NOT NULL DEFAULT 'emitido',

  emitido_por   text    NOT NULL,
  emitido_en    timestamptz NOT NULL DEFAULT now(),

  canjeado_por  text,
  canjeado_en   timestamptz,

  anulado_por   text,
  anulado_en    timestamptz,
  anulado_motivo text,

  CONSTRAINT vales_consumo_estado_check
    CHECK (estado IN ('emitido', 'canjeado', 'anulado')),
  CONSTRAINT vales_consumo_items_no_vacio
    CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  -- Un vale canjeado siempre dice quién y cuándo; uno emitido, ninguno.
  CONSTRAINT vales_consumo_canje_coherente
    CHECK ((estado = 'canjeado') = (canjeado_en IS NOT NULL))
);

-- La lista de Jahnn: «lo último primero» por sede.
CREATE INDEX IF NOT EXISTS vales_consumo_sede_idx
  ON vales_consumo (business_id, emitido_en DESC);
