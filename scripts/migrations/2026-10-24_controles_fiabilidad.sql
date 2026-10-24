-- Controles de fiabilidad del mes (24-oct-2026).
--
-- Pedido de Jahnn tras la auditoría de setiembre 2026: que el sistema diga si los números de cada mes son
-- confiables. Los ocho controles se calculan en lib/controles-fiabilidad.ts al importar cada Excel y al abrir
-- el mes; aquí se guarda el último resultado de cada sede y mes (business_id 0 = el grupo).
--
-- Migración ADITIVA: una tabla nueva, vacía. No toca ninguna tabla existente. Sin esta tabla la app calcula
-- igual los controles y los muestra; solo no los guarda.
--
-- Pegar en el SQL Editor de Neon (una sola vez).

CREATE TABLE IF NOT EXISTS controles_mes (
  business_id   integer     NOT NULL,            -- 1 Atelier · 2 Fonavi · 3 Centro · 0 Grupo
  mes           text        NOT NULL,            -- YYYY-MM
  estado        text        NOT NULL,
  controles     jsonb       NOT NULL,            -- [{ id, nombre, estado, diferencia, detalle, queHacer, filas }]
  origen        text        NOT NULL,            -- 'import' (al subir un Excel) | 'apertura' (al abrir el mes)
  calculado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, mes),
  CONSTRAINT controles_mes_estado_check CHECK (estado IN ('confiable', 'con_observaciones', 'no_confiable')),
  CONSTRAINT controles_mes_origen_check CHECK (origen IN ('import', 'apertura'))
);
