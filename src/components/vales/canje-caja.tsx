"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, Lock } from "lucide-react";
import { canjearEnCaja, type CanjeCaja } from "@/app/actions/vales-caja";
import { resumenItems } from "@/lib/vales";

/**
 * Canje EN CAJA, sin cuenta (los cajeros no usan Cash Control). Se muestra en
 * la página pública del vale, sobre el celular del invitado, y también suelto
 * en /vale (el cajero escribe el código). El cajero escribe el PIN de caja de
 * su sede; si es correcto el vale queda canjeado para siempre y la pantalla
 * le dice qué cobrar como cortesía en Byte.
 */
export function CanjeEnCaja({ codigo }: { codigo?: string }) {
  const [abierto, setAbierto] = useState(codigo === undefined);
  const [codigoEscrito, setCodigoEscrito] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<CanjeCaja | null>(null);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const r = await canjearEnCaja({ codigo: codigo ?? codigoEscrito, pin });
    setBusy(false);
    setPin(""); // un PIN fallido o usado no se queda a la vista en la pantalla del invitado
    if (!r.ok) { setError(r.error); return; }
    setHecho(r.vale);
  }

  if (hecho) {
    return (
      <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-4 text-center space-y-2">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
        <div className="text-lg font-extrabold text-emerald-800">¡CANJEADO!</div>
        <div className="font-mono font-bold text-gray-900">{hecho.codigo}</div>
        <div className="text-sm text-gray-800">
          Cajero: cobra en Byte como <strong>cortesía</strong>:
          <div className="mt-1 text-base font-bold text-gray-900">{resumenItems(hecho.items)}</div>
        </div>
        <div className="text-xs text-gray-600">Este vale ya no se puede usar otra vez.</div>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#004C40] px-4 py-3 text-sm font-semibold text-[#004C40] hover:bg-emerald-50"
      >
        <Lock className="w-4 h-4" />
        Canjear (solo caja)
      </button>
    );
  }

  return (
    <form onSubmit={confirmar} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="text-sm font-semibold text-gray-900">Canje en caja</div>
      {codigo === undefined && (
        <input
          type="text"
          value={codigoEscrito}
          onChange={(e) => setCodigoEscrito(e.target.value.toUpperCase())}
          placeholder="Código del vale (7K3Q-M2PA)"
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base font-mono tracking-widest"
        />
      )}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        placeholder="PIN de caja (6 números)"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base tracking-[0.4em] text-center"
      />
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={busy || pin.length !== 6 || (codigo === undefined && !codigoEscrito.trim())}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#004C40] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Confirmar canje
      </button>
      <p className="text-[11px] text-gray-500 text-center">Solo personal de caja. Al confirmar, el vale queda usado para siempre.</p>
    </form>
  );
}
