-- Punto de equilibrio según el Excel de Kelly (pestañas "Categorías PE" y "PE <MES>").
--
-- Pedido de Jahnn (16-sep-2026): el cálculo del punto de equilibrio ahora
-- vive en los Excel de Kelly, y el sistema tiene que dar el MISMO número:
-- es la referencia de la meta de ventas del bono.
--
-- Por qué hace falta guardar el grupo ORIGINAL: al importar, el sistema
-- junta nombres de grupo en una categoría canónica (p. ej. "PRÉSTAMOS SOCIO"
-- y "PRESTAMO DINERS" → FINANCIAMIENTO). Kelly clasifica por el texto tal
-- como lo escribió, y algunos grupos que el sistema junta ella los trata
-- distinto. Guardando el texto original, la clasificación de Kelly se
-- aplica igual que en su Excel — y si ella cambia un tipo, todos los meses
-- se recalculan solos, como en su archivo.
--
-- Migración ADITIVA: una columna nueva (vacía hasta la próxima importación)
-- y dos tablas nuevas vacías.

-- 1 · El texto de "Grupo" tal como vino en el Excel.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS grupo_excel text;

-- 2 · La lista "Categorías PE" de Kelly, por sede.
CREATE TABLE IF NOT EXISTS pe_categorias (
  business_id   integer NOT NULL,
  grupo_norm    text    NOT NULL,   -- sin tildes, MAYÚSCULAS, espacios simples: la llave
  grupo         text    NOT NULL,   -- como lo escribió Kelly
  tipo          text    NOT NULL,
  nota          text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, grupo_norm),
  CONSTRAINT pe_categorias_tipo_check CHECK (tipo IN ('Fijo', 'Variable', 'Excluido'))
);

-- 3 · Lo que calculó el Excel de Kelly cada mes (pestañas "PE <MES>").
--     No se usa para pagar nada: es el control. Si el sistema no da lo
--     mismo, se avisa.
CREATE TABLE IF NOT EXISTS pe_mensual_excel (
  business_id       integer NOT NULL,
  month             text    NOT NULL,   -- YYYY-MM
  ventas            numeric(12,2),
  costos_variables  numeric(12,2),
  costos_fijos      numeric(12,2),
  excluido          numeric(12,2),
  punto_equilibrio  numeric(12,2),
  conciliacion      numeric(12,2),      -- "Debe ser 0" del Excel
  hoja              text    NOT NULL,
  importado_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, month)
);
