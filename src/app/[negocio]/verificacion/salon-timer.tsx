"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, Store, Utensils, Loader2, X, Check } from "lucide-react";
import {
  getServiceTimings,
  startTiming,
  stopTiming,
  discardTiming,
  type TimingView,
} from "@/app/actions/service-timing";
import {
  formatElapsed,
  timingTraffic,
  summarizeKind,
  elapsedSeconds,
  type ServiceKind,
  type TimingTraffic,
} from "@/lib/service-timing";
import { useToast } from "@/components/toast-provider";

const DOT: Record<TimingTraffic, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-400",
  rojo: "bg-red-500",
};
const TEXT: Record<TimingTraffic, string> = {
  verde: "text-emerald-600",
  ambar: "text-amber-600",
  rojo: "text-red-600",
};
const KIND_META: Record<ServiceKind, { label: string; icon: typeof Store; verb: string }> = {
  mostrador: { label: "Mostrador", icon: Store, verb: "Despachado" },
  mesa: { label: "Mesa", icon: Utensils, verb: "Servido" },
};

/**
 * Cronómetro de tiempos de atención para el encargado de salón.
 * Mostrador (comanda→despacho) y mesa (pedido→servido), varios a la vez.
 * El tiempo lo lleva el servidor; aquí solo se refresca el reloj en vivo.
 */
export function SalonTimer() {
  const { showToast } = useToast();
  const [view, setView] = useState<TimingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<ServiceKind | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [now, setNow] = useState<number>(() => Date.now());
  const [showDone, setShowDone] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await getServiceTimings();
    if (r.ok) setView(r.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar
    load();
  }, [load]);

  // Reloj en vivo: un solo intervalo que refresca todos los cronómetros.
  useEffect(() => {
    const hasRunning = (view?.running.length ?? 0) > 0;
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view?.running.length]);

  async function handleStart(kind: ServiceKind) {
    setStarting(kind);
    const r = await startTiming({ kind, label: label.trim() || null });
    setStarting(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setLabel("");
    labelRef.current?.focus();
    await load();
  }

  async function handleStop(id: string) {
    setBusyId(id);
    const r = await stopTiming({ id });
    setBusyId(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    const secs = r.timing.durationSeconds ?? 0;
    showToast(`Atención cerrada: ${formatElapsed(secs)}`, "success");
    await load();
  }

  async function handleDiscard(id: string) {
    setBusyId(id);
    const r = await discardTiming({ id });
    setBusyId(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    await load();
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
      </div>
    );
  }
  if (!view) return null;

  const metas = view.metas;
  const sumMost = summarizeKind(view.completedToday, "mostrador", metas.mostrador);
  const sumMesa = summarizeKind(view.completedToday, "mesa", metas.mesa);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div>
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Timer className="w-4 h-4 text-primary" />
          Cronómetro de atención
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
          Mostrador: desde la comanda hasta el despacho (meta &lt;{metas.mostrador ?? "—"} min).
          Mesa: desde que tomas el pedido hasta servir (meta &lt;{metas.mesa ?? "—"} min).
          Puedes tener varios a la vez. El promedio del día alimenta solo el KPI.
        </div>
      </div>

      {!view.tableReady && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Falta la migración del cronómetro (tabla service_timings) — avísale a Jahnn.
        </div>
      )}

      {/* Iniciar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={labelRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Mesa # o cliente (opcional)"
          maxLength={40}
          className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={() => handleStart("mostrador")}
          disabled={starting !== null || !view.tableReady}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
        >
          {starting === "mostrador" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Store className="w-4 h-4" />}
          Mostrador
        </button>
        <button
          onClick={() => handleStart("mesa")}
          disabled={starting !== null || !view.tableReady}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
        >
          {starting === "mesa" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Utensils className="w-4 h-4" />}
          Mesa
        </button>
      </div>

      {/* En curso */}
      {view.running.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">En curso</div>
          {view.running.map((r) => {
            const secs = elapsedSeconds(r.startedAt, now);
            const meta = r.kind === "mostrador" ? metas.mostrador : metas.mesa;
            const tr = timingTraffic(secs, meta);
            const KindIcon = KIND_META[r.kind].icon;
            return (
              <div key={r.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${tr === "rojo" ? "border-red-200 bg-red-50" : tr === "ambar" ? "border-amber-200 bg-amber-50" : "border-gray-200"}`}>
                <KindIcon className="w-4 h-4 text-gray-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{r.label}</div>
                  <div className="text-[10px] uppercase text-gray-400">{KIND_META[r.kind].label}</div>
                </div>
                <div className={`text-xl font-black tabular-nums ${TEXT[tr]}`}>{formatElapsed(secs)}</div>
                <button
                  onClick={() => handleStop(r.id)}
                  disabled={busyId === r.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 shrink-0"
                >
                  {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {KIND_META[r.kind].verb}
                </button>
                <button
                  onClick={() => handleDiscard(r.id)}
                  disabled={busyId === r.id}
                  title="Descartar (no cuenta al promedio)"
                  className="text-gray-300 hover:text-red-500 p-1 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Resumen de hoy */}
      <div className="grid grid-cols-2 gap-2">
        {[sumMost, sumMesa].map((s) => (
          <div key={s.kind} className="rounded-lg border border-gray-200 p-3">
            <div className="text-[10px] uppercase text-gray-400">{KIND_META[s.kind].label} · hoy</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-lg font-black ${s.avgMin !== null ? TEXT[s.traffic] : "text-gray-300"}`}>
                {s.avgMin !== null ? `${s.avgMin} min` : "—"}
              </span>
              {s.avgMin !== null && <span className={`inline-block w-2 h-2 rounded-full ${DOT[s.traffic]}`} />}
            </div>
            <div className="text-[10px] text-gray-400">
              {s.count} atención{s.count === 1 ? "" : "es"}
              {s.overMeta > 0 && <span className="text-red-500"> · {s.overMeta} sobre meta</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Detalle de hoy */}
      {view.completedToday.length > 0 && (
        <div>
          <button onClick={() => setShowDone((v) => !v)} className="text-[11px] text-gray-500 hover:text-gray-700 underline">
            {showDone ? "Ocultar" : "Ver"} atenciones de hoy ({view.completedToday.length})
          </button>
          {showDone && (
            <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
              {view.completedToday.map((r) => {
                const secs = r.durationSeconds ?? 0;
                const meta = r.kind === "mostrador" ? metas.mostrador : metas.mesa;
                const tr = timingTraffic(secs, meta);
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs border-t border-gray-50 py-1">
                    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT[tr]}`} />
                    <span className="text-gray-400 uppercase text-[10px] w-16 shrink-0">{KIND_META[r.kind].label}</span>
                    <span className="text-gray-700 truncate flex-1">{r.label}</span>
                    <span className={`font-semibold tabular-nums ${TEXT[tr]}`}>{formatElapsed(secs)}</span>
                    <button onClick={() => handleDiscard(r.id)} disabled={busyId === r.id} title="Descartar esta medición" className="text-gray-300 hover:text-red-500 p-0.5 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
