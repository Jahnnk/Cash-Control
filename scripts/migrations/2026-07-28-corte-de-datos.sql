-- "Corte de datos" por sede (pedido de Jahnn, 28-jul-2026).
--
-- POR QUÉ: el dashboard decía "LIQUIDEZ · HOY" cuando en realidad muestra
-- la foto del último Excel cargado. Ejemplo real: el lunes 27 mostraba
-- S/19,689.43 como si fuera de hoy, pero ese dato es del 24/07 a las
-- 6:30 p.m. — y ese mismo día hubo ventas DESPUÉS de esa hora que aún
-- no están registradas. Una etiqueta que miente es un bug.
--
-- QUÉ HACE: agrega UNA columna a `businesses` con el momento exacto
-- hasta el que los datos de esa sede son completos. El import la fija
-- sola (último día con datos, 23:59) y se puede ajustar la hora exacta
-- desde Grupo → Configuración cuando el corte fue a media tarde.
--
-- Sin correrla no se rompe nada: el sistema cae al último día con
-- movimientos registrados (fallback pre-migración).

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS data_cutoff_at timestamptz;
