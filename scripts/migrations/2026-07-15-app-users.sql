-- ============================================================
-- Usuarios del personal (gestión de accesos desde la app), jul-2026.
-- Cada persona del equipo tiene SU contraseña (ya no una compartida
-- por sede): al rotar personal se inhabilita al que sale sin tocar a
-- los demás. La dirección (APP_PASSWORD) NO vive aquí a propósito:
-- la llave maestra se gestiona solo en Vercel.
--
-- password_hash: scrypt `s1.<salt>.<hash>` — nunca se guarda la
-- contraseña en claro y no se puede "recuperar", solo reemplazar.
-- Las sesiones (tokens v3) se firman con este hash: cambiarlo o
-- desactivar al usuario invalida sus sesiones al instante.
--
-- Correr en Neon (SQL Editor) DESPUÉS de un snapshot. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
  id             serial PRIMARY KEY,
  nombre         text NOT NULL,
  scope          text NOT NULL CHECK (scope IN (
                   'admin-atelier','admin-fonavi','admin-centro',
                   'verif-fonavi','verif-centro'
                 )),
  password_hash  text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT NOW(),
  updated_at     timestamptz NOT NULL DEFAULT NOW(),
  last_login     timestamptz
);

-- Verificación:
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'app_users';
