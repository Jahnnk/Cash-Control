"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getVerificationView,
  signDay,
  type VerificationDay,
} from "@/app/actions/verifications";
import { useToast } from "@/components/toast-provider";
import { SalonTimer } from "./salon-timer";

/**
 * Verificación del conteo diario — la SEGUNDA FIRMA (mando medio).
 * Una pantalla, un propósito: confirmar que las personas registradas
 * por el administrador cuadran con la realidad del salón y el cierre
 * de Byte. Confirmar u observar con nota. Nada más se ve desde aquí.
 */

function dayLabel(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function VerificacionPage() {
  const { showToast } = useToast();
  const [days, setDays] = useState<VerificationDay[]>([]);
  const [canSign, setCanSign] = useState(false);
  const [tableReady, setTableReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notaFor, setNotaFor] = useState<string | null>(null);
  const [nota, setNota] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getVerificationView();
    if (r.ok) { setDays(r.days); setCanSign(r.canSign); setTableReady(r.tableReady); setError(null); }
    else setError(r.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  async function handleSign(date: string, status: "confirmado" | "observado") {
    setBusy(date);
    const r = await signDay({ date, status, nota: status === "observado" ? nota : null });
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(status === "confirmado" ? "Conteo confirmado" : "Observación registrada", "success");
    setNotaFor(null); setNota("");
    await load();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Encargado de salón
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Dos herramientas: durante el turno, cronometra los tiempos de atención;
          al cierre, firma que el conteo de personas cuadra con la realidad.
        </p>
      </div>

      {/* Herramienta de turno: cronómetro de tiempos de atención */}
      <SalonTimer />

      {/* Cierre del día: la segunda firma del conteo */}
      <div>
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Verificación del conteo diario
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Tu firma confirma que las <strong>personas atendidas</strong> registradas cuadran con el
          salón y el cierre de Byte. Si algo no cuadra, obsérvalo con una nota — se resuelve antes
          de la liquidación del mes. Ese número define el ticket promedio y los bonos de todos.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <>
          {!tableReady && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Falta la migración de verificaciones — avísale a Jahnn. Puedes ver los registros pero aún no firmar.
            </div>
          )}
          {days.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
              El administrador aún no registra ningún día.
            </div>
          ) : (
            <div className="space-y-3">
              {days.map((d) => (
                <div key={d.date} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{dayLabel(d.date)}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        <strong>{d.personas ?? "—"}</strong> personas · venta {d.revenue !== null ? formatCurrency(d.revenue) : "—"} · ticket{" "}
                        <strong>{d.ticket !== null ? formatCurrency(d.ticket) : "—"}</strong>
                      </div>
                    </div>
                    {d.verification ? (
                      <div className={`text-xs rounded-full px-3 py-1.5 border font-medium ${d.verification.status === "confirmado" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                        {d.verification.status === "confirmado" ? "✓ Confirmado" : "⚠ Observado"}
                        {d.verification.nota && <span className="font-normal"> — {d.verification.nota}</span>}
                      </div>
                    ) : canSign && tableReady ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSign(d.date, "confirmado")}
                          disabled={busy === d.date}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                        >
                          {busy === d.date ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Confirmo el conteo
                        </button>
                        <button
                          onClick={() => { setNotaFor(notaFor === d.date ? null : d.date); setNota(""); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 rounded-lg"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Observar
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Pendiente de verificación</span>
                    )}
                  </div>
                  {notaFor === d.date && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder="¿Qué no cuadró? (ej. conté ~60 personas y están registradas 48)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs"
                        autoFocus
                        maxLength={200}
                      />
                      <button
                        onClick={() => handleSign(d.date, "observado")}
                        disabled={busy === d.date || !nota.trim()}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
                      >
                        Registrar observación
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
