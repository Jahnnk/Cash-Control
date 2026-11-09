"use client";

/**
 * Fondos mutuos de Atelier y Centro, bajo «Movimiento de dinero» (pedido de Jahnn, 8-nov-2026). Es informativo: plata
 * ahorrada que no está en el banco ni en la caja. Jahnn anota el saldo del estado de cuenta y el sistema lo mantiene al día
 * con lo depositado y lo rescatado desde esa fecha (lib/fondos-mutuos.ts). No calcula rendimientos.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, PiggyBank } from "lucide-react";
import { getFondosMutuos, type FondoSede } from "@/app/actions/fondos-mutuos";
import { guardarFondosMutuos } from "@/app/actions/decision";
import { useToast } from "@/components/toast-provider";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });

function Anotar({ f, onListo }: { f: FondoSede; onListo: () => void }) {
  const { showToast } = useToast();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [dia, setDia] = useState(hoy);
  const [saldo, setSaldo] = useState("");
  const [busy, setBusy] = useState(false);
  async function guardar() {
    const v = Number(saldo.replace(/,/g, ""));
    if (!saldo.trim() || !Number.isFinite(v)) { showToast("Escribe el saldo del estado de cuenta.", "error"); return; }
    setBusy(true);
    const r = await guardarFondosMutuos({ businessId: f.businessId, fecha: dia, saldo: v });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`Fondo mutuo de ${f.sede} guardado.`, "success");
    onListo();
  }
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs text-gray-600"><span className="mb-1 block">Fecha del estado de cuenta</span>
        <input type="date" value={dia} max={hoy} onChange={(e) => setDia(e.target.value)} className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-gray-600"><span className="mb-1 block">Saldo (S/)</span>
        <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0.00" className="w-32 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm tabular-nums" />
      </label>
      <button type="button" onClick={guardar} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
      </button>
    </div>
  );
}

function Fila({ f, onCambio }: { f: FondoSede; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-gray-700">{f.sede}</span>
        {f.estimado === null
          ? <span className="text-sm text-gray-400">sin anotar</span>
          : <b className="text-lg font-semibold tabular-nums text-gray-900">{soles(f.estimado)}</b>}
      </div>
      {f.anotado && (
        <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
          Anotaste {soles(f.anotado.saldo)} el {fecha(f.anotado.fecha)}
          {f.depositos > 0.5 && <> · depositado desde entonces +{soles(f.depositos)}</>}
          {f.rescates > 0.5 && <> · rescatado −{soles(f.rescates)}</>}
          {f.depositos <= 0.5 && f.rescates <= 0.5 && <> · sin movimientos desde entonces</>}
          . Los rendimientos no se calculan: se corrigen al anotar el siguiente estado de cuenta.
        </p>
      )}
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className="mt-1 text-xs font-medium text-primary hover:underline">
        {abierto ? "Cerrar" : f.anotado ? "Actualizar saldo" : "Anotar saldo"}
      </button>
      {abierto && <Anotar f={f} onListo={() => { setAbierto(false); onCambio(); }} />}
    </li>
  );
}

/** `sede`: la sede elegida en el Dashboard (null = Grupo: las dos). Fonavi no tiene fondo mutuo. */
export function FondosMutuos({ sede }: { sede: number | null }) {
  const [fondos, setFondos] = useState<FondoSede[] | null>(null);
  const cargar = useCallback(() => { void getFondosMutuos().then((r) => setFondos(r.ok ? r.fondos : [])); }, []);
  useEffect(() => { cargar(); }, [cargar]);
  if (sede === 2) return null;
  if (fondos === null) return null;
  const lista = fondos.filter((f) => sede === null || f.businessId === sede);
  if (lista.length === 0) return null;
  const total = lista.every((f) => f.estimado !== null) ? lista.reduce((t, f) => t + (f.estimado ?? 0), 0) : null;
  return (
    <div className="mt-3 rounded-2xl bg-sky-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-gray-600"><PiggyBank className="h-4 w-4 text-sky-600" aria-hidden />Ahorrado en fondos mutuos</div>
        {lista.length > 1 && total !== null && <b className="text-xl font-semibold tabular-nums text-gray-900">{soles(total)}</b>}
      </div>
      <ul className="mt-1 divide-y divide-sky-100">
        {lista.map((f) => <Fila key={f.businessId} f={f} onCambio={cargar} />)}
      </ul>
      <p className="mt-1 text-[11px] text-gray-500">Es plata de ustedes que no está en el banco ni en la caja.</p>
    </div>
  );
}
