-- Excepciones al bono por persona y mes (1-oct-2026).
--
-- Propósito: dejar decidir a Jahnn quién NO cobra el bono de un periodo (ej. alguien
-- en periodo de prueba, que dura varios meses) y quién SÍ cobra aunque la regla
-- automática lo deje fuera (ej. un administrador que ingresó a mitad de mes).
--
-- La regla automática del sistema solo deja afuera el MES de ingreso; esta tabla cubre
-- el resto. Es una tabla NUEVA: no toca ningún dato existente. Idempotente.
--
-- accion = 'excluir' → no cobra de desde_mes a hasta_mes (hasta_mes NULL = sin fin).
-- accion = 'incluir' → cobra aunque la regla automática diga que no.

CREATE TABLE IF NOT EXISTS bono_exclusiones (
  id          BIGSERIAL PRIMARY KEY,
  business_id INTEGER     NOT NULL,
  dni         TEXT        NOT NULL,
  accion      TEXT        NOT NULL DEFAULT 'excluir' CHECK (accion IN ('excluir', 'incluir')),
  desde_mes   TEXT        NOT NULL CHECK (desde_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  hasta_mes   TEXT        CHECK (hasta_mes IS NULL OR hasta_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  motivo      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, dni, accion, desde_mes)
);

CREATE INDEX IF NOT EXISTS bono_exclusiones_sede_idx ON bono_exclusiones (business_id, dni);
