-- Saldo de banco y caja declarado por sede, con su fecha.
--
-- Por qué una tabla nueva y no `daily_records.bank_balance_real`:
-- esa columna vive dentro del cierre diario de Atelier (registro Byte,
-- conciliación BCP, reporte semanal) y solo Atelier lo lleva. Fonavi y
-- Centro NUNCA han registrado un saldo — cero filas desde siempre — así
-- que meterles filas de cierre diario solo para guardar un saldo
-- ensuciaría un flujo que no usan.
--
-- El caso que lo obligó (9-sep-2026): se malogró la refrigeradora de
-- Atelier, el técnico cobraba S/3,400 y Kelly preguntó si las cafeterías
-- tenían liquidez para prestar. El sistema no podía responder: el último
-- saldo de banco de Atelier era del 10 de agosto y las cafeterías no
-- tenían ninguno. Es el único dato que el sistema no puede deducir solo.
--
-- Decisión de Jahnn: él registra los tres saldos una vez por semana.

CREATE TABLE IF NOT EXISTS sede_balances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   integer NOT NULL,
  fecha         date    NOT NULL,          -- a qué día corresponde el saldo
  banco         numeric(12,2),             -- null = esta sede no maneja banco
  caja          numeric(12,2) NOT NULL DEFAULT 0,
  nota          text,
  registrado_por text,
  created_at    timestamp NOT NULL DEFAULT now(),
  -- Un saldo por sede y día: volver a registrar el mismo día corrige,
  -- no acumula.
  UNIQUE (business_id, fecha)
);

CREATE INDEX IF NOT EXISTS sede_balances_lookup
  ON sede_balances (business_id, fecha DESC);
