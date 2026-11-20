-- Ajustes de la app que la dirección prende y apaga desde la pantalla (Jahnn, 20-nov-2026).
-- Primer uso: «highlight_activo». Sin fila = Highlight ARCHIVADO (nadie lo usaba hace 3 meses).
-- Solo crea una tabla nueva: no toca ni borra datos. Idempotente.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
