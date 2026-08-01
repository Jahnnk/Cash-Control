"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, CheckCircle2, XCircle, Copy, Check, Coffee, FileDown } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getGroupIncentives, type GroupIncentives, type SedeIncentives } from "@/app/actions/group-incentives";
import { BUSINESS_THEMES, type ScopeCode } from "@/lib/business-theme";
import { buildSedeShareLines, buildShareHeader, SHARE_FOOTER } from "@/lib/incentives/share-text";

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

/** Etiqueta legible del periodo (mes o rango) — para el título del PDF. */
function periodoLabel(data: GroupIncentives): string {
  if (data.range) return `del ${ddmm(data.range.from)} al ${ddmm(data.range.to)} de ${data.range.to.slice(0, 4)}`;
  return monthLabel(data.month);
}

/** Días naturales del periodo — para la nota "X de Y días registrados". */
function daysInPeriod(data: GroupIncentives): number {
  if (data.range) {
    const a = new Date(data.range.from + "T12:00:00Z").getTime();
    const b = new Date(data.range.to + "T12:00:00Z").getTime();
    return Math.round((b - a) / 86400000) + 1;
  }
  const [y, m] = data.month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

const SEDE_CODE: Record<number, ScopeCode> = { 2: "fonavi", 3: "centro" };

/** El resumen COPIABLE para el equipo — misma lib que el Panel de Sede. */
function buildShareText(data: GroupIncentives): string {
  const periodo = data.range
    ? `del ${ddmm(data.range.from)} al ${ddmm(data.range.to)}`
    : monthLabel(data.month);
  const lines: string[] = [buildShareHeader(periodo, ddmm(todayLima())), ""];
  for (const s of data.sedes) {
    const p = s.progress;
    lines.push(...buildSedeShareLines({
      sede: s.sede,
      daysLoaded: p?.daysLoaded ?? 0,
      ticketActual: p?.ticketActual ?? null,
      ticketBase: s.ticketBase ?? 0,
      nivelAlcanzado: p?.nivelAlcanzado?.nombre ?? null,
      proximoNivel: p?.proximoNivel ? { nombre: p.proximoNivel.level.nombre, faltaSoles: p.proximoNivel.faltaSoles } : null,
      trafficFloor: p?.traffic.floor ?? 0,
      personasPorDia: p?.traffic.personasPorDia ?? null,
      trafficCumple: p?.traffic.cumple ?? false,
      mejorVendedor: s.mejorVendedor?.ganador ?? null,
      mvPeriodEnd: s.mvPeriodEnd,
    }));
    lines.push("");
  }
  lines.push(SHARE_FOOTER);
  return lines.join("\n");
}

export function GroupIncentivesClient() {
  const [month, setMonth] = useState(currentMonth());
  // Modo rango: para pilotos y premios semanales (ej. el desayuno de la
  // primera semana) — el bono oficial sigue siendo mensual.
  const [mode, setMode] = useState<"mes" | "rango">("mes");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<GroupIncentives | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (m: string, range?: { from: string; to: string }) => {
    setLoading(true);
    const r = await getGroupIncentives(m, range);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    if (mode === "mes") load(month);
    else if (from && to) load(from.slice(0, 7), { from, to });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month, mode, from, to, load]);

  async function copyShare() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildShareText(data));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* sin clipboard — queda la selección manual */ }
  }

  async function handleExportPdf() {
    if (!data) return;
    setExporting(true);
    try {
      const { renderPilotReportPdf } = await import("@/lib/incentives/pilot-report-pdf");
      const { blob, filename } = renderPilotReportPdf({
        periodoLabel: periodoLabel(data),
        daysInPeriod: daysInPeriod(data),
        generatedAtLabel: new Date().toLocaleString("es-PE", {
          timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short",
        }),
        sedes: data.sedes.map((s) => ({
          sede: s.sede,
          progress: s.progress,
          ticketBase: s.ticketBase,
          mejorVendedor: s.mejorVendedor,
          mvPeriodStart: s.mvPeriodStart,
          mvPeriodEnd: s.mvPeriodEnd,
          minMesas: s.minMesas,
          noElegibles: s.noElegibles,
          dailies: s.dailies,
        })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            <button
              onClick={() => setMode("mes")}
              className={`px-3 py-2 ${mode === "mes" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Mes
            </button>
            <button
              onClick={() => setMode("rango")}
              className={`px-3 py-2 ${mode === "rango" ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              title="Para pilotos y premios semanales (ej. el desayuno de la primera semana)"
            >
              Rango
            </button>
          </div>
          {mode === "mes" ? (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
            />
          ) : (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-xs bg-white" />
              <span className="text-xs text-gray-400">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-xs bg-white" />
            </>
          )}
          <button
            onClick={handleExportPdf}
            disabled={!data || exporting}
            title="Reporte con el detalle diario completo de ambas sedes, listo para entregar a cada administrador"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
          >
            <FileDown className="w-3.5 h-3.5" /> {exporting ? "Generando…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {mode === "rango" && (!from || !to) && (
        <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
          Elige el rango (ej. la semana piloto) — el avance y el mejor vendedor serán SOLO de esos días.
          El nivel y el bono oficial se siguen midiendo por mes completo.
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>
      ) : error || !data ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <>
          {/* Avance por sede */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.sedes.map((s) => <SedeCard key={s.businessId} s={s} isRange={data.range !== null} />)}
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

function SedeCard({ s, isRange }: { s: SedeIncentives; isRange: boolean }) {
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
              <div className="text-[11px] uppercase text-gray-500">Ticket del programa</div>
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
            {!isRange && (
              <div>
                <div className="text-[11px] uppercase text-gray-500">Pozo proyectado</div>
                <div className="text-sm font-bold text-gray-900">{p.pozoProyectado !== null ? formatCurrency(p.pozoProyectado) : "—"}</div>
                <div className="text-[11px] text-gray-400">techo 40% de la utilidad nueva</div>
              </div>
            )}
          </div>

          {isRange && (
            <div className="text-[11px] text-gray-400 mt-2">
              Vista por rango: el nivel mostrado es el ritmo de ESTOS días. El nivel oficial, el pozo
              y los bonos se miden por mes completo en la liquidación.
            </div>
          )}

          {/* Niveles compactos (constructo mensual — no aplica al rango) */}
          {!isRange && (
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
          )}

          {/* Mejor vendedor — el del desayuno */}
          <div className="mt-3 bg-amber-50/60 border border-amber-100 rounded-lg px-3 py-2">
            <div className="text-[11px] uppercase text-amber-800 font-semibold flex items-center gap-1">
              <Coffee className="w-3 h-3" /> Mejor vendedor {s.mvPeriodEnd ? `(${s.mvPeriodStart ? `${ddmm(s.mvPeriodStart)}–` : "al "}${ddmm(s.mvPeriodEnd)})` : ""}
            </div>
            {s.mejorVendedor?.ganador ? (
              <div className="text-sm text-gray-900 mt-0.5">
                🥇 <strong>{s.mejorVendedor.ganador}</strong>
                {s.mejorVendedor.ranking.filter((r) => r.elegible).slice(1, 3).map((r, i) => (
                  <span key={r.seller} className="text-gray-500 text-xs"> · {i === 0 ? "🥈" : "🥉"} {r.seller}</span>
                ))}
                {s.noElegibles > 0 && (
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {s.noElegibles} vendedor{s.noElegibles === 1 ? "" : "es"} fuera del ranking por atender
                    menos de {s.minMesas} mesas en el periodo.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 mt-0.5">
                {isRange
                  ? "Sin reporte de trabajadores que caiga DENTRO de este rango. Pídele al admin exportar de Byte «Ventas por Trabajador» con este rango exacto y subirlo en su panel — un reporte acumulado no se puede recortar sin mentir."
                  : "Sin ranking aún — se calcula con el reporte semanal de ventas por trabajador."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
