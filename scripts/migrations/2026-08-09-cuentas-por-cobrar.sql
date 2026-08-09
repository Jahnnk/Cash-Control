-- Cuentas por cobrar de Atelier — pedido de Jahnn, 09-ago-2026.
--
-- QUÉ ES: Luis sube dos reportes de Byte, el "Reporte de Ventas" y el
-- "Consolidado de Facturas". El sistema arma con ellos el control de
-- quién debe, cuánto, desde cuándo — y cuadra que lo facturado coincida
-- con lo vendido.
--
-- POR QUÉ UN LIBRO Y NO FOTOS SEMANALES (a diferencia de
-- client_sales_snapshots): una deuda VIVE entre semanas. La factura de
-- la semana pasada que se cobra esta semana tiene que CAMBIAR DE ESTADO,
-- no duplicarse en dos fotos. Por eso cada documento es una fila única
-- (`doc_key`) que se actualiza en cada importación.
--
-- HALLAZGO QUE DEFINE EL DISEÑO (verificado contra los archivos reales
-- del 01 al 09-ago-2026): "facturas emitidas" NO es igual a "reporte de
-- ventas", y no debe serlo. En la muestra:
--     Facturas emitidas  9,001.59
--   + Boletas              405.32
--   + Tickets              212.22
--   = Reporte de Ventas  9,619.13   (cuadre exacto, diferencia 0.00)
-- Exigir que facturas = ventas daría un error falso cada semana. El
-- cuadre real es a tres bandas, y el control entre archivos es que las
-- FACTURAS del reporte de ventas coincidan con el consolidado.
--
-- ESTADO DE COBRO: Byte ya lo trae, escondido como texto en la columna
-- "Medios": `CREDITOCuota 1: 728.55 - 2026-08-08 [PENDIENTE]`. De ahí
-- salen `estado_cuota` y `vencimiento`. Luis no marca nada a mano salvo
-- lo que cobró después de generar el archivo (ver `cobrado_manual`).

CREATE TABLE IF NOT EXISTS invoice_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   integer NOT NULL,

  -- Identidad estable del documento entre importaciones. Normalizada sin
  -- ceros a la izquierda porque los dos reportes la escriben distinto:
  -- ventas dice "FB02-001242", el consolidado dice SERIE=FB02 + NUMERO=00001242.
  -- Los tickets no tienen serie fiscal, van como 'TICKET-1432'.
  doc_key       text NOT NULL,
  tipo          text NOT NULL,              -- FACTURA | BOLETA | TICKET
  serie         text,                       -- tal cual lo escribe Byte
  fecha         date NOT NULL,
  cliente       text NOT NULL,
  documento     text,                       -- RUC/DNI (solo lo trae el consolidado)
  tipo_doc      text,

  -- Fonavi/Centro comprándole a Atelier. Se marcan igual que en
  -- client_sales_rows para poder distinguirlas, aunque por decisión de
  -- Jahnn (09-ago-2026) SÍ entran en la misma lista de deudores.
  es_sede       boolean NOT NULL DEFAULT false,
  sede_id       integer,

  total         numeric(14,2) NOT NULL DEFAULT 0,
  igv           numeric(14,2),
  gravado       numeric(14,2),

  -- Cobranza
  credito       numeric(14,2) NOT NULL DEFAULT 0,  -- lo que quedó a crédito
  cobrado_pos   numeric(14,2) NOT NULL DEFAULT 0,  -- lo cobrado en el momento
  estado_cuota  text NOT NULL DEFAULT 'SIN_CUOTA', -- PENDIENTE | PAGADA | SIN_CUOTA
  vencimiento   date,

  -- Solo cuando el documento vino del consolidado de facturas.
  estado_factura text,                      -- EMITIDO | ANULADO | NULL

  -- Cobros que Luis registró DESPUÉS de generar el archivo de Byte.
  -- Byte manda para los totales oficiales; esto se muestra como aviso
  -- ("cobrado, falta registrarlo en Byte") y se limpia solo cuando el
  -- archivo nuevo confirma el pago.
  cobrado_manual       boolean NOT NULL DEFAULT false,
  cobrado_manual_fecha timestamptz,
  cobrado_manual_nota  text,

  -- Trazabilidad: de qué archivo vino cada parte de la fila.
  origen_ventas   boolean NOT NULL DEFAULT false,
  origen_facturas boolean NOT NULL DEFAULT false,

  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  UNIQUE (business_id, doc_key)
);

-- Bitácora de importaciones: qué archivo, qué período, cuánto sumaba.
-- Sirve para el cuadre y para saber qué tan fresco está el dato.
CREATE TABLE IF NOT EXISTS invoice_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    integer NOT NULL,
  tipo_reporte   text NOT NULL,             -- 'ventas' | 'facturas'
  periodo_inicio date NOT NULL,
  periodo_fin    date NOT NULL,
  archivo        text,
  documentos     integer NOT NULL DEFAULT 0,
  total          numeric(14,2) NOT NULL DEFAULT 0,
  creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_documents_pendientes_idx
  ON invoice_documents (business_id, estado_cuota, fecha DESC);

CREATE INDEX IF NOT EXISTS invoice_documents_cliente_idx
  ON invoice_documents (business_id, documento);

CREATE INDEX IF NOT EXISTS invoice_documents_fecha_idx
  ON invoice_documents (business_id, fecha DESC);

CREATE INDEX IF NOT EXISTS invoice_imports_idx
  ON invoice_imports (business_id, tipo_reporte, periodo_fin DESC);
