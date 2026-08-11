-- Habilitar el scope "highlight" en app_users — pedido de Jahnn, 11-ago-2026.
--
-- QUÉ PASÓ: al agregar el rol de Highlight (Juani, dirección compartida
-- solo para asignar/supervisar el Highlight de las 3 sedes) se sumó
-- "highlight" a USER_SCOPES en el código, pero la tabla app_users tiene
-- un CHECK que solo permite los 5 scopes originales del personal
-- operativo. Crear el usuario desde Grupo → Configuración falla contra
-- ese CHECK.
--
-- Reemplaza la restricción vieja por una que agrega "highlight" a la
-- lista permitida. Idempotente: DROP + ADD solo corre si el nombre
-- coincide, y usar el mismo nombre de constraint deja la migración
-- segura de repetir.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_scope_check;

ALTER TABLE app_users ADD CONSTRAINT app_users_scope_check
  CHECK (scope = ANY (ARRAY[
    'admin-atelier', 'admin-fonavi', 'admin-centro',
    'verif-fonavi', 'verif-centro',
    'highlight'
  ]::text[]));
