"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { getMonthlyReport, getDailyBreakdown, type DailyBreakdownResult } from "@/app/actions/reports";
import { getCategories } from "@/app/actions/categories";
import { getClients } from "@/app/actions/clients";
import { getAvailableMonthRange } from "@/app/actions/month-range";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { MonthSelector } from "@/components/ui/MonthSelector";
import { DataTable } from "@/components/ui/DataTable";
import { X, Pencil, Trash2 } from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { EditRecordModal, type EditTarget } from "./edit-record-modal";
import { DeleteRecordModal, type DeleteTarget } from "./delete-record-modal";
import { RoundingAlertsSection } from "./rounding-alerts-section";

const PIE_COLORS = [
  "#004C40", "#098B5F", "#22C55E", "#EAB308", "#F97316",
  "#DC2626", "#8B5CF6", "#3B82F6", "#EC4899", "#6B7280",
  "#14B8A6", "#A855F7", "#F59E0B",
];

function getCurrentMonth() {
  return new Date().toISOString().substring(0, 7);
}

function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

type MonthlyData = {
  totals: Record<string, unknown>;
  bankStartBalance: number;
  bankEndBalance: number;
  bankIngresosBcp?: number;
  bankEgresosBcp?: number;
  bankVariation?: number;
  byCategory: Record<string, unknown>[];
  byteSalesSource?: "byte_sales_daily" | "legacy";
};

type DetailType = "byte" | "income" | "expense" | "total_income" | "bank_variation" | "credit_sales";

/**
 * Atelier es B2B: las ventas Byte se cobran por transferencia y ya
 * están dentro de "Ingresos CTA CTE" del Excel. Sumar Byte + Otros
 * duplicaría las ventas, por eso el card "Total cobros del mes" NO
 * se renderiza para Atelier. Centro/Fonavi son B2C y sí necesitan
 * el total agregado. Ver Prompt 22.
 */
function isAtelier(slug: string | null): boolean {
  return slug === "atelier";
}

export function MonthlyReport() {
  const searchParams = useSearchParams();
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? null;
  const atelier = isAtelier(negocio);
  const initialMonth = (() => {
    const m = searchParams.get("mes");
    return m && isValidMonth(m) ? m : getCurrentMonth();
  })();

  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState<DetailType | null>(null);
  const [detailResult, setDetailResult] = useState<DailyBreakdownResult | null>(null);
  const detailData = detailResult?.rows ?? null;
  const [detailLoading, setDetailLoading] = useState(false);
  const [monthRange, setMonthRange] = useState<{ minMonth: string; maxMonth: string; currentMonth: string } | null>(null);

  // Carga el rango navegable una sola vez (compartido con Dashboard y Presupuesto)
  useEffect(() => {
    getAvailableMonthRange().then(setMonthRange);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- patrón intencional de fetch al cambiar mes */
    setLoading(true);
    setShowDetail(null);
    setDetailResult(null);
    getMonthlyReport(month).then((d) => {
      setData(d);
      setLoading(false);
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [month]);

  const handleCardClick = useCallback(async (type: DetailType) => {
    if (showDetail === type) {
      setShowDetail(null);
      setDetailResult(null);
      return;
    }
    setShowDetail(type);
    setDetailLoading(true);
    const result = await getDailyBreakdown(month, type);
    setDetailResult(result);
    setDetailLoading(false);
  }, [showDetail, month]);

  // Datos auxiliares para modales (categorías de egresos y clientes para ingresos)
  const [categories, setCategories] = useState<string[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    getCategories(true).then((rows) => setCategories(rows.map((r) => r.name as string)));
    getClients(true).then((rows) => setClients(rows.map((r) => ({ id: r.id as string, name: r.name as string }))));
  }, []);

  // Estado de modales
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Refresca totales del mes + el breakdown abierto (tras edit/delete)
  const refreshAfterMutation = useCallback(async () => {
    const [monthly, breakdown] = await Promise.all([
      getMonthlyReport(month),
      showDetail ? getDailyBreakdown(month, showDetail) : Promise.resolve(null),
    ]);
    setData(monthly);
    if (breakdown !== null) setDetailResult(breakdown);
    setEditTarget(null);
    setDeleteTarget(null);
  }, [month, showDetail]);

  // Auto-abrir breakdown si llega desde el dashboard con ?breakdown=...
  const initialBreakdownApplied = useRef(false);
  useEffect(() => {
    if (initialBreakdownApplied.current || loading) return;
    const requested = searchParams.get("breakdown");
    if (
      requested === "byte" || requested === "income" || requested === "expense" ||
      requested === "total_income" || requested === "bank_variation" || requested === "credit_sales"
    ) {
      initialBreakdownApplied.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-open por query param al primer mount
      handleCardClick(requested);
    }
  }, [searchParams, loading, handleCardClick]);

  const donutData = data?.byCategory.map((row) => ({
    name: row.category as string,
    value: parseFloat(row.total as string),
  }));

  return (
    <div className="space-y-6">
      {/* Month selector — unificado con el resto de la app */}
      <MonthSelector
        value={month}
        onChange={setMonth}
        minMonth={monthRange?.minMonth}
        maxMonth={monthRange?.maxMonth}
        currentMonth={monthRange?.currentMonth}
        loading={loading}
      />

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          Cargando...
        </div>
      ) : data ? (
        <>
          {/* Summary cards */}
          {(() => {
            // Variación = ingresos BCP - egresos BCP (calculado en
            // server por flujo del mes). Fallback al diff de balances
            // bancarios solo si bankVariation no vino (compat).
            const variation =
              typeof data.bankVariation === "number"
                ? data.bankVariation
                : data.bankEndBalance - data.bankStartBalance;
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {(() => {
                  // Card "Ventas Byte". Cuando hay total_byte_pos del Excel
                  // (Centro/Fonavi con Control de VTAS re-importado), el
                  // card muestra el TOTAL reportado por POS (E194) como
                  // valor principal y un desglose interno Cobradas /
                  // Crédito / Ajustes. Si no hay total_byte_pos (Atelier
                  // legacy o meses no re-importados), conserva el render
                  // anterior con valor Cobradas y sin desglose.
                  const cobradas = parseFloat((data.totals.total_byte as string) || "0");
                  const totalPos = data.totals.total_byte_pos as number | null;
                  const credito = Number(data.totals.total_credit_sales ?? 0);
                  const hasPos = typeof totalPos === "number" && totalPos > 0;
                  const ajustes = hasPos ? totalPos - cobradas - credito : 0;
                  const showBreakdown = hasPos && (credito > 0 || Math.abs(ajustes) > 0.01);
                  return (
                    <KPICard
                      title={hasPos ? "Ventas Byte" : "Ventas Byte (cobradas)"}
                      value={formatCurrency(hasPos ? totalPos! : cobradas)}
                      subtitle={
                        hasPos
                          ? "Total reportado por POS"
                          : data.byteSalesSource === "byte_sales_daily"
                          ? "Efectivo + Yape + POS + Transfer (excluye crédito)"
                          : "cobros (importa Control de VTAS para ventas brutas)"
                      }
                      footer={showBreakdown ? (
                        <div className="border-t border-gray-100 pt-2 mt-1 space-y-0.5">
                          <div className="flex justify-between text-slate-600">
                            <span>Cobradas</span>
                            <span className="font-medium">{formatCurrency(cobradas)}</span>
                          </div>
                          {credito > 0 && (
                            <div className="flex justify-between text-slate-600">
                              <span>Crédito</span>
                              <span className="font-medium">{formatCurrency(credito)}</span>
                            </div>
                          )}
                          {Math.abs(ajustes) > 0.01 && (
                            <div className={`flex justify-between ${ajustes < 0 ? "text-amber-600" : "text-blue-600"}`}>
                              <span>Ajustes</span>
                              <span className="font-medium">{ajustes >= 0 ? "+" : ""}{formatCurrency(ajustes)}</span>
                            </div>
                          )}
                        </div>
                      ) : undefined}
                      variant="default"
                      withAccentBar={false}
                      expanded={showDetail === "byte"}
                      expandedHint={{ open: "Click para cerrar", closed: "Ver detalle diario" }}
                      onClick={() => handleCardClick("byte")}
                    />
                  );
                })()}
                {(() => {
                  // Card "Ingresos Ctas. y Efectivo" — unificado para los 3 negocios
                  // tras Prompt 23. Para Centro/Fonavi muestra ahora el TOTAL de
                  // movimientos a cta+efectivo del mes (incluye cobros Byte), y
                  // se agrega una pista visual de conciliación contra Ventas Byte.
                  // Para Atelier no cambia el valor (no tiene is_byte_sale=true).
                  const ictas = parseFloat((data.totals.total_income as string) || "0");
                  const byte = parseFloat((data.totals.total_byte as string) || "0");
                  const diff = ictas - byte;
                  const showHint =
                    !atelier && data.byteSalesSource === "byte_sales_daily";
                  let hintIcon = "";
                  let hintCls = "";
                  let hintText = "";
                  if (showHint) {
                    if (Math.abs(diff) <= 1) {
                      hintIcon = "✅";
                      hintCls = "text-emerald-600";
                      hintText = "vs Ventas Byte: cuadra exacto";
                    } else if (diff < 0) {
                      hintIcon = "⚠️";
                      hintCls = "text-amber-600";
                      hintText = `vs Ventas Byte: ${formatCurrency(diff)} (créditos + ajustes de conciliación)`;
                    } else {
                      hintIcon = "ℹ️";
                      hintCls = "text-blue-600";
                      hintText = `vs Ventas Byte: +${formatCurrency(diff)} (ingresos extra no-Byte)`;
                    }
                  }
                  return (
                    <KPICard
                      title="Ingresos Ctas. y Efectivo"
                      value={formatCurrency(ictas)}
                      subtitle={
                        atelier
                          ? "Movimientos a CTA CTE y efectivo (incluye ventas B2B)"
                          : "Movimientos a CTA CTE y efectivo del mes"
                      }
                      footer={showHint ? (
                        <span className={`${hintCls} font-medium`}>{hintIcon} {hintText}</span>
                      ) : undefined}
                      variant="success"
                      withAccentBar={false}
                      expanded={showDetail === "income"}
                      expandedHint={{ open: "Click para cerrar", closed: "Ver detalle diario" }}
                      onClick={() => handleCardClick("income")}
                    />
                  );
                })()}
                {(() => {
                  const credit = Number(data.totals.total_credit_sales ?? 0);
                  const hasCredit = credit > 0;
                  return (
                    <KPICard
                      title="Ventas a crédito"
                      value={formatCurrency(credit)}
                      subtitle={hasCredit
                        ? "Ventas no cobradas en el mes (pendientes)"
                        : "Sin créditos pendientes este mes."}
                      variant="warning"
                      withAccentBar={false}
                      dim={!hasCredit}
                      expanded={showDetail === "credit_sales"}
                      expandedHint={hasCredit ? { open: "Click para cerrar", closed: "Ver detalle diario" } : undefined}
                      onClick={hasCredit ? () => handleCardClick("credit_sales") : undefined}
                    />
                  );
                })()}
                {/*
                  Card "Total cobros del mes" eliminado tras Prompt 23
                  para los 3 negocios. En Centro/Fonavi sumaba Ventas
                  Byte + Otros ingresos (con la semántica anterior de
                  "no-byte"); ahora que el card "Ingresos Ctas. y
                  Efectivo" ya incluye los cobros Byte, ese total
                  duplicaría las ventas. Se conserva el endpoint
                  getDailyBreakdown type="total_income" para no romper
                  consumidores que puedan navegar manualmente al
                  drilldown via ?breakdown=total_income.
                */}
                <KPICard
                  title="Egresos totales"
                  value={formatCurrency(data.totals.total_expenses as string)}
                  variant="danger"
                  withAccentBar={false}
                  expanded={showDetail === "expense"}
                  expandedHint={{ open: "Click para cerrar", closed: "Ver detalle diario" }}
                  onClick={() => handleCardClick("expense")}
                />
                <KPICard
                  title="Variación saldo banco"
                  value={formatCurrency(variation)}
                  subtitle="Ingresos BCP − Egresos BCP"
                  variant={variation >= 0 ? "success" : "danger"}
                  withAccentBar={false}
                  expanded={showDetail === "bank_variation"}
                  expandedHint={{ open: "Click para cerrar", closed: "Ver detalle diario" }}
                  onClick={() => handleCardClick("bank_variation")}
                />
              </div>
            );
          })()}

          {/* Alertas de redondeo (Control de VTAS) */}
          <RoundingAlertsSection month={month} />

          {/* Detail panel */}
          {showDetail && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  {showDetail === "byte"
                    ? "Ventas Byte (cobradas) por día"
                    : showDetail === "income"
                    ? "Ingresos a Ctas. y Efectivo por día"
                    : showDetail === "total_income"
                    ? "Total cobros por día"
                    : showDetail === "bank_variation"
                    ? "Variación saldo banco por día"
                    : showDetail === "credit_sales"
                    ? "Ventas a crédito por día"
                    : "Egresos por día"}
                </h3>
                <button onClick={() => { setShowDetail(null); setDetailResult(null); }}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {detailLoading ? (
                <div className="p-8 text-center text-gray-500 text-sm">Cargando detalle...</div>
              ) : detailData && detailData.length > 0 ? (
                <div className="overflow-x-auto">
                  {showDetail === "byte" && (detailResult?.format === "byte_daily" || detailResult?.format === "byte_b2c") ? (
                    /* B2C: Fonavi/Centro — desglose por payment_method */
                    <DataTable
                      rowKey={(row) => row.date as string}
                      data={detailData}
                      withCard={false}
                      size="compact"
                      columns={[
                        { key: "date", header: "Fecha", cellClassName: "font-medium", render: (row) => formatDateShort(row.date as string) },
                        { key: "efectivo", header: "Efectivo", align: "right", cellClassName: "text-emerald-700", render: (row) => formatCurrency(Number(row.efectivo ?? 0)) },
                        { key: "yape_plin", header: "Yape/Plin", align: "right", cellClassName: "text-purple-700", render: (row) => formatCurrency(Number(row.yape_plin ?? 0)) },
                        { key: "pos", header: "POS", align: "right", cellClassName: "text-blue-700", render: (row) => formatCurrency(Number(row.pos ?? 0)) },
                        { key: "transferencia", header: "Transfer.", align: "right", cellClassName: "text-blue-600", render: (row) => formatCurrency(Number(row.transferencia ?? 0)) },
                        { key: "total_dia", header: "Total", align: "right", cellClassName: "font-bold", render: (row) => formatCurrency(Number(row.total_dia ?? 0)) },
                      ]}
                      footer={(
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-3 py-3">Total</td>
                          <td className="px-3 py-3 text-right text-emerald-700">{formatCurrency(detailData.reduce((s, r) => s + Number(r.efectivo ?? 0), 0))}</td>
                          <td className="px-3 py-3 text-right text-purple-700">{formatCurrency(detailData.reduce((s, r) => s + Number(r.yape_plin ?? 0), 0))}</td>
                          <td className="px-3 py-3 text-right text-blue-700">{formatCurrency(detailData.reduce((s, r) => s + Number(r.pos ?? 0), 0))}</td>
                          <td className="px-3 py-3 text-right text-blue-600">{formatCurrency(detailData.reduce((s, r) => s + Number(r.transferencia ?? 0), 0))}</td>
                          <td className="px-3 py-3 text-right font-bold">{formatCurrency(detailData.reduce((s, r) => s + Number(r.total_dia ?? 0), 0))}</td>
                        </tr>
                      )}
                    />
                  ) : showDetail === "byte" ? (
                    /* Atelier B2B legacy: byte_credit_day, byte_cash_sale, etc. */
                    <DataTable
                      rowKey={(row) => row.date as string}
                      data={detailData}
                      withCard={false}
                      size="compact"
                      columns={[
                        { key: "date", header: "Fecha", cellClassName: "font-medium", render: (row) => formatDateShort(row.date as string) },
                        { key: "byte_credit_day", header: "Crédito día", align: "right", render: (row) => formatCurrency(row.byte_credit_day as string) },
                        { key: "byte_cash_sale", header: "Contado", align: "right", cellClassName: "text-blue-600", render: (row) => formatCurrency(row.byte_cash_sale as string) },
                        { key: "byte_cash_physical", header: "Efectivo", align: "right", cellClassName: "text-gray-500", render: (row) => formatCurrency(row.byte_cash_physical as string) },
                        { key: "byte_digital", header: "Digital", align: "right", cellClassName: "text-gray-500", render: (row) => formatCurrency(row.byte_digital as string) },
                        { key: "byte_total", header: "Total", align: "right", cellClassName: "font-bold", render: (row) => formatCurrency(row.byte_total as string) },
                      ]}
                      footer={(
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-3 py-3">Total</td>
                          <td className="px-3 py-3 text-right">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_credit_day), 0))}</td>
                          <td className="px-3 py-3 text-right text-blue-600">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_cash_sale), 0))}</td>
                          <td className="px-3 py-3 text-right">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_cash_physical), 0))}</td>
                          <td className="px-3 py-3 text-right">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_digital), 0))}</td>
                          <td className="px-3 py-3 text-right font-bold">{formatCurrency(detailData.reduce((s, r) => s + Number(r.byte_total), 0))}</td>
                        </tr>
                      )}
                    />
                  ) : showDetail === "total_income" ? (
                    /* Total cobros del mes — Ventas Byte + Otros por día */
                    <DataTable
                      rowKey={(row) => row.date as string}
                      data={detailData}
                      withCard={false}
                      size="compact"
                      columns={[
                        { key: "date", header: "Fecha", cellClassName: "font-medium", render: (row) => formatDateShort(row.date as string) },
                        { key: "ventas_byte", header: "Ventas Byte", align: "right", cellClassName: "text-primary", render: (row) => formatCurrency(Number(row.ventas_byte ?? 0)) },
                        { key: "otros_ingresos", header: "Otros ingresos", align: "right", cellClassName: "text-primary-light", render: (row) => formatCurrency(Number(row.otros_ingresos ?? 0)) },
                        { key: "total_dia", header: "Total cobros día", align: "right", cellClassName: "font-bold text-emerald-700", render: (row) => formatCurrency(Number(row.total_dia ?? 0)) },
                      ]}
                      footer={(
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-3 py-3">Total</td>
                          <td className="px-3 py-3 text-right text-primary">{formatCurrency(detailData.reduce((s, r) => s + Number(r.ventas_byte ?? 0), 0))}</td>
                          <td className="px-3 py-3 text-right text-primary-light">{formatCurrency(detailData.reduce((s, r) => s + Number(r.otros_ingresos ?? 0), 0))}</td>
                          <td className="px-3 py-3 text-right font-bold text-emerald-700">{formatCurrency(detailData.reduce((s, r) => s + Number(r.total_dia ?? 0), 0))}</td>
                        </tr>
                      )}
                    />
                  ) : showDetail === "credit_sales" ? (
                    /* Ventas a crédito — filas de tips_pending source='Ventas al Crédito' */
                    <DataTable
                      rowKey={(row) => row.id as string}
                      data={detailData}
                      withCard={false}
                      size="compact"
                      columns={[
                        { key: "date", header: "Fecha", cellClassName: "font-medium", render: (row) => formatDateShort(row.date as string) },
                        { key: "note_text", header: "Nota / cliente", render: (row) => <span className="text-xs text-gray-700">{(row.note_text as string) || "—"}</span> },
                        { key: "amount", header: "Monto", align: "right", cellClassName: "text-amber-700 font-medium", render: (row) => formatCurrency(Number(row.amount ?? 0)) },
                        { key: "status", header: "Estado", render: (row) => <span className="text-xs text-gray-500">{(row.status as string) === "pending" ? "Pendiente" : String(row.status)}</span> },
                      ]}
                      footer={(
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-3 py-3">Total</td>
                          <td className="px-3 py-3" />
                          <td className="px-3 py-3 text-right text-amber-700">{formatCurrency(detailData.reduce((s, r) => s + Number(r.amount ?? 0), 0))}</td>
                          <td className="px-3 py-3" />
                        </tr>
                      )}
                    />
                  ) : showDetail === "bank_variation" ? (
                    /* Variación saldo banco — Ingresos BCP − Egresos BCP por día */
                    <DataTable
                      rowKey={(row) => row.date as string}
                      data={detailData}
                      withCard={false}
                      size="compact"
                      columns={[
                        { key: "date", header: "Fecha", cellClassName: "font-medium", render: (row) => formatDateShort(row.date as string) },
                        { key: "ingresos_bcp", header: "Ingresos BCP", align: "right", cellClassName: "text-primary-light", render: (row) => formatCurrency(Number(row.ingresos_bcp ?? 0)) },
                        { key: "egresos_bcp", header: "Egresos BCP", align: "right", cellClassName: "text-red-600", render: (row) => `−${formatCurrency(Number(row.egresos_bcp ?? 0))}` },
                        {
                          key: "variacion_dia",
                          header: "Variación día",
                          align: "right",
                          cellClassName: "font-bold",
                          render: (row) => {
                            const v = Number(row.variacion_dia ?? 0);
                            const cls = v >= 0 ? "text-primary-light" : "text-red-600";
                            return <span className={cls}>{v >= 0 ? "+" : ""}{formatCurrency(v)}</span>;
                          },
                        },
                      ]}
                      footer={(() => {
                        const ingTot = detailData.reduce((s, r) => s + Number(r.ingresos_bcp ?? 0), 0);
                        const egrTot = detailData.reduce((s, r) => s + Number(r.egresos_bcp ?? 0), 0);
                        const varTot = ingTot - egrTot;
                        const varCls = varTot >= 0 ? "text-primary-light" : "text-red-600";
                        return (
                          <tr className="bg-gray-50 font-semibold">
                            <td className="px-3 py-3">Total</td>
                            <td className="px-3 py-3 text-right text-primary-light">{formatCurrency(ingTot)}</td>
                            <td className="px-3 py-3 text-right text-red-600">−{formatCurrency(egrTot)}</td>
                            <td className={`px-3 py-3 text-right font-bold ${varCls}`}>{varTot >= 0 ? "+" : ""}{formatCurrency(varTot)}</td>
                          </tr>
                        );
                      })()}
                    />
                  ) : showDetail === "income" ? (
                    (() => {
                      const byDate = new Map<string, { items: typeof detailData; total: number }>();
                      for (const row of detailData) {
                        const d = row.date as string;
                        if (!byDate.has(d)) byDate.set(d, { items: [], total: 0 });
                        const entry = byDate.get(d)!;
                        entry.items.push(row);
                        entry.total += Number(row.amount);
                      }
                      return (
                        <div className="divide-y divide-gray-100">
                          {Array.from(byDate.entries()).map(([date, { items, total }]) => (
                            <div key={date} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-900">{formatDateShort(date)}</span>
                                <span className="text-sm font-bold text-primary-light">{formatCurrency(total)}</span>
                              </div>
                              <div className="space-y-0.5">
                                {items.map((item, i) => (
                                  <div key={i} className="group flex items-center justify-between text-xs text-gray-500 pl-4 hover:bg-gray-50 rounded -mx-2 px-2 py-0.5">
                                    <span>{item.client_name ? `Pago de ${String(item.client_name)}` : (String(item.note || "Ingreso"))}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-primary-light font-medium">+{formatCurrency(item.amount as string)}</span>
                                      <div className="flex items-center gap-0.5 opacity-30 group-hover:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => setEditTarget({
                                            type: "income",
                                            id: item.id as string,
                                            date: item.date as string,
                                            amount: Number(item.amount),
                                            note: (item.note as string) || "",
                                            clientId: (item.client_id as string) || null,
                                            clientName: (item.client_name as string) || null,
                                          })}
                                          className="p-1 hover:bg-blue-50 hover:text-blue-600 rounded"
                                          aria-label="Editar"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => setDeleteTarget({
                                            type: "income",
                                            id: item.id as string,
                                            date: item.date as string,
                                            amount: Number(item.amount),
                                            note: (item.note as string) || "",
                                            clientName: (item.client_name as string) || null,
                                          })}
                                          className="p-1 hover:bg-red-50 hover:text-red-600 rounded"
                                          aria-label="Eliminar"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between font-semibold text-sm">
                            <span>Total</span>
                            <span className="text-primary-light">{formatCurrency(detailData.reduce((s, r) => s + Number(r.amount), 0))}</span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    (() => {
                      const byDate = new Map<string, { items: typeof detailData; total: number }>();
                      for (const row of detailData) {
                        const d = row.date as string;
                        if (!byDate.has(d)) byDate.set(d, { items: [], total: 0 });
                        const entry = byDate.get(d)!;
                        entry.items.push(row);
                        entry.total += Number(row.amount);
                      }
                      return (
                        <div className="divide-y divide-gray-100">
                          {Array.from(byDate.entries()).map(([date, { items, total }]) => (
                            <div key={date} className="px-4 py-3">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-900">{formatDateShort(date)}</span>
                                <span className="text-sm font-bold text-red-600">−{formatCurrency(total)}</span>
                              </div>
                              <div className="space-y-1">
                                {items.map((item, i) => (
                                  <div key={i} className="group pl-4 hover:bg-gray-50 rounded -mx-2 px-2 py-0.5">
                                    <div className="flex items-center justify-between text-xs text-gray-700">
                                      <span>
                                        <span className="font-medium text-gray-900">{String(item.category)}</span>
                                        <span className="text-gray-400"> · </span>
                                        <span>{String(item.concept)}</span>
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-red-600 font-medium">−{formatCurrency(item.amount as string)}</span>
                                        <div className="flex items-center gap-0.5 opacity-30 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={() => setEditTarget({
                                              type: "expense",
                                              id: item.id as string,
                                              date: item.date as string,
                                              amount: Number(item.amount),
                                              category: item.category as string,
                                              concept: item.concept as string,
                                              paymentMethod: (item.payment_method as string) || "transferencia",
                                              notes: (item.notes as string) || null,
                                            })}
                                            className="p-1 hover:bg-blue-50 hover:text-blue-600 rounded"
                                            aria-label="Editar"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => setDeleteTarget({
                                              type: "expense",
                                              id: item.id as string,
                                              date: item.date as string,
                                              amount: Number(item.amount),
                                              category: item.category as string,
                                              concept: item.concept as string,
                                              paymentMethod: (item.payment_method as string) || "transferencia",
                                              notes: (item.notes as string) || null,
                                            })}
                                            className="p-1 hover:bg-red-50 hover:text-red-600 rounded"
                                            aria-label="Eliminar"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                    {item.notes ? (
                                      <div className="text-[11px] text-gray-400 pl-2 mt-0.5">{String(item.notes)}</div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between font-semibold text-sm">
                            <span>Total</span>
                            <span className="text-red-600">−{formatCurrency(detailData.reduce((s, r) => s + Number(r.amount), 0))}</span>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 text-sm">Sin datos para este período</div>
              )}
            </div>
          )}

          {/* Expenses by category */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {donutData && donutData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Egresos por categoría</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                      {donutData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">Detalle por categoría</h3>
              </div>
              <DataTable
                rowKey={(row) => row.category as string}
                data={data.byCategory}
                withCard={false}
                columns={[
                  {
                    key: "category",
                    header: "Categoría",
                    cellClassName: "px-6",
                    headerClassName: "px-6",
                    render: (row, i) => (
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        {row.category as string}
                      </span>
                    ),
                  },
                  {
                    key: "total",
                    header: "Total",
                    align: "right",
                    cellClassName: "px-6 font-medium",
                    headerClassName: "px-6",
                    render: (row) => formatCurrency(row.total as string),
                  },
                ]}
              />
            </div>
          </div>
        </>
      ) : null}

      {editTarget && (
        <EditRecordModal
          target={editTarget}
          categories={categories}
          clients={clients}
          onClose={() => setEditTarget(null)}
          onSaved={refreshAfterMutation}
        />
      )}
      {deleteTarget && (
        <DeleteRecordModal
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={refreshAfterMutation}
        />
      )}
    </div>
  );
}

