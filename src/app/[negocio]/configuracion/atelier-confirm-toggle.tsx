"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getAtelierConfirmEnabled, setAtelierConfirmEnabled } from "@/lib/atelier-confirm-pref";

/**
 * Toggle de la preferencia local del usuario para confirmar antes de
 * eliminar movimientos en Atelier. Solo se muestra en
 * /atelier/configuracion (en Fonavi/Centro no aplica).
 */
export function AtelierConfirmToggle() {
  const [enabled, setEnabled] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEnabled(getAtelierConfirmEnabled());
    setHydrated(true);
  }, []);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setAtelierConfirmEnabled(next);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">
              Confirmar antes de eliminar movimientos
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Cuando está activado, aparece una ventana pidiendo confirmar
              antes de borrar un ingreso o egreso en Atelier. Útil para
              evitar errores accidentales en la data principal.
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Esta preferencia se guarda en este navegador.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={!hydrated}
          aria-pressed={enabled}
          className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
