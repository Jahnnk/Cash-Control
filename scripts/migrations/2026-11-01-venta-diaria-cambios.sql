-- Historial de cambios de la venta diaria (1-nov-2026).
--
-- Pedido de Jahnn: saber quién cambió la venta o las personas de un día, cuándo, y de qué monto a qué
-- monto. Hasta hoy el panel de cada administradora sobrescribe upselling_daily y no queda rastro
-- (audit_log no cubre esa tabla).
--
-- Una fila por cada guardado que CAMBIA algo: el primer registro del día (antes = NULL) o una corrección
-- de la venta o de las personas. Guardar lo mismo no anota nada.
--
-- Migración ADITIVA: una tabla nueva, vacía. No toca ninguna tabla existente. Sin esta tabla la app
-- guarda la venta igual; solo no anota el cambio.
--
-- Pegar en el SQL Editor de Neon (una sola vez).

CREATE TABLE IF NOT EXISTS venta_diaria_cambios (
  id             bigserial     PRIMARY KEY,
  business_id    integer       NOT NULL,            -- 1 Atelier · 2 Fonavi · 3 Centro
  date           date          NOT NULL,            -- el día de venta que se tocó
  venta_antes    numeric(12,2),                     -- NULL = el día no existía
  venta_despues  numeric(12,2) NOT NULL,
  personas_antes integer,
  personas_despues integer     NOT NULL,
  quien          text          NOT NULL,            -- nombre si se conoce, si no el rol («Administración de Fonavi»)
  rol            text          NOT NULL,            -- 'admin' | 'direccion'
  creado_en      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS venta_diaria_cambios_sede_fecha_idx ON venta_diaria_cambios (business_id, date);
CREATE INDEX IF NOT EXISTS venta_diaria_cambios_creado_idx ON venta_diaria_cambios (creado_en DESC);
