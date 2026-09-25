-- El clasificador experto de egresos: reglas que Jahnn enseña.
--
-- Pedido de Jahnn (25-sep-2026): un clasificador experto que identifique
-- cada egreso (fijo, variable, financiamiento, inversión o no es gasto),
-- porque de ahí salen el punto de equilibrio, la categorización de gastos
-- y el presupuesto. Cuando Jahnn decide un gasto en "Por definir" puede
-- enseñar la regla ("todos los que dicen TAPA DE LOMO son INSUMOS"): se
-- aplica a los gastos parecidos de la sede y a los que lleguen en cada
-- Excel. La lógica vive en src/lib/clasificador-gasto.ts.
--
-- Migración ADITIVA: una tabla nueva, no toca datos existentes.

CREATE TABLE IF NOT EXISTS reglas_aprendidas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  integer NOT NULL,
  -- El texto tal como se compara: norm_grupo(concepto_norm(x)) (MAYÚSCULAS, sin tildes).
  texto        text    NOT NULL,
  categoria    text    NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  creado_por   text    NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  -- El gasto con el que se enseñó (fecha, monto, concepto), para mostrarlo.
  origen       jsonb,
  -- Kelly ya la pasó a la pestaña REGLAS de su Excel.
  en_excel_en  timestamptz,
  UNIQUE (business_id, texto)
);
