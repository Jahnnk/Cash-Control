"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, CheckCircle2, XCircle, Copy, Check, Coffee, FileDown, FileSpreadsheet } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getGroupIncentives, type GroupIncentives, type SedeIncentives } from "@/app/actions/group-incentives";
import { getPagosDelMes } from "@/app/actions/liquidations";
import { SeccionDesplegable } from "@/components/productos/ui";
import { armarReporte, conPremio } from "@/lib/incentives/reporte-bonos";
import type { PagosDelMes } from "@/lib/incentives/reporte-bonos-tipos";
import { PagoSedePanel } from "./pagos-panel";
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
      trafficFloor: p?.traffic.floor ?? null,
      personasPorDia: p?.traffic.personasPorDia ?? null,
      trafficCumple: p?.traffic.cumple ?? false,
      candadoVentas: p?.candadoVentas ?? null,
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
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Lo que se reparte (solo mes completo). `premio`: a quién se le suma el
  // premio al mejor vendedor; sin tocar = el que sugiere Byte.
  const [pagos, setPagos] = useState<PagosDelMes | null>(null);
  const [pagosLoading, setPagosLoading] = useState(false);
  const [pagosError, setPagosError] = useState<string | null>(null);
  const [premio, setPremio] = useState<Record<number, string | null>>({});

  const load = useCallback(async (m: string, range?: { from: string; to: string }) => {
    setLoading(true);
    const r = await getGroupIncentives(m, range);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    // Otro mes u otro modo: lo que se reparte ya no corresponde.
    setPagos(null); setPagosError(null); setPremio({});
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

  /** Trae lo que se reparte (y comprueba el equipo y las horas contra Planilla). */
  const cargarPagos = useCallback(async (d: GroupIncentives): Promise<PagosDelMes | null> => {
    setPagosLoading(true);
    setPagosError(null);
    const sugeridos = Object.fromEntries(d.sedes.map((x) => [x.businessId, x.mejorVendedor?.ganador ?? null]));
    const r = await getPagosDelMes(d.month, sugeridos);
    setPagosLoading(false);
    if (!r.ok) { setPagosError(r.error); return null; }
    setPagos(r.data);
    return r.data;
  }, []);

  /** Las cifras de pago con el premio ya puesto a quien corresponde. */
  const pagosVista = useMemo(() => {
    if (!pagos) return null;
    return {
      ...pagos,
      sedes: pagos.sedes.map((p) => conPremio(p, p.businessId in premio ? premio[p.businessId] : p.mejorVendedor.sugeridoEquipo)),
    };
  }, [pagos, premio]);

  /** Arma el reporte completo (con gráficos) para el PDF o el Excel. */
  async function prepararReporte() {
    if (!data) throw new Error("Sin datos");
    let pv = pagosVista;
    if (!data.range && !pv) {
      const cargados = await cargarPagos(data);
      if (!cargados) throw new Error("No se pudo calcular el pago del mes. Revisa el mensaje de la sección «Pago a repartir».");
      pv = {
        ...cargados,
        sedes: cargados.sedes.map((p) => conPremio(p, p.mejorVendedor.sugeridoEquipo)),
      };
    }
    const reporte = armarReporte(
      data, data.range ? null : pv, periodoLabel(data),
      new Date().toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short", hour12: false }),
    );
    const [{ graficosDelReporte }, { svgAPng }] = await Promise.all([
      import("@/lib/incentives/reporte-bonos-graficos"),
      import("@/lib/incentives/svg-to-png"),
    ]);
    const svgs = graficosDelReporte(reporte);
    const png = async (d: typeof svgs.comparativo) => (d ? svgAPng(d, 2.5) : null);
    const graficos = {
      comparativo: await png(svgs.comparativo),
      porSede: Object.fromEntries(
        await Promise.all(Object.entries(svgs.porSede).map(async ([id, g]) => [
          Number(id), { ticket: await png(g.ticket), ventas: await png(g.ventas), bonos: await png(g.bonos) },
        ])),
      ),
    };
    return { reporte, graficos };
  }

  function descargar(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport(formato: "pdf" | "xlsx") {
    if (!data) return;
    setExporting(formato);
    setExportError(null);
    try {
      const { reporte, graficos } = await prepararReporte();
      if (formato === "pdf") {
        const { renderBonosReportPdf } = await import("@/lib/incentives/bonos-report-pdf");
        const { blob, filename } = renderBonosReportPdf(reporte, graficos);
        descargar(blob, filename);
      } else {
        const { renderBonosReportXlsx } = await import("@/lib/incentives/bonos-report-xlsx");
        const { blob, filename } = await renderBonosReportXlsx(reporte, graficos);
        descargar(blob, filename);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "No se pudo generar el reporte.");
    } finally {
      setExporting(null);
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
            onClick={() => handleExport("pdf")}
            disabled={!data || exporting !== null}
            title="Reporte completo en PDF: resumen, metas explicadas, detalle día por día, gráficos, pago por persona y hoja de transferencias"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
          >
            <FileDown className="w-3.5 h-3.5" /> {exporting === "pdf" ? "Generando…" : "Exportar PDF"}
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            disabled={!data || exporting !== null}
            title="El mismo reporte en Excel, para trabajar con él: transferencias para marcar, pagos por persona, metas y detalle diario"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary bg-white border border-primary hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {exporting === "xlsx" ? "Generando…" : "Exportar Excel"}
          </button>
        </div>
      </div>

      {exportError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{exportError}</div>
      )}

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

          {/* Pago a repartir (solo mes completo) — plegado, con el resumen a la vista */}
          {data.range === null && (
            <SeccionDesplegable
              titulo="💰 Pago a repartir y a quién (para Kelly)"
              subtitulo="Lo que se transfiere a cada persona, con las horas de Planilla. Es lo mismo que lleva el reporte."
              resumen={
                pagosVista ? (
                  <span className="text-xs text-gray-700">
                    {pagosVista.sedes.map((p) => `${p.sede} ${formatCurrency(p.totalBonos)}`).join(" · ")} ·{" "}
                    <strong>Total {formatCurrency(pagosVista.sedes.reduce((t, p) => t + p.totalBonos, 0))}</strong>
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Se calcula al abrir: comprueba el equipo y las horas contra Planilla.</span>
                )
              }
              onAbrir={() => { if (!pagos && !pagosLoading) void cargarPagos(data); }}
            >
              {pagosLoading && <div className="text-sm text-gray-500 py-6 text-center">Comprobando el equipo y las horas contra Planilla…</div>}
              {pagosError && <div className="text-sm text-red-600 py-3">{pagosError}</div>}
              {pagos && pagos.errores.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  No se pudo calcular el pago de: {pagos.errores.join(" · ")}
                </div>
              )}
              {pagosVista && (
                <div className="space-y-4">
                  {pagosVista.sedes.map((p) => (
                    <PagoSedePanel
                      key={p.businessId}
                      pago={p}
                      elegido={p.mejorVendedor.usado}
                      onElegir={(n) => setPremio((prev) => ({ ...prev, [p.businessId]: n }))}
                    />
                  ))}
                  <button
                    onClick={() => void cargarPagos(data)}
                    disabled={pagosLoading}
                    className="text-xs text-primary underline disabled:opacity-50"
                  >
                    Volver a comprobar contra Planilla
                  </button>
                </div>
              )}
            </SeccionDesplegable>
          )}

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
            {p.candadoVentas && p.candadoVentas.meta !== null ? (
              <div>
                <div className="text-[11px] uppercase text-gray-500">Meta de ventas{p.candadoVentas.provisional ? " (prov.)" : ""}</div>
                <div className={`text-sm font-bold flex items-center gap-1 ${p.candadoVentas.cumple || p.candadoVentas.enCamino ? "text-emerald-600" : "text-red-600"}`}>
                  {p.candadoVentas.cumple || p.candadoVentas.enCamino ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {formatCurrency(p.candadoVentas.ventas)} de {formatCurrency(p.candadoVentas.meta)}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-[11px] uppercase text-gray-500">Piso de tráfico</div>
                <div className={`text-sm font-bold flex items-center gap-1 ${p.traffic.cumple ? "text-emerald-600" : "text-red-600"}`}>
                  {p.traffic.cumple ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {p.traffic.personasPorDia ?? "—"}/día{p.traffic.floor !== null ? ` (mín. ${p.traffic.floor})` : ""}
                </div>
              </div>
            )}
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
