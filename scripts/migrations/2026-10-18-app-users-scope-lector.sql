-- Habilitar el scope "lector" en app_users — pedido de Jahnn, 18-oct-2026.
--
-- QUÉ ES: una llave de SOLO LECTURA para herramientas externas (Muse, de Meta) que entran a mirar el
-- Dashboard de Grupo y Reportes. Se crea y se apaga desde Grupo → Configuración, sin tocar la llave maestra.
-- Puede VER esas dos pantallas; no puede guardar, subir ni borrar nada (las acciones que escriben siguen
-- pidiendo sesión de dirección). Ver lib/session-access.ts (requireLectura) y middleware.ts.
--
-- Igual que 2026-08-11 (highlight): reemplaza la restricción por una que agrega "lector". Idempotente.

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_scope_check;

ALTER TABLE app_users ADD CONSTRAINT app_users_scope_check
  CHECK (scope = ANY (ARRAY[
    'admin-atelier', 'admin-fonavi', 'admin-centro',
    'verif-fonavi', 'verif-centro',
    'highlight',
    'lector'
  ]::text[]));
