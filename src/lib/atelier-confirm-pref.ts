"use client";

/**
 * Preferencia local del usuario (Jahnn) para activar/desactivar el
 * modal de confirmación al editar/eliminar movimientos en Atelier.
 *
 * Vive en localStorage, no en BD: es preferencia personal del browser.
 * Default: activada (true). Solo se aplica en scope Atelier.
 */
const KEY = "atelier_confirm_destructive";

export function getAtelierConfirmEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(KEY);
  if (v === null) return true; // default ON
  return v === "true";
}

export function setAtelierConfirmEnabled(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, value ? "true" : "false");
}
