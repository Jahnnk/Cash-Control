-- "Por definir": separar gastos de un grupo y huella estable.
--
-- Pedido de Jahnn (17-sep-2026):
--   · Dentro de un grupo que el sistema junta, poder sacar pagos puntuales
--     a otra categoría. Ej.: en Atelier, "PRESTAMO VEHICULAR" (S/4,470.20,
--     débito automático del día 22) está en FINANCIAMIENTO, pero son los
--     sueldos de Jahnn y Juani (S/2,235.10 c/u) → PLANILLA. Se puede
--     separar un solo pago o TODOS los que dicen un texto (regla que vale
--     para los meses que vengan).
--   · Que lo decidido no se vuelva a preguntar al subir otro Excel.
--
-- Huella: el concepto de algunos gastos trae la fecha escrita por el
-- lector del Excel ("[Tue Sep 01 2026 00:00:00 GMT+0000 (...)]"), y ese
-- texto cambia según la zona horaria de la máquina que importó
-- (GMT+0000 en Vercel, GMT-0500 en una computadora en Lima). Con el mismo
-- pago, otra huella → la decisión se perdía y se volvía a preguntar. La
-- huella ahora ignora ese texto. Las claves ya guardadas se recalculan.
--
-- Migración ADITIVA (reemplaza dos funciones y amplía un CHECK).

-- 1 · Concepto sin la fecha del lector del Excel, en MAYÚSCULAS y con espacios simples.
CREATE OR REPLACE FUNCTION concepto_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(btrim(regexp_replace(
    regexp_replace(COALESCE(t, ''), '\s*\[[A-Za-z]{3} [A-Za-z]{3} \d{1,2} \d{4} \d{2}:\d{2}:\d{2} GMT[^]]*\]', '', 'g'),
    '\s+', ' ', 'g')))
$$;

CREATE OR REPLACE FUNCTION huella_gasto_v2(bid integer, d date, monto numeric, concepto text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(bid::text || '|' || d::text || '|' || to_char(monto, 'FM9999999990.00') || '|' || concepto_norm(concepto))
$$;

-- 2 · Las preguntas que cerró el sistema solo no guardan ninguna decisión:
--     se borran para que no choquen con la clave nueva.
DELETE FROM clasificacion_revisiones WHERE alcance = 'gasto' AND decidido_por = 'sistema';

-- 3 · Recalcular las claves de gastos ya guardadas.
UPDATE clasificacion_revisiones r
   SET clave = m.nueva, actualizado_en = now()
  FROM (
    SELECT DISTINCT business_id,
           huella_gasto(business_id, date, amount, concept) AS vieja,
           huella_gasto_v2(business_id, date, amount, concept) AS nueva
      FROM expenses
  ) m
 WHERE r.alcance = 'gasto' AND r.business_id = m.business_id
   AND r.clave = m.vieja AND m.vieja <> m.nueva;

-- 4 · La huella de siempre pasa a ser la nueva.
CREATE OR REPLACE FUNCTION huella_gasto(bid integer, d date, monto numeric, concepto text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(bid::text || '|' || d::text || '|' || to_char(monto, 'FM9999999990.00') || '|' || concepto_norm(concepto))
$$;

DROP FUNCTION huella_gasto_v2(integer, date, numeric, text);

-- 5 · Nuevo alcance: 'concepto' = regla "todos los gastos de la categoría X
--     cuyo concepto dice Y" (clave: categoría|TEXTO).
ALTER TABLE clasificacion_revisiones DROP CONSTRAINT IF EXISTS clasif_rev_alcance_check;
ALTER TABLE clasificacion_revisiones ADD CONSTRAINT clasif_rev_alcance_check CHECK (alcance IN ('categoria', 'gasto', 'concepto'));
