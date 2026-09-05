-- ============================================================
-- Horas semanales de contrato en el roster de incentivos
-- Pedido de Jahnn (5-sep-2026)
-- ============================================================
--
-- "Hay chicos como Diego y Piero que trabajan menos horas… los chicos
--  que trabajan más horas pueden sentir que deberían ganar más que los
--  que trabajan menos."
--
-- QUÉ RESUELVE
--
-- El bono de upselling se pagaba con una tabla fija por jornada:
-- S/48 medio turno, S/97 tiempo completo. Dentro de "medio turno" caben
-- contratos muy distintos —Teresa 23.5 h/semana, Piero 20, Diego 13 por
-- estudios— y los tres cobraban lo mismo. En agosto 2026 el equipo lo
-- notó.
--
-- Diego no incumple: hizo 52 h de un contrato de 52 h, el 100%. El
-- problema no era el esfuerzo sino que el bono no miraba el tamaño del
-- contrato.
--
-- POR QUÉ ESTA COLUMNA Y NO UN FORMULARIO NUEVO
--
-- Las horas ya existen: `trabajadores.horas_semanales` en el sistema de
-- PLANILLA, que cada administrador mantiene y Kelly cierra. Pedirle a
-- Chari que las escriba otra vez en Cash Control crearía dos fuentes de
-- verdad para el mismo dato — exactamente el problema que causó los
-- saldos duplicados y las categorías repetidas de esta semana.
--
-- Esta columna es una COPIA sincronizada, no un segundo original. Se
-- llena con scripts/audit/2026-09-05-sincronizar-horas-planilla.ts, que
-- además avisa cuando algo cambió en Planilla.
--
-- NULL es un estado válido y seguro: sin horas, el motor cae a la tabla
-- fija de siempre. Nadie pierde plata por una sincronización pendiente.
-- ============================================================

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS horas_semanales numeric(5,2);

COMMENT ON COLUMN staff.horas_semanales IS
  'Horas semanales del contrato, copiadas de trabajadores.horas_semanales del sistema de Planilla (fuente de verdad). NULL = el bono cae a la tabla fija por jornada.';
