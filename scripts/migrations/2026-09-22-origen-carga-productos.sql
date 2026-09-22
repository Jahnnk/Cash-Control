-- Doble fuente en la rotación de productos: la sede y la dirección.
--
-- Pedido de Jahnn (22-sep-2026): "así como yo subo los Excel de Kelly, puedo
-- subir los reportes de Byte de productos con mayor rotación… para que el
-- sistema tenga la data completa si los administradores se olvidan, y para
-- cruzar información (doble check)".
--
-- EL CASO QUE LO MOTIVÓ: julio de Fonavi. El administrador subió el 26-jul un
-- archivo declarado "1 al 31 de julio" que en realidad traía S/6,996 de los
-- S/36,329 del mes. El sistema lo aceptó porque era la única fuente.
--
-- LA REGLA (decisión de Jahnn): para los números manda la carga de DIRECCIÓN;
-- la de la sede se conserva y el sistema avisa cuando no coinciden. Una carga
-- solo reemplaza períodos de SU MISMO origen, así que nadie pisa al otro.
--
-- Migración ADITIVA: agrega una columna con valor por defecto y una función
-- de lectura. No toca ninguna fila existente (todas quedan como 'sede', que
-- es lo que son).

ALTER TABLE product_period_sales ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'sede';

ALTER TABLE product_period_sales DROP CONSTRAINT IF EXISTS product_period_sales_origen_check;
ALTER TABLE product_period_sales ADD CONSTRAINT product_period_sales_origen_check CHECK (origen IN ('sede', 'direccion'));

CREATE INDEX IF NOT EXISTS product_period_sales_origen_idx ON product_period_sales (business_id, month, origen);

-- Las filas que CUENTAN de un mes: todos los períodos de dirección, más los
-- de la sede que no se pisan con ninguno de dirección. Es la misma regla que
-- ya evitaba el doble conteo entre semanas, extendida a los dos orígenes.
CREATE OR REPLACE FUNCTION rotacion_efectiva(bid integer, mes text)
RETURNS TABLE (
  product_name_raw text,
  product_id uuid,
  units numeric,
  revenue numeric,
  period_start date,
  period_end date,
  origen text
) LANGUAGE sql STABLE AS $$
  WITH periodos AS (
    SELECT DISTINCT s.period_start, s.period_end, s.origen
    FROM product_period_sales s
    WHERE s.business_id = bid AND s.month = mes
  ),
  direccion AS (SELECT * FROM periodos WHERE origen = 'direccion'),
  efectivos AS (
    SELECT * FROM direccion
    UNION ALL
    SELECT p.* FROM periodos p
    WHERE p.origen = 'sede'
      AND NOT EXISTS (
        SELECT 1 FROM direccion d
        WHERE d.period_start <= p.period_end AND p.period_start <= d.period_end
      )
  )
  SELECT s.product_name_raw, s.product_id, s.units, s.revenue, s.period_start, s.period_end, s.origen
  FROM product_period_sales s
  JOIN efectivos e
    ON e.period_start = s.period_start AND e.period_end = s.period_end AND e.origen = s.origen
  WHERE s.business_id = bid AND s.month = mes
$$;
