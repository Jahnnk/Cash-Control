"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Trophy, Upload, AlertTriangle, CheckCircle2, XCircle, Loader2, Save, Users, Flag, Pencil, ClipboardList, Settings2,
} from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import {
  getIncentiveDashboard,
  saveDailyEntry,
  getUpsellFocusCandidates,
  setFlagStatus,
  reopenFlag,
  type IncentiveDashboard,
  type UpsellCandidate,
  type DashboardDaily,
} from "@/app/actions/incentives";
import { saveDailyKpis } from "@/app/actions/kpis";
import { useToast } from "@/components/toast-provider";
import { ImportControlModal } from "./import-control-modal";
import { KpisWeekSection } from "./kpis-week";
import { LiquidationModal } from "./liquidation-modal";
import { MermaDetailModal } from "./merma-detail-modal";
import { MejorVendedorSection } from "./mejor-vendedor-section";
import { BaseModal } from "./base-modal";
import { AtelierPanel } from "./atelier-panel";
import { VentasImportModal } from "./ventas-import-modal";

/**
 * Incentivos por Upselling · Tablero del administrador (política jun-2026).
 * Responde las preguntas del admin: ¿cómo va el ticket vs la meta?
 * ¿qué nivel alcanzamos y cuánto falta? ¿el bono cabe en el pozo?
 * ¿cumplimos el piso de tráfico? ¿qué banderas hay que revisar?
 */

function currentMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}
function todayLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export default function PanelPage() {
  // Sede desde el segmento [negocio] de la ruta. Atelier (B2B) tiene su
  // propio panel: registro de venta/pedidos/mermas, sin programa de
  // incentivos ni KPIs de salón.
  const params = useParams<{ negocio: string }>();
  if (params.negocio === "atelier") return <AtelierPanel />;
  return <IncentivosPage />;
}

function IncentivosPage() {
  const params = useParams<{ negocio: string }>();
  const sedeLabel = params.negocio === "fonavi" ? "Fonavi" : "Centro";
  const { showToast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<IncentiveDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showVentas, setShowVentas] = useState(false);
  const [showLiquidation, setShowLiquidation] = useState(false);
  const [showBase, setShowBase] = useState(false);
  const [focus, setFocus] = useState<{ month: string; candidates: UpsellCandidate[] } | null>(null);

  // Registro diario (incentivos + KPIs — un solo ritual)
  const [fecha, setFecha] = useState(todayLima());
  const [personas, setPersonas] = useState("");
  const [venta, setVenta] = useState("");
  const [items, setItems] = useState("");
  const [nps, setNps] = useState("");
  const [mermas, setMermas] = useState("");
  const [tiempo, setTiempo] = useState("");        // mostrador
  const [tiempoMesa, setTiempoMesa] = useState(""); // mesa
  const [saving, setSaving] = useState(false);
  const [weekRefresh, setWeekRefresh] = useState(0);
  const [showMermaDetail, setShowMermaDetail] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    const r = await getIncentiveDashboard(m);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    load(month);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month, load]);

  useEffect(() => {
    (async () => {
      const r = await getUpsellFocusCandidates();
      if (r.ok) setFocus({ month: r.month, candidates: r.candidates });
    })();
  }, []);

  // Al elegir la fecha, mostrar los tiempos que YA existen para ese día
  // (los que midió el encargado con el cronómetro). Antes el formulario
  // salía vacío y el admin no los veía — "no me deja acceder al ítem".
  // En modo edición no aplica: startEdit ya cargó todos los campos.
  const dayRecord = data?.dailies.find((d) => d.date === fecha) ?? null;
  useEffect(() => {
    if (editingDate !== null) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reflejar lo medido al cambiar de día */
    setTiempo(dayRecord?.tiempoMin != null ? String(dayRecord.tiempoMin) : "");
    setTiempoMesa(dayRecord?.tiempoMesaMin != null ? String(dayRecord.tiempoMesaMin) : "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fecha, dayRecord?.tiempoMin, dayRecord?.tiempoMesaMin, editingDate]);

  function clearForm() {
    setPersonas(""); setVenta(""); setItems(""); setNps(""); setMermas(""); setTiempo(""); setTiempoMesa("");
    setEditingDate(null);
    setFecha(todayLima());
  }

  /** Precarga el formulario con los datos de un día para corregirlos. */
  function startEdit(d: DashboardDaily) {
    setFecha(d.date);
    setPersonas(d.personas !== null ? String(d.personas) : "");
    setVenta(d.revenue !== null ? String(d.revenue) : "");
    setItems(d.items !== null ? String(d.items) : "");
    setNps(d.nps !== null ? String(d.nps) : "");
    setMermas(d.mermasSoles !== null ? String(d.mermasSoles) : "");
    setTiempo(d.tiempoMin !== null ? String(d.tiempoMin) : "");
    setTiempoMesa(d.tiempoMesaMin !== null ? String(d.tiempoMesaMin) : "");
    setEditingDate(d.date);
  }

  async function handleSaveDay() {
    setSaving(true);
    const r = await saveDailyEntry({
      date: fecha,
      personas: Number(personas),
      revenue: Number(venta),
      items: items.trim() === "" ? null : Number(items),
    });
    if (!r.ok) { setSaving(false); showToast(r.error, "error"); return; }
    // KPIs del mismo día (NPS, mermas, tiempos) — si se llenó alguno o se edita.
    if (editingDate !== null || nps.trim() !== "" || mermas.trim() !== "" || tiempo.trim() !== "" || tiempoMesa.trim() !== "") {
      const rk = await saveDailyKpis({
        date: fecha,
        nps: nps.trim() === "" ? null : Number(nps),
        mermasSoles: mermas.trim() === "" ? null : Number(mermas),
        tiempoMin: tiempo.trim() === "" ? null : Number(tiempo),
        tiempoMesaMin: tiempoMesa.trim() === "" ? null : Number(tiempoMesa),
      });
      if (!rk.ok) { setSaving(false); showToast(rk.error, "error"); return; }
    }
    setSaving(false);
    if (r.firmaAnulada) {
      showToast("Día corregido. Ojo: la firma del verificador se anuló porque cambiaron los números — debe volver a firmar.", "success");
    } else {
      showToast(editingDate !== null ? "Día corregido" : "Día registrado", "success");
    }
    clearForm();
    setWeekRefresh((v) => v + 1);
    await load(month);
  }

  const p = data?.progress ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Panel de Sede
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Registro diario, KPIs, incentivos por upselling y controles — todo en un solo lugar.
            El bono se paga solo con la venta nueva, nunca con la utilidad de hoy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
          />
          {data && !data.isAdminSession && (
            <button
              onClick={() => setShowLiquidation(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
              title="Liquidación del mes: congela el resultado y genera el acta de pago (solo dirección)"
            >
              🔒 Liquidación
            </button>
          )}
          <button
            onClick={() => setShowVentas(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
            title="Reporte semanal de Ventas de Byte — alimenta el acumulado del mes y los comparativos del deck"
          >
            <Upload className="w-3.5 h-3.5" />
            Ventas Byte
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" />
            Subir reportes de control
          </button>
        </div>
      </div>

      {/* Aviso: ayer sin registrar (el sistema vive de ese hábito) */}
      {data && month === todayLima().slice(0, 7) && (() => {
        const ayer = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
        ayer.setDate(ayer.getDate() - 1);
        const ayerISO = ayer.toLocaleDateString("en-CA");
        const registrado = data.dailies.some((d) => d.date === ayerISO && (d.revenue ?? 0) > 0);
        return !registrado && ayerISO.slice(0, 7) === month ? (
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⏰ <strong>Falta registrar ayer</strong> ({ayerISO.slice(8)}/{ayerISO.slice(5, 7)}). Los KPIs, el avance de la meta y los bonos dependen de ese registro diario.
          </div>
        ) : null;
      })()}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>
      ) : error || !data || !p ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <>
          {/* 1 · Avance del ticket */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Ticket promedio ({p.daysLoaded} día{p.daysLoaded === 1 ? "" : "s"})</div>
              <div className="text-2xl font-black text-gray-900">
                {p.ticketActual !== null ? formatCurrency(p.ticketActual) : "—"}
              </div>
              <div className="text-[11px] text-gray-500">
                Base {formatCurrency(data.config.ticketBase)}
                {p.deltaActual !== null && (
                  <span className={`ml-1 font-semibold ${p.deltaActual > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    ({p.deltaActual >= 0 ? "+" : ""}{formatCurrency(p.deltaActual)})
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Nivel alcanzado</div>
              <div className={`text-lg font-bold ${p.nivelAlcanzado ? "text-emerald-600" : "text-gray-400"}`}>
                {p.nivelAlcanzado?.nombre ?? "Aún sin nivel"}
              </div>
              {p.proximoNivel && (
                <div className="text-[11px] text-gray-500">
                  Para {p.proximoNivel.level.nombre}: faltan <strong>{formatCurrency(p.proximoNivel.faltaSoles)}</strong> de ticket
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Piso de tráfico</div>
              <div className={`text-lg font-bold flex items-center gap-1.5 ${p.traffic.cumple ? "text-emerald-600" : "text-red-600"}`}>
                {p.traffic.cumple ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {p.traffic.personasPorDia ?? "—"} personas/día
              </div>
              <div className="text-[11px] text-gray-500">
                Mínimo {p.traffic.floor}/día — {p.traffic.cumple ? "cumple: la meta cuenta" : "sin el piso, la meta NO cuenta"}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500">Items por persona</div>
              <div className="text-2xl font-black text-gray-900">{p.itemsPorPersona ?? "—"}</div>
              <div className="text-[11px] text-gray-500">El upselling real sube ticket E items</div>
            </div>
          </div>

          {/* 2 · Tabla de niveles y pozo */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">
                Niveles y pozo (proyección al cierre con el ritmo actual)
              </span>
              {/* La base la mueve solo la dirección: el bono del admin
                  depende de ella. */}
              {!data.isAdminSession && (
                <button
                  onClick={() => setShowBase(true)}
                  className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 flex items-center gap-1 shrink-0"
                >
                  <Settings2 className="w-3.5 h-3.5" /> Base
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                  <th className="text-left px-4 py-2 font-medium">Nivel</th>
                  <th className="text-right px-4 py-2 font-medium">Ticket meta</th>
                  <th className="text-right px-4 py-2 font-medium">Bonos a pagar</th>
                  <th className="text-right px-4 py-2 font-medium">Pozo (techo 40%)</th>
                  <th className="text-right px-4 py-2 font-medium">Colchón</th>
                </tr>
              </thead>
              <tbody>
                {p.porNivel.map((n) => {
                  const isCurrent = p.nivelAlcanzado?.nombre === n.level.nombre;
                  return (
                    <tr key={n.level.nombre} className={`border-t border-gray-100 ${isCurrent ? "bg-emerald-50/60" : ""}`}>
                      <td className="px-4 py-2 font-medium text-gray-900">
                        {isCurrent && "✅ "}{n.level.nombre} <span className="text-gray-400">(+{formatCurrency(n.level.delta)})</span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(data.config.ticketBase + n.level.delta)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatCurrency(n.sumaBonos)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{n.pozoNivel !== null ? formatCurrency(n.pozoNivel) : "—"}</td>
                      <td className={`px-4 py-2 text-right font-medium ${n.colchon !== null && n.colchon >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {n.colchon !== null ? formatCurrency(n.colchon) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              El pozo es el techo; se paga la tabla fija por rol. Equipo: {data.staff.filter((s) => s.jornada === "tiempo_completo").length} tiempo completo · {data.staff.filter((s) => s.jornada === "medio_turno").length} medio turno · 1 admin.
            </div>
          </div>

          {/* 2b · Foco de upselling sugerido (datos del PIC de esta sede) */}
          {focus && focus.candidates.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900 mb-1">
                💡 Candidatos para el foco del día
              </div>
              <div className="text-[11px] text-gray-400 mb-2">
                Lo que más deja por unidad vendida (carta de esta sede, datos de {focus.month} — se refrescan con el reporte de rotación semanal).
                💎 = alta contribución con poca rotación: los ideales para empujar. Tú decides según stock y ocasión.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {focus.candidates.map((c) => (
                  <span
                    key={c.name}
                    className={`text-[11px] rounded-full px-2.5 py-1 border ${c.hiddenGem ? "bg-primary/5 border-primary/30 text-primary font-medium" : "bg-gray-50 border-gray-200 text-gray-700"}`}
                    title={`${c.unitsLastMonth} und en ese periodo${c.category ? ` · ${c.category}` : ""}`}
                  >
                    {c.hiddenGem ? "💎 " : ""}{c.name} · deja {formatCurrency(c.unitContribution)}/und
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 3 · Registro diario */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3 flex items-center justify-between">
                <span>Registro del día (del cierre de Byte)</span>
                {editingDate !== null && (
                  <button onClick={clearForm} className="text-[11px] font-normal text-gray-500 hover:text-gray-700 underline">
                    Cancelar edición
                  </button>
                )}
              </div>
              {editingDate !== null && (
                <div className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 mb-2">
                  ✏️ Corrigiendo el <strong>{editingDate.slice(8)}/{editingDate.slice(5, 7)}</strong> — cambia solo lo que estuvo mal y guarda.
                  {data.verifications[editingDate]?.status === "confirmado" && " Si cambias personas o venta, la firma del verificador se anula."}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Fecha</label>
                  <input type="date" value={fecha} max={todayLima()} onChange={(e) => setFecha(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Personas atendidas</label>
                  <input type="number" min="1" value={personas} onChange={(e) => setPersonas(e.target.value)}
                    placeholder="ej. 52" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Venta del día S/</label>
                  <input type="number" min="0" step="0.01" value={venta} onChange={(e) => setVenta(e.target.value)}
                    placeholder="ej. 1450.50" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Items vendidos (opcional)</label>
                  <input type="number" min="0" value={items} onChange={(e) => setItems(e.target.value)}
                    placeholder="ej. 140" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">NPS del día (0-10)</label>
                  <input type="number" min="0" max="10" step="0.1" value={nps} onChange={(e) => setNps(e.target.value)}
                    placeholder="ej. 9.5" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Mermas del día S/</label>
                  <div className="flex gap-1">
                    <input type="number" min="0" step="0.01" value={mermas} onChange={(e) => setMermas(e.target.value)}
                      placeholder="ej. 27.00" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                    <button
                      type="button"
                      onClick={() => setShowMermaDetail(true)}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
                      title="Detallar qué productos se mermaron (cantidad, costo, motivo y acción)"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Detallar
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">T. mostrador (min, meta &lt;6)</label>
                  <input type="number" min="0" step="0.5" value={tiempo} onChange={(e) => setTiempo(e.target.value)}
                    placeholder="ej. 5" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">T. mesa (min, meta &lt;15)</label>
                  <input type="number" min="0" step="0.5" value={tiempoMesa} onChange={(e) => setTiempoMesa(e.target.value)}
                    placeholder="ej. 12" className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
                </div>
              </div>
              {dayRecord && (dayRecord.tiempoMin != null || dayRecord.tiempoMesaMin != null) ? (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 mb-2">
                  ⏱️ Tiempos <strong>medidos por el encargado</strong> con el cronómetro — ya están guardados, no los tecleas.
                  Si un día no se cronometró, ahí sí los escribes a mano.
                </div>
              ) : (
                <div className="text-[11px] text-gray-400 mb-2">
                  Si el encargado usó el cronómetro, los tiempos aparecen solos al elegir la fecha. Si ese día no se cronometró, escríbelos a mano.
                </div>
              )}
              <button
                onClick={handleSaveDay}
                disabled={saving || !personas || !venta}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {editingDate !== null ? "Guardar corrección" : "Guardar día"}
              </button>
              {data.dailies.length > 0 && (
                <div className="mt-3 max-h-44 overflow-y-auto border border-gray-100 rounded-lg">
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-gray-500 uppercase">
                        <th className="text-left px-2 py-1">Día</th>
                        <th className="text-right px-2 py-1">Personas</th>
                        <th className="text-right px-2 py-1">Venta</th>
                        <th className="text-right px-2 py-1">Ticket</th>
                        <th className="text-right px-2 py-1" title="Segunda firma del verificador">Firma</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.dailies].reverse().map((d) => {
                        const v = data.verifications[d.date];
                        return (
                          <tr key={d.date} className={`border-t border-gray-50 ${editingDate === d.date ? "bg-blue-50/60" : ""}`}>
                            <td className="px-2 py-1">{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
                            <td className="px-2 py-1 text-right">{d.personas ?? "—"}</td>
                            <td className="px-2 py-1 text-right">{d.revenue !== null ? formatCurrency(d.revenue) : "—"}</td>
                            <td className="px-2 py-1 text-right font-medium">
                              {d.personas && d.revenue ? formatCurrency(Math.round((d.revenue / d.personas) * 100) / 100) : "—"}
                            </td>
                            <td
                              className="px-2 py-1 text-right"
                              title={v ? (v.status === "confirmado" ? "Conteo confirmado por el verificador" : `Observado: ${v.nota ?? ""}`) : "Pendiente de la segunda firma"}
                            >
                              {v ? (v.status === "confirmado" ? "✅" : "⚠️") : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button
                                onClick={() => startEdit(d)}
                                className="text-gray-300 hover:text-primary p-0.5"
                                title="Corregir este día (cualquier campo)"
                                aria-label={`Editar el ${d.date}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* 4 · Banderas */}
            <FlagsSection month={month} flags={data.flags} eventCounts={data.eventCounts} onChanged={() => load(month)} />
          </div>

          {/* 4b · KPIs de la semana (reemplaza el cuadro de Notion) */}
          <KpisWeekSection key={weekRefresh} fullSession={!data.isAdminSession} />

          {/* 5 · Mejor vendedor por turno (hándicap) — el veredicto real */}
          <MejorVendedorSection month={month} />

          {/* 5b · Ranking crudo por trabajador (referencial: mesas y total) */}
          {data.workers.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-primary" />
                Ventas por trabajador · referencial (último reporte subido{data.workers[0].periodEnd ? ` · al ${data.workers[0].periodEnd.slice(8)}/${data.workers[0].periodEnd.slice(5, 7)}` : ""})
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium">Trabajador</th>
                    <th className="text-right px-4 py-2 font-medium">Mesas</th>
                    <th className="text-right px-4 py-2 font-medium">Venta</th>
                    <th className="text-right px-4 py-2 font-medium">Ticket por mesa</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workers.map((w) => (
                    <tr key={w.nombre} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-gray-900">{w.nombre}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{w.mesas}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatCurrency(w.total)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{w.ticketMesa !== null ? formatCurrency(w.ticketMesa) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showImport && (
        <ImportControlModal onClose={() => setShowImport(false)} onImported={() => load(month)} />
      )}
      {showMermaDetail && (
        <MermaDetailModal
          date={fecha}
          onClose={() => setShowMermaDetail(false)}
          onSaved={(total) => {
            setMermas(String(total));
            setShowMermaDetail(false);
            setWeekRefresh((v) => v + 1);
            load(month);
          }}
        />
      )}
      {showLiquidation && (
        <LiquidationModal
          sede={sedeLabel}
          month={month}
          monthLabel={monthLabel(month)}
          onClose={() => setShowLiquidation(false)}
        />
      )}

      {showBase && (
        <BaseModal
          month={month}
          onClose={() => setShowBase(false)}
          onSaved={() => { setShowBase(false); load(month); }}
        />
      )}

      {showVentas && (
        <VentasImportModal
          onClose={() => setShowVentas(false)}
          onImported={() => load(month)}
        />
      )}
    </div>
  );
}

/**
 * Banderas de control con acciones: cada bandera activa se puede marcar
 * RESUELTA (nota opcional) o DESCARTADA (nota obligatoria — por qué no
 * aplica). Las atendidas se colapsan abajo con quién y cuándo, y se
 * pueden reabrir. Las banderas de la segunda firma (verif-*) no tienen
 * botones: se resuelven re-firmando en la pantalla de Verificación.
 */
function FlagsSection({
  month,
  flags,
  eventCounts,
  onChanged,
}: {
  month: string;
  flags: IncentiveDashboard["flags"];
  eventCounts: IncentiveDashboard["eventCounts"];
  onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [noteFor, setNoteFor] = useState<{ flagId: string; status: "resuelta" | "descartada" } | null>(null);
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const active = flags.filter((f) => !f.resolution);
  const resolved = flags.filter((f) => f.resolution);

  async function submit(flagId: string, status: "resuelta" | "descartada", notaTxt: string) {
    setBusy(true);
    const r = await setFlagStatus({ month, flagId, status, nota: notaTxt.trim() || null });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(status === "resuelta" ? "Bandera marcada como resuelta" : "Bandera descartada", "success");
    setNoteFor(null); setNota("");
    onChanged();
  }

  async function reopen(flagId: string) {
    setBusy(true);
    const r = await reopenFlag({ month, flagId });
    setBusy(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Bandera reabierta", "success");
    onChanged();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
        <Flag className="w-4 h-4 text-red-600" />
        Banderas de control ({active.length})
      </div>
      <div className="text-[11px] text-gray-400 mb-2">
        Eventos del mes: {eventCounts.cortesias} cortesías · {eventCounts.cambiosPrecio} cambios de precio
        {eventCounts.anulaciones > 0 ? ` · ${eventCounts.anulaciones} anulaciones (histórico)` : ""}
      </div>
      {active.length === 0 ? (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Sin banderas pendientes con los reportes cargados. 👏
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {active.map((f) => {
            const manageable = !f.id.startsWith("verif-");
            return (
              <div key={f.id} className={`text-xs rounded-lg px-3 py-2 border ${f.severity === "alta" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {f.usuario ? `${f.usuario}: ` : ""}{f.title}
                </div>
                <div className="mt-0.5 opacity-80">{f.detail}</div>
                {manageable ? (
                  noteFor?.flagId === f.id ? (
                    <div className="mt-2 flex gap-1.5">
                      <input
                        autoFocus
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        placeholder={noteFor.status === "resuelta" ? "Nota (opcional): qué se hizo" : "Nota obligatoria: por qué no aplica"}
                        className="flex-1 border border-gray-300 rounded px-2 py-1 text-[11px] bg-white text-gray-900"
                      />
                      <button
                        onClick={() => submit(f.id, noteFor.status, nota)}
                        disabled={busy || (noteFor.status === "descartada" && !nota.trim())}
                        className="px-2 py-1 text-[11px] font-medium text-white bg-primary rounded disabled:opacity-50"
                      >
                        OK
                      </button>
                      <button onClick={() => { setNoteFor(null); setNota(""); }} className="px-2 py-1 text-[11px] text-gray-500">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        onClick={() => { setNoteFor({ flagId: f.id, status: "resuelta" }); setNota(""); }}
                        className="px-2 py-0.5 text-[11px] font-medium rounded border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      >
                        ✓ Resuelta
                      </button>
                      <button
                        onClick={() => { setNoteFor({ flagId: f.id, status: "descartada" }); setNota(""); }}
                        className="px-2 py-0.5 text-[11px] font-medium rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                      >
                        Descartar
                      </button>
                    </div>
                  )
                ) : (
                  <div className="mt-1 text-[11px] opacity-70">Se resuelve en la pantalla de Verificación (re-firma del día).</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="text-[11px] text-gray-500 hover:text-gray-700 underline"
          >
            {showResolved ? "Ocultar" : "Ver"} banderas atendidas ({resolved.length})
          </button>
          {showResolved && (
            <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
              {resolved.map((f) => (
                <div key={f.id} className="text-[11px] rounded-lg px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500">
                  <div className="flex items-center justify-between gap-2">
                    <span className="line-through">{f.usuario ? `${f.usuario}: ` : ""}{f.title}</span>
                    <button onClick={() => reopen(f.id)} disabled={busy} className="shrink-0 underline hover:text-gray-700">
                      Reabrir
                    </button>
                  </div>
                  <div className="mt-0.5">
                    {f.resolution!.status === "resuelta" ? "✓ Resuelta" : "Descartada"} por {f.resolution!.resolvedBy === "direccion" ? "la dirección" : "el administrador"}
                    {f.resolution!.nota ? ` — "${f.resolution!.nota}"` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
