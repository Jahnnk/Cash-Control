-- ============================================================
-- Rotación de productos acumulada POR PERÍODOS
-- Pedido de Jahnn (18-ago-2026)
-- ============================================================
--
-- "Lo ideal es que cada administrador suba el reporte por semana… pero
--  ¿qué pasa si por el apuro Raúl sube el reporte de todo el mes? El
--  sistema deberá identificar el mes, los días y semanas y subirlo todo
--  de manera correcta y ordenada."
--
-- EL PROBLEMA CON EL MODELO ACTUAL
--
-- `product_month_sales` guarda UN mes y cada carga lo REEMPLAZA. Con
-- eso, subir la semana del 15 al 21 borra lo que iba del 1 al 14. Es lo
-- que estuvo a punto de pasar: el export por defecto de Byte es
-- semanal.
--
-- LA SOLUCIÓN
--
-- Guardar cada carga como un PERÍODO (inicio, fin) en su propia tabla.
-- El mes pasa a ser la SUMA de sus períodos, y `product_month_sales`
-- se recalcula a partir de ellos — así todo lo que ya lee esa tabla
-- (portfolio-story, alias, incentivos) sigue funcionando igual.
--
-- La regla que evita el doble conteo es una sola: una carga nueva
-- REEMPLAZA a las que pisa. Con eso salen bien los tres casos:
--   · semanas sueltas (1-7, 8-14, 15-21) → no se pisan, se suman;
--   · el mes entero encima de esas semanas → las reemplaza a todas;
--   · re-subir la misma semana → se actualiza.
--
-- LO QUE BYTE NO DA
--
-- El reporte trae una fila por plato con el total del rango, sin fecha
-- por fila. La semana es lo más fino que se puede guardar; repartir una
-- semana entre sus días es imposible con este archivo.
--
-- RIESGO DE ESTA MIGRACIÓN: ninguno para los datos existentes. Crea una
-- tabla nueva y vacía, y siembra en ella los meses ya cargados como un
-- período de mes completo (para no perder el histórico ni cambiar
-- ningún total). `product_month_sales` no se toca.
-- ============================================================

CREATE TABLE IF NOT EXISTS product_period_sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    integer NOT NULL,

  -- El rango que declaraba el título del reporte de Byte.
  period_start   date    NOT NULL,
  period_end     date    NOT NULL,

  -- Mes al que pertenece el período. Un período NUNCA cruza de mes
  -- (el import lo rechaza y pide dos archivos), así que este dato es
  -- único y sirve para recalcular el mes sin recorrer fechas.
  month          text    NOT NULL,

  product_id     uuid,
  product_name_raw text  NOT NULL,
  units          numeric(12,2) NOT NULL DEFAULT 0,
  revenue        numeric(12,2) NOT NULL DEFAULT 0,

  source         text    NOT NULL DEFAULT 'byte',
  import_batch_id uuid,
  file_name      text,
  imported_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT product_period_sales_rango_valido CHECK (period_start <= period_end),
  CONSTRAINT product_period_sales_mismo_mes
    CHECK (to_char(period_start, 'YYYY-MM') = to_char(period_end, 'YYYY-MM')),
  CONSTRAINT product_period_sales_mes_coincide
    CHECK (month = to_char(period_start, 'YYYY-MM'))
);

-- Al importar se buscan los períodos que se pisan con el nuevo.
CREATE INDEX IF NOT EXISTS product_period_sales_rango_idx
  ON product_period_sales (business_id, period_start, period_end);

-- Y al recalcular, todos los del mes.
CREATE INDEX IF NOT EXISTS product_period_sales_mes_idx
  ON product_period_sales (business_id, month);

-- ── Siembra: lo ya cargado pasa a ser un período de mes completo ──
-- Sin esto, la primera carga nueva recalcularía el mes desde cero y
-- borraría el histórico de abril a agosto.
INSERT INTO product_period_sales
  (business_id, period_start, period_end, month, product_id, product_name_raw,
   units, revenue, source, import_batch_id, imported_at)
SELECT
  s.business_id,
  (s.month || '-01')::date,
  (date_trunc('month', (s.month || '-01')::date) + INTERVAL '1 month - 1 day')::date,
  s.month,
  s.product_id,
  s.product_name_raw,
  s.units,
  s.revenue,
  s.source,
  s.import_batch_id,
  s.imported_at
FROM product_month_sales s
WHERE NOT EXISTS (
  SELECT 1 FROM product_period_sales p
  WHERE p.business_id = s.business_id AND p.month = s.month
);
