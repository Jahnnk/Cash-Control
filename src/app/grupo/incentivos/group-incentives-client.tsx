"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, CheckCircle2, XCircle, Copy, Check, Coffee } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getGroupIncentives, type GroupIncentives, type SedeIncentives } from "@/app/actions/group-incentives";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";

/**
 * Panel central de Bonos e Incentivos (pedido de Jahnn, jul-2026).
 * Principio: TRANSPARENCIA — los mismos números que ve cada admin en su
 * panel, juntos, más un resumen listo para compartir con el equipo
 * ("no queremos que piensen que les ocultamos información").
 */

function currentMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}
function todayLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}
function ddmm(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

const SEDE_CODE: Record<number, ScopeCode> = { 2: "fonavi", 3: "centro" };

/** El resumen COPIABLE para el equipo — números honestos, sin adornos. */
function buildShareText(data: GroupIncentives): string {
  const lines: string[] = [`🏆 Avance de Bonos e Incentivos · ${monthLabel(data.month)} (corte ${ddmm(todayLima())})`, ""];
  for (const s of data.sedes) {
    const p = s.progress;
    if (!p || p.ticketActual === null) {
      lines.push(`${s.sede.toUpperCase()}: aún sin días registrados este mes.`);
      continue;
    }
    lines.push(`${s.sede.toUpperCase()} (${p.daysLoaded} días registrados)`);
    lines.push(`• Ticket promedio: S/${p.ticketActual.toFixed(2)} — base S/${(s.ticketBase ?? 0).toFixed(2)}`);
    if (p.nivelAlcanzado) {
      lines.push(`• 🎉 Nivel alcanzado: ${p.nivelAlcanzado.nombre}`);
    }
    if (p.proximoNivel) {
      lines.push(`• Para ${p.proximoNivel.level.nombre}: faltan S/${p.proximoNivel.faltaSoles.toFixed(2)} de ticket (¡se puede!)`);
    }
    lines.push(`• Piso de tráfico (${p.traffic.floor}/día): ${p.traffic.cumple ? `✓ cumpliendo (${p.traffic.personasPorDia}/día)` : `✗ vamos en ${p.traffic.personasPorDia ?? 0}/día — sin el piso, la meta no cuenta`}`);
    if (s.mejorVendedor?.ganador) {
      lines.push(`• ☕ Mejor vendedor (va ganando el desayuno): ${s.mejorVendedor.ganador}${s.mvPeriodEnd ? ` (al ${ddmm(s.mvPeriodEnd)})` : ""}`);
    }
    lines.push("");
  }
  lines.push("Los bonos se calculan con estos mismos números y se pagan con la liquidación del cierre de mes. Cualquier duda, pregunten — aquí no hay letra chica. 💪");
  return lines.join("\n");
}

export function GroupIncentivesClient() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<GroupIncentives | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    const r = await getGroupIncentives(m);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    load(month);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month, load]);

  async function copyShare() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildShareText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* sin clipboard — queda la selección manual */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" /> Bonos e Incentivos
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            El avance del programa de ticket promedio, con los MISMOS números que ve cada admin en su
            panel. La transparencia es el motor: comparte el resumen con el equipo.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>
      ) : error || !data ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <>
          {/* Avance por sede */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.sedes.map((s) => <SedeCard key={s.businessId} s={s} />)}
          </div>

          {/* Para compartir con el equipo */}
          <section className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">📣 Para compartir con el equipo</h2>
                <p className="text-[11px] text-gray-500">
                  Cópialo y pégalo en el grupo (Slack/WhatsApp) o pásaselo a los admins — números
                  honestos, los mismos de esta pantalla.
                </p>
              </div>
              <button
                onClick={copyShare}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
              >
                {copied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar resumen</>}
              </button>
            </div>
            <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap font-sans">
              {buildShareText(data)}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}

function SedeCard({ s }: { s: SedeIncentives }) {
  const p = s.progress;
  const code = SEDE_CODE[s.businessId];
  const theme = code ? BUSINESS_THEMES[code] : null;
  const atrasado = s.ultimoRegistro !== null && (() => {
    const ayer = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
    ayer.setDate(ayer.getDate() - 1);
    return s.ultimoRegistro < ayer.toLocaleDateString("en-CA");
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" style={theme ? { borderTopColor: theme.color, borderTopWidth: 3 } : undefined}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-gray-900">{s.sede}</h3>
        <div className="flex items-center gap-2">
          {s.liquidado && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">🔒 mes liquidado</span>}
          <span className="text-[11px] text-gray-400">
            registro al {ddmm(s.ultimoRegistro)}{atrasado && <span className="text-amber-600"> ⚠</span>}
          </span>
        </div>
      </div>

      {!p || p.ticketActual === null ? (
        <div className="text-sm text-gray-400 py-6 text-center">Sin días registrados este mes.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase text-gray-500">Ticket sin delivery</div>
              <div className="text-2xl font-black text-gray-900">{formatCurrency(p.ticketActual)}</div>
              <div className="text-[11px] text-gray-500">
                Base {formatCurrency(s.ticketBase ?? 0)}
                {p.deltaActual !== null && (
                  <span className={`ml-1 font-semibold ${p.deltaActual > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    ({p.deltaActual >= 0 ? "+" : ""}{formatCurrency(p.deltaActual)})
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-500">Nivel alcanzado</div>
              <div className={`text-lg font-bold ${p.nivelAlcanzado ? "text-emerald-600" : "text-gray-400"}`}>
                {p.nivelAlcanzado?.nombre ?? "Aún sin nivel"}
              </div>
              {p.proximoNivel && (
                <div className="text-[11px] text-gray-500">
                  Para {p.proximoNivel.level.nombre}: faltan <strong>{formatCurrency(p.proximoNivel.faltaSoles)}</strong>
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-500">Piso de tráfico</div>
              <div className={`text-sm font-bold flex items-center gap-1 ${p.traffic.cumple ? "text-emerald-600" : "text-red-600"}`}>
                {p.traffic.cumple ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                {p.traffic.personasPorDia ?? "—"}/día (mín. {p.traffic.floor})
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-500">Pozo proyectado</div>
              <div className="text-sm font-bold text-gray-900">{p.pozoProyectado !== null ? formatCurrency(p.pozoProyectado) : "—"}</div>
              <div className="text-[11px] text-gray-400">techo 40% de la utilidad nueva</div>
            </div>
          </div>

          {/* Niveles compactos */}
          <table className="w-full text-xs mt-3 border-t border-gray-100">
            <tbody>
              {p.porNivel.map((n) => {
                const isCurrent = p.nivelAlcanzado?.nombre === n.level.nombre;
                return (
                  <tr key={n.level.nombre} className={`border-b border-gray-50 ${isCurrent ? "bg-emerald-50/60" : ""}`}>
                    <td className="py-1.5 text-gray-700">{isCurrent && "✅ "}{n.level.nombre}</td>
                    <td className="py-1.5 text-right text-gray-500">meta {formatCurrency((s.ticketBase ?? 0) + n.level.delta)}</td>
                    <td className="py-1.5 text-right font-medium text-gray-900">bonos {formatCurrency(n.sumaBonos)}</td>
                    <td className={`py-1.5 text-right ${n.colchon !== null && n.colchon >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {n.colchon !== null ? `colchón ${formatCurrency(n.colchon)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mejor vendedor — el del desayuno */}
          <div className="mt-3 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2">
            <div className="text-[11px] uppercase text-amber-800 font-semibold flex items-center gap-1">
              <Coffee className="w-3 h-3" /> Mejor vendedor {s.mvPeriodEnd ? `(al ${ddmm(s.mvPeriodEnd)})` : ""}
            </div>
            {s.mejorVendedor?.ganador ? (
              <div className="text-sm text-gray-900 mt-0.5">
                🥇 <strong>{s.mejorVendedor.ganador}</strong>
                {s.mejorVendedor.ranking.filter((r) => r.elegible).slice(1, 3).map((r, i) => (
                  <span key={r.seller} className="text-gray-500 text-xs"> · {i === 0 ? "🥈" : "🥉"} {r.seller}</span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 mt-0.5">
                Sin ranking aún — se calcula con el reporte semanal de ventas por trabajador.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
