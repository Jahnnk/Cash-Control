"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Upload, Loader2, Save, Pencil, TrendingUp, Receipt, Trash2 } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { getAtelierPanel, saveAtelierDay, type AtelierPanelData, type AtelierDaily } from "@/app/actions/byte-ventas";
import { useToast } from "@/components/toast-provider";
import { VentasImportModal } from "./ventas-import-modal";
import { HighlightSlot } from "./highlight-card";
import { EstadoKpisCard } from "./estado-kpis-card";
import { ProponerHighlight } from "./proponer-highlight";
import { ClientSalesImportModal } from "./client-sales-import-modal";
import { ClientSalesSection } from "./client-sales-section";
import { getClientSalesAnalisis, type ClientSalesAnalisis } from "@/app/actions/client-sales";
import { ReceivablesImportModal } from "./receivables-import-modal";
import { ReceivablesSection } from "./receivables-section";
import { getReceivables, type ReceivablesData } from "@/app/actions/receivables";

/**
 * Panel de Sede · Atelier (supervisora operativa).
 *
 * Atelier es el centro de producción B2B: sin programa de incentivos,
 * sin NPS ni tiempos de salón. Sus KPIs diarios son tres — venta del
 * día, mermas y ticket promedio — y el ticket NO se teclea: se calcula
 * solo (venta ÷ pedidos), igual que en el reporte de Byte. Estos datos
 * salen en el deck de la reunión junto a Fonavi y Centro.
 */

function currentMonth() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}
function todayLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function AtelierPanel() {
  const { showToast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<AtelierPanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  // Ventas por cliente (reporte semanal de Byte). Va aparte del panel
  // diario: es otro archivo, otra rutina y otro análisis.
  const [showClientImport, setShowClientImport] = useState(false);
  const [clientes, setClientes] = useState<ClientSalesAnalisis | null>(null);
  // Cuentas por cobrar: se alimenta de otros dos reportes de Byte
  // (ventas + consolidado de facturas), con su propia rutina semanal.
  const [showCobranzaImport, setShowCobranzaImport] = useState(false);
  const [cobranza, setCobranza] = useState<ReceivablesData | null>(null);

  // Registro diario
  const [fecha, setFecha] = useState(todayLima());
  const [venta, setVenta] = useState("");
  const [pedidos, setPedidos] = useState("");
  const [mermas, setMermas] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);

  const loadClientes = useCallback(async () => {
    setClientes(await getClientSalesAnalisis());
  }, []);

  const loadCobranza = useCallback(async () => {
    setCobranza(await getReceivables());
  }, []);

  const load = useCallback(async (m: string) => {
    setLoading(true);
    const r = await getAtelierPanel(m);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.error); }
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    load(month);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month, load]);

  // El análisis de clientes no depende del mes elegido arriba: viene del
  // último reporte semanal importado. Se carga una sola vez.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    loadClientes();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadClientes]);

  // Cuentas por cobrar: tampoco depende del mes elegido arriba — es el
  // estado vivo de la deuda, no una foto mensual.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    loadCobranza();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadCobranza]);

  const dayRecord = data?.dailies.find((d) => d.date === fecha) ?? null;
  const dayIsImport = dayRecord?.source === "import";

  // Ticket en vivo: la supervisora ve el resultado mientras teclea.
  const ventaN = Number(venta);
  const pedidosN = Number(pedidos);
  const ticketLive =
    Number.isFinite(ventaN) && ventaN > 0 && Number.isFinite(pedidosN) && pedidosN > 0
      ? Math.round((ventaN / pedidosN) * 100) / 100
      : null;

  // Sube de valor cada vez que cambia el registro (guardar a mano o
  // subir el reporte de Byte) para que el aviso vuelva a preguntar.
  const [refrescarAviso, setRefrescarAviso] = useState(0);

  /**
   * Del aviso al formulario en un clic. Sin esto la tarjeta solo
   * reclama, y la supervisora tiene que ir a buscar dónde se arregla.
   */
  function irAlRegistro(fechaObjetivo: string) {
    setFecha(fechaObjetivo);
    setEditingDate(null);
    document.getElementById("registro-diario")?.scrollIntoView({
      behavior: "smooth", block: "center",
    });
  }

  function clearForm() {
    setVenta(""); setPedidos(""); setMermas("");
    setEditingDate(null);
    setFecha(todayLima());
  }

  function startEdit(d: AtelierDaily) {
    setFecha(d.date);
    setVenta(d.venta !== null ? String(d.venta) : "");
    setPedidos(d.pedidos !== null ? String(d.pedidos) : "");
    setMermas(d.mermas !== null ? String(d.mermas) : "");
    setEditingDate(d.date);
  }

  async function handleSave() {
    setSaving(true);
    const r = await saveAtelierDay({
      date: fecha,
      venta: Number(venta),
      pedidos: Number(pedidos),
      mermas: mermas.trim() === "" ? null : Number(mermas),
    });
    setSaving(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(editingDate !== null ? "Día corregido" : "Día registrado", "success");
    clearForm();
    setRefrescarAviso((v) => v + 1);
    await load(month);
  }

  const s = data?.summary ?? null;

  return (
    <div className="space-y-6">
      {/* Lo más importante del día — va primero a propósito: si
          compitiera con los KPIs, dejaría de ser lo más importante. */}
      <HighlightSlot />

      {/* ¿Ya quedó registrado el día? Mismo aviso que ven Fonavi y
          Centro, con las palabras de Atelier: acá el día normal llega
          con el reporte de Byte, aunque también se puede teclear. */}
      <EstadoKpisCard refrescar={refrescarAviso} onRegistrar={irAlRegistro} />

      {/* Luis también propone: la operación de Atelier la ve él. */}
      <ProponerHighlight />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Panel de Sede · Atelier
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Registro diario del cierre de Byte: venta, pedidos y mermas. El ticket promedio se
            calcula solo. Estos números salen en el deck de la reunión semanal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white"
          />
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark"
          >
            <Upload className="w-3.5 h-3.5" /> Subir ventas Byte
          </button>
        </div>
      </div>


      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>
      ) : error || !data || !s ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">{error}</div>
      ) : (
        <>
          {/* 1 · Los 3 KPIs del mes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Venta acumulada ({s.diasConVenta} día{s.diasConVenta === 1 ? "" : "s"})
              </div>
              <div className="text-2xl font-black text-gray-900">{formatCurrency(s.ventaTotal)}</div>
              <div className="text-[11px] text-gray-500">
                {s.diasConVenta > 0 ? `Promedio ${formatCurrency(Math.round((s.ventaTotal / s.diasConVenta) * 100) / 100)}/día` : "Sin días registrados"}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500 flex items-center gap-1">
                <Receipt className="w-3 h-3" /> Ticket promedio del mes
              </div>
              <div className="text-2xl font-black text-gray-900">
                {s.ticketProm !== null ? formatCurrency(s.ticketProm) : "—"}
              </div>
              <div className="text-[11px] text-gray-500">Venta ÷ pedidos (mismo cálculo que Byte)</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[11px] uppercase text-gray-500 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Mermas del mes
              </div>
              <div className="text-2xl font-black text-gray-900">{formatCurrency(s.mermasTotal)}</div>
              <div className="text-[11px] text-gray-500">
                {s.mermasPct !== null ? `${s.mermasPct}% de la venta` : "Sin venta registrada aún"}
              </div>
            </div>
          </div>

          {/* 2 · Registro diario */}
          <div id="registro-diario" className="bg-white rounded-xl border border-gray-200 p-4 scroll-mt-4">
            <div className="text-sm font-semibold text-gray-900 mb-1">
              {editingDate !== null ? `Corrigiendo el ${editingDate.slice(8)}/${editingDate.slice(5, 7)}` : "Registro del día (del cierre de Byte)"}
            </div>
            <div className="text-[11px] text-gray-400 mb-3">
              Del cierre de Byte: venta total y # de pedidos del día, más las mermas de producción.
            </div>
            {dayIsImport && (
              <div className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 mb-3">
                📄 La venta y los pedidos de este día vinieron del <strong>reporte oficial de Byte</strong> y
                no se editan a mano (para corregirlos, re-sube el reporte). Las mermas sí puedes ajustarlas.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <div>
                <label className="text-[11px] uppercase text-gray-500">Fecha</label>
                <input type="date" value={fecha} max={todayLima()}
                  onChange={(e) => { setFecha(e.target.value); setEditingDate(null); }}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-gray-500">Venta (S/)</label>
                <input type="number" step="0.01" min="0" value={venta} disabled={dayIsImport && editingDate !== null}
                  onChange={(e) => setVenta(e.target.value)} placeholder="1508.82"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-gray-500"># Pedidos</label>
                <input type="number" step="1" min="0" value={pedidos} disabled={dayIsImport && editingDate !== null}
                  onChange={(e) => setPedidos(e.target.value)} placeholder="49"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:bg-gray-50 disabled:text-gray-400" />
              </div>
              <div>
                <label className="text-[11px] uppercase text-gray-500">Mermas (S/)</label>
                <input type="number" step="0.01" min="0" value={mermas}
                  onChange={(e) => setMermas(e.target.value)} placeholder="0.00"
                  onKeyDown={(e) => { if (e.key === "Enter" && !saving) handleSave(); }}
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {editingDate !== null ? "Corregir" : "Guardar"}
                </button>
                {editingDate !== null && (
                  <button onClick={clearForm} className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    ✕
                  </button>
                )}
              </div>
            </div>
            {ticketLive !== null && (
              <div className="mt-2 text-xs text-gray-600">
                Ticket promedio del día: <strong className="text-gray-900">{formatCurrency(ticketLive)}</strong>{" "}
                <span className="text-gray-400">({formatCurrency(ventaN)} ÷ {pedidosN} pedidos)</span>
              </div>
            )}
          </div>

          {/* 3 · Días del mes */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
              Días registrados · {monthLabel(month)}
            </div>
            {data.dailies.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">
                Sin días registrados este mes. Registra el cierre de ayer o sube el reporte de ventas de Byte.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                      <th className="text-left px-4 py-2 font-medium">Día</th>
                      <th className="text-right px-4 py-2 font-medium">Venta</th>
                      <th className="text-right px-4 py-2 font-medium">Pedidos</th>
                      <th className="text-right px-4 py-2 font-medium">Ticket</th>
                      <th className="text-right px-4 py-2 font-medium">Mermas</th>
                      <th className="text-right px-4 py-2 font-medium">Fuente</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.dailies].reverse().map((d) => {
                      const ticket = d.venta !== null && (d.pedidos ?? 0) > 0
                        ? Math.round((d.venta / d.pedidos!) * 100) / 100
                        : null;
                      return (
                        <tr key={d.date} className="border-t border-gray-100">
                          <td className="px-4 py-2 text-gray-900">{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
                          <td className="px-4 py-2 text-right font-medium">{d.venta !== null ? formatCurrency(d.venta) : "—"}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{d.pedidos ?? "—"}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{ticket !== null ? formatCurrency(ticket) : "—"}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{d.mermas !== null ? formatCurrency(d.mermas) : "—"}</td>
                          <td className="px-4 py-2 text-right text-[11px] text-gray-400">{d.source === "import" ? "📄 Byte" : "manual"}</td>
                          <td className="px-2 py-2 text-right">
                            <button onClick={() => startEdit(d)} className="text-gray-300 hover:text-primary p-1" title="Corregir este día">
                              <Pencil className="w-3.5 h-3.5" />
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
        </>
      )}

      {/* 4 · Clientes B2B — del reporte "Ventas por Cliente" de Byte */}
      <div className="pt-2">
        {clientes ? (
          <ClientSalesSection data={clientes} onSubir={() => setShowClientImport(true)} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
            Cargando clientes…
          </div>
        )}
      </div>

      {/* 5 · Cuentas por cobrar — de los reportes de ventas y facturas */}
      <div className="pt-2">
        {cobranza ? (
          <ReceivablesSection
            data={cobranza}
            onSubir={() => setShowCobranzaImport(true)}
            onRecargar={loadCobranza}
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
            Cargando cuentas por cobrar…
          </div>
        )}
      </div>

      {showImport && (
        <VentasImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            // El reporte de Byte es el camino principal de Atelier: si
            // el aviso no se entera, seguiría reclamando días que
            // acaban de llegar.
            setRefrescarAviso((v) => v + 1);
            return load(month);
          }}
        />
      )}
      {showClientImport && (
        <ClientSalesImportModal
          onClose={() => setShowClientImport(false)}
          onImported={loadClientes}
        />
      )}
      {showCobranzaImport && (
        <ReceivablesImportModal
          onClose={() => setShowCobranzaImport(false)}
          onImported={loadCobranza}
        />
      )}
    </div>
  );
}
