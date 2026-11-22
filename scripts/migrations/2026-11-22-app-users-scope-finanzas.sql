-- Rol «finanzas» (gerencia de finanzas) en app_users — decisión de Jahnn, 22-nov-2026.
--
-- QUÉ ES: la cuenta de la gerencia de finanzas (hoy Kelly; luego otra persona). Ve todo como la dirección MENOS
-- Configuración (cuentas y contraseñas) y el Sistema de Dirección. Ver lib/user-scopes.ts y middleware.ts.
-- «direccion-kelly» se queda en la lista solo por compatibilidad (ya no se ofrece). Solo amplía la lista. Idempotente.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_scope_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_scope_check
  CHECK (scope = ANY (ARRAY[
    'admin-atelier', 'admin-fonavi', 'admin-centro',
    'verif-fonavi', 'verif-centro',
    'highlight',
    'lector',
    'equipo',
    'direccion-jahnn', 'direccion-kelly',
    'finanzas'
  ]::text[]));
