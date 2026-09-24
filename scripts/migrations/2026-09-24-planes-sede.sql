-- Planes de acción de "Revisar en una sede" (Grupo → Productos → Candidatos a reemplazo).
--
-- Pedido de Jahnn (24-sep-2026): cuando un producto anda flojo en una sede y
-- bien en la otra, decidir qué se hace en la sede floja (precio, vitrina,
-- ofrecerlo, calidad) y, a las 4 semanas, ver si la venta subió respecto de
-- antes del plan. El administrador de esa sede lo ve en su panel.
--
-- Migración ADITIVA: una tabla nueva. No toca ninguna fila existente.

CREATE TABLE IF NOT EXISTS planes_sede (
  id              serial PRIMARY KEY,
  clave           text NOT NULL,
  nombre          text NOT NULL,
  business_id     integer NOT NULL,
  sede            text NOT NULL,
  accion          text NOT NULL CHECK (accion IN ('precio', 'vitrina', 'ofrecer', 'calidad', 'otra')),
  detalle         text,
  inicio          date NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Lima')::date),
  venta_dia_antes numeric(12,2),
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'cerrado')),
  creado_por      text,
  creado_el       timestamptz NOT NULL DEFAULT NOW(),
  cerrado_el      timestamptz
);

-- Un solo plan activo por producto y sede.
CREATE UNIQUE INDEX IF NOT EXISTS planes_sede_activo_uq ON planes_sede (clave, business_id) WHERE estado = 'activo';
