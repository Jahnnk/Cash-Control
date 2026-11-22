-- Habilitar los roles «direccion-jahnn» y «direccion-kelly» en app_users — puerta única, 21-nov-2026.
--
-- QUÉ ES: las cuentas personales de la dirección (con correo) para entrar a todas las apps con un clic.
-- El código ya los acepta (lib/user-scopes.ts, session-access.ts, middleware.ts), pero la base los
-- rechazaba por esta restricción. Solo amplía la lista: no cambia ni borra datos. Idempotente.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_scope_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_scope_check
  CHECK (scope = ANY (ARRAY[
    'admin-atelier', 'admin-fonavi', 'admin-centro',
    'verif-fonavi', 'verif-centro',
    'highlight',
    'lector',
    'equipo',
    'direccion-jahnn', 'direccion-kelly'
  ]::text[]));
