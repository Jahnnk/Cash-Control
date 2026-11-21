-- Puerta única, Etapa 2 (Jahnn, 21-nov-2026): una cuenta por persona, con su correo. El correo es el que reconoce a
-- la misma persona en Envíos, Planilla y Producción (el pase de un clic). Solo agrega una columna opcional y un índice:
-- nadie pierde el acceso y la contraseña sola sigue sirviendo. Idempotente.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unico ON app_users (lower(email)) WHERE email IS NOT NULL
