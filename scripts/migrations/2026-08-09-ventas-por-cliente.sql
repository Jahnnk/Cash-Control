-- Ventas por Cliente (Byte) — pedido de Jahnn, 09-ago-2026.
--
-- QUÉ ES: Luis (administrador de Atelier) sube cada semana el "Reporte
-- Ventas por Cliente" que da Byte. El sistema lo convierte en el
-- seguimiento de quiénes son los mejores clientes B2B de Atelier:
-- ranking, ticket, frecuencia, quién creció, quién dejó de comprar.
--
-- DECISIÓN DE DISEÑO (Jahnn, 09-ago-2026): las ventas a Fonavi y Centro
-- se separan del ranking. En el reporte de muestra eran el 66% del total
-- y tapaban por completo a los clientes externos, que son los que
-- interesa vigilar para vender más. Se marcan con `es_sede` y viven en
-- su propio bloque de la pantalla.
--
-- MODELO: cada archivo importado es un SNAPSHOT con su rango de fechas
-- (Byte lo da acumulado por período, no por transacción). Reimportar el
-- mismo rango REEMPLAZA el snapshot anterior — así Luis puede volver a
-- subir el archivo si se equivocó, sin duplicar nada.

CREATE TABLE IF NOT EXISTS client_sales_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     integer NOT NULL,
  -- Rango que cubre el reporte, derivado de las columnas
  -- "Primera Compra" / "Última Compra" del propio archivo.
  periodo_inicio  date NOT NULL,
  periodo_fin     date NOT NULL,
  archivo         text,
  -- Totales del snapshot, precalculados para no recorrer filas al pintar.
  total_ventas       numeric(14,2) NOT NULL DEFAULT 0,
  total_pedidos      integer       NOT NULL DEFAULT 0,
  total_clientes     integer       NOT NULL DEFAULT 0,
  ventas_externas    numeric(14,2) NOT NULL DEFAULT 0,
  ventas_sedes       numeric(14,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Un solo snapshot por sede y rango: reimportar reemplaza.
  UNIQUE (business_id, periodo_inicio, periodo_fin)
);

CREATE TABLE IF NOT EXISTS client_sales_rows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       uuid NOT NULL REFERENCES client_sales_snapshots(id) ON DELETE CASCADE,
  -- Documento: la identidad estable del cliente entre semanas (el nombre
  -- puede venir escrito distinto, el RUC/DNI no).
  documento         text,
  tipo_doc          text,                       -- 'ruc' | 'dni' | otros
  cliente           text NOT NULL,
  -- Venta interna del grupo: Fonavi o Centro comprándole a Atelier.
  -- Para el grupo consolidado esto NO es ingreso nuevo, solo traslado.
  es_sede           boolean NOT NULL DEFAULT false,
  sede_id           integer,                    -- 2 = Fonavi, 3 = Centro
  total_pedidos     integer       NOT NULL DEFAULT 0,
  con_comprobante   integer       NOT NULL DEFAULT 0,
  sin_comprobante   integer       NOT NULL DEFAULT 0,
  total_ventas      numeric(14,2) NOT NULL DEFAULT 0,
  ticket_promedio   numeric(14,2) NOT NULL DEFAULT 0,
  primera_compra    date,
  ultima_compra     date
);

CREATE INDEX IF NOT EXISTS client_sales_snapshots_business_idx
  ON client_sales_snapshots (business_id, periodo_fin DESC);

CREATE INDEX IF NOT EXISTS client_sales_rows_snapshot_idx
  ON client_sales_rows (snapshot_id, total_ventas DESC);

-- Para seguir a un cliente a lo largo de las semanas por su documento.
CREATE INDEX IF NOT EXISTS client_sales_rows_documento_idx
  ON client_sales_rows (documento);
