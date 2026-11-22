"use client";

import { useState } from "react";
import { Ticket, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { consultarVale, canjearVale, type ValeVista } from "@/app/actions/vales";
import { ETIQUETA_ESTADO, resumenItems } from "@/lib/vales";

/**
 * Canjear un vale de «Primer cliente». Lo usa el encargado de salón o el
 * administrador de la sede (caja no usa Cash Control): el invitado muestra
 * su código, se escribe aquí, se ve qué cubre y se toca «Canjear». Desde
 * ese instante el código queda inhabilitado para siempre. Luego se le dice
 * a caja qué cobrar como cortesía en Byte.
 */
export function CanjearValeCard() {
  const [codigo, setCodigo] = useState("");
  const [vale, setVale] = useState<ValeVista | null>(null);
  const [canjeado, setCanjeado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"buscar" | "canjear" | null>(null);

  function limpiar() {
    setCodigo(""); setVale(null); setCanjeado(false); setError(null);
  }

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!codigo.trim()) return;
    setBusy("buscar"); setError(null); setVale(null); setCanjeado(false);
    const r = await consultarVale(codigo);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setVale(r.vale);
  }

  async function canjear() {
    setBusy("canjear"); setError(null);
    const r = await canjearVale(codigo);
    setBusy(null);
    if (!r.ok) {
      setError(r.error);
      setVale(null); // el estado cambió: que vuelva a buscarlo
      return;
    }
    setVale(r.vale);
    setCanjeado(true);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Ticket className="w-4 h-4 text-primary" />
          Canjear vale de consumo
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Pídele al invitado su código (ej. <span className="font-mono">7K3Q-M2PA</span>). Al canjearlo queda usado
          para siempre.
        </p>
      </div>

      <form onSubmit={buscar} className="flex gap-2">
        <input
          type="text"
          value={codigo}
          onChange={(e) => { setCodigo(e.target.value.toUpperCase()); if (vale || error) { setVale(null); setError(null); setCanjeado(false); } }}
          placeholder="Código del vale"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={120}
          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-base font-mono tracking-widest"
        />
        <button
          type="submit"
          disabled={busy !== null || !codigo.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-primary hover:opacity-90 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy === "buscar" && <Loader2 className="w-4 h-4 animate-spin" />}
          Buscar
        </button>
      </form>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {vale && !canjeado && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-bold text-gray-900">{vale.codigo}</span>
            <span className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${vale.estado === "emitido" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-gray-100 text-gray-700 border-gray-300"}`}>
              {ETIQUETA_ESTADO[vale.estado]}
            </span>
          </div>
          <div className="text-sm text-gray-900">
            Cubre: <strong>{resumenItems(vale.items)}</strong>
          </div>
          <div className="text-xs text-gray-500">
            {vale.para ? `Para ${vale.para} · ` : ""}válido hasta el {vale.venceEl.split("-").reverse().join("/")}
          </div>
          {vale.estado === "emitido" ? (
            <button
              onClick={canjear}
              disabled={busy !== null}
              className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy === "canjear" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Canjear ahora
            </button>
          ) : (
            <div className="text-sm text-red-700">
              {vale.estado === "canjeado" && `Ya se canjeó${vale.canjeadoEn ? ` el ${vale.canjeadoEn}` : ""}${vale.canjeadoPor ? ` (${vale.canjeadoPor})` : ""}. No se puede usar otra vez.`}
              {vale.estado === "vencido" && "Este vale ya venció."}
              {vale.estado === "anulado" && "Este vale fue anulado por dirección."}
            </div>
          )}
        </div>
      )}

      {vale && canjeado && (
        <div className="border border-emerald-300 bg-emerald-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="w-5 h-5" />
            ¡Vale canjeado! Ya no se puede usar otra vez.
          </div>
          <div className="text-sm text-gray-900">
            Dile a caja que cobre como <strong>cortesía</strong> en Byte:
            <div className="mt-1 text-base font-bold text-gray-900">{resumenItems(vale.items)}</div>
          </div>
          <button onClick={limpiar} className="text-xs font-medium text-emerald-800 underline">
            Canjear otro vale
          </button>
        </div>
      )}
    </div>
  );
}
