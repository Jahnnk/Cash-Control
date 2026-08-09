"use client";

/**
 * Cuentas por cobrar de Atelier.
 *
 * Mismo componente en dos lugares: el panel de Luis (puede subir
 * archivos y marcar cobros) y Grupo Yayi's (solo lectura). Así las dos
 * pantallas nunca cuentan historias distintas.
 *
 * Orden deliberado: primero la respuesta ("¿cuánto me deben y cuánto
 * está atrasado?"), después quién debe, después el detalle, y al final
 * el cuadre — que es control, no operación del día.
 */

import { useState, useTransition } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from "recharts";
import {
  AlertTriangle, Upload, Check, Clock, FileWarning, ShieldCheck, ChevronDown, Building2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { marcarCobrado, desmarcarCobrado, type ReceivablesData } from "@/app/actions/receivables";

const VERDE = "#098B5F";
const AMBAR = "#B45309";
const ROJO = "#B91C1C";
const NARANJA = "#C2410C";

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${d} ${meses[Number(m) - 1]}`;
}

/** Color del tramo de antigüedad: cuanto más viejo, más rojo. */
const COLOR_TRAMO = [VERDE, AMBAR, NARANJA, ROJO];

export function ReceivablesSection({
  data,
  onSubir,
  onRecargar,
}: {
  data: ReceivablesData;
  /** Solo el panel de Atelier los pasa; en Grupo va sin botones. */
  onSubir?: () => void;
  onRecargar?: () => void;
}) {
  const { showToast } = useToast();
  const [verTodos, setVerTodos] = useState(false);
  const [verCuadre, setVerCuadre] = useState(false);
  const [pendiente, startTransition] = useTransition();

  if (data.faltaMigracion) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        Falta preparar la base de datos para esta sección. Avísale a Jahnn.
      </div>
    );
  }

  if (!data.hayDatos) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <h3 className="text-sm font-semibold text-gray-900">Aún no hay facturas cargadas</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
          {onSubir
            ? "Sube el «Reporte de Ventas» y el «Consolidado de Facturas» de Byte y acá vas a ver quién te debe, desde cuándo y qué está atrasado."
            : "Cuando Luis suba los reportes de Byte, el control de cobranza aparece acá."}
        </p>
        {onSubir && (
          <button
            onClick={onSubir}
            className="mt-4 inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-light"
          >
            <Upload className="w-4 h-4" /> Subir los reportes
          </button>
        )}
      </div>
    );
  }

  function toggleCobrado(docKey: string, actual: boolean) {
    startTransition(async () => {
      const r = actual ? await desmarcarCobrado(docKey) : await marcarCobrado(docKey);
      if (!r.ok) {
        showToast(r.error, "error");
        return;
      }
      showToast(actual ? "Marca quitada" : "Marcado como cobrado", "success");
      onRecargar?.();
    });
  }

  const visibles = verTodos ? data.documentos : data.documentos.slice(0, 10);
  const c = data.cuadre;
  const cuadreOk =
    c.hayAmbos &&
    Math.abs(c.diferencia) < 0.01 &&
    c.soloEnVentas.length === 0 &&
    c.soloEnConsolidado.length === 0 &&
    c.montosDistintos.length === 0;

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Cuentas por cobrar</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {data.ultimaCarga.ventas
              ? `Ventas cargadas hasta el ${fechaCorta(data.ultimaCarga.ventas)}`
              : "Falta subir el Reporte de Ventas"}
            {" · "}
            {data.ultimaCarga.facturas
              ? `facturas hasta el ${fechaCorta(data.ultimaCarga.facturas)}`
              : "falta el Consolidado de Facturas"}
          </p>
        </div>
        {onSubir && (
          <button
            onClick={onSubir}
            className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50"
          >
            <Upload className="w-3.5 h-3.5" /> Subir reportes
          </button>
        )}
      </div>

      {/* Los números que importan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Te deben
          </div>
          <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
            {formatCurrency(data.porCobrar)}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {data.porCobrarDocs} documento{data.porCobrarDocs === 1 ? "" : "s"} sin cobrar
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            data.atrasado > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`text-[10px] uppercase tracking-wide font-semibold ${
              data.atrasado > 0 ? "text-red-700" : "text-gray-500"
            }`}
          >
            Atrasado
          </div>
          <div
            className={`text-xl font-bold mt-1 tabular-nums ${
              data.atrasado > 0 ? "text-red-700" : "text-gray-900"
            }`}
          >
            {formatCurrency(data.atrasado)}
          </div>
          <div className={`text-[11px] mt-0.5 ${data.atrasado > 0 ? "text-red-700/80" : "text-gray-500"}`}>
            más de {data.diasParaAtraso} días · {data.atrasadoDocs} documento
            {data.atrasadoDocs === 1 ? "" : "s"}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Ya cobrado
          </div>
          <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
            {formatCurrency(data.cobrado)}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">según Byte</div>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            cuadreOk ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`text-[10px] uppercase tracking-wide font-semibold ${
              cuadreOk ? "text-emerald-700" : "text-gray-500"
            }`}
          >
            Cuadre de facturas
          </div>
          <div
            className={`text-xl font-bold mt-1 flex items-center gap-1.5 ${
              cuadreOk ? "text-emerald-700" : "text-gray-900"
            }`}
          >
            {cuadreOk ? (
              <>
                <ShieldCheck className="w-5 h-5" /> Cuadra
              </>
            ) : c.hayAmbos ? (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-600" /> Revisar
              </>
            ) : (
              <span className="text-base text-gray-400">Falta un archivo</span>
            )}
          </div>
          <div className={`text-[11px] mt-0.5 ${cuadreOk ? "text-emerald-700/80" : "text-gray-500"}`}>
            {c.hayAmbos
              ? cuadreOk
                ? "lo facturado = lo vendido"
                : `diferencia de ${formatCurrency(Math.abs(c.diferencia))}`
              : "sube los dos reportes"}
          </div>
        </div>
      </div>

      {/* Cobrado por Luis pero aún pendiente en Byte */}
      {data.cobradoManualDocs > 0 && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 flex items-start gap-2">
          <Check className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-900">
            <strong>
              {formatCurrency(data.cobradoManual)} en {data.cobradoManualDocs} documento
              {data.cobradoManualDocs === 1 ? "" : "s"} ya se cobró, pero falta registrarlo en Byte.
            </strong>
            <p className="text-blue-800/80 mt-0.5">
              Siguen contando en «Te deben» porque el número oficial lo manda Byte. La marca
              desaparece sola cuando el archivo nuevo confirme el pago.
            </p>
          </div>
        </div>
      )}

      {/* Ventas a crédito que nadie está cobrando */}
      {data.huerfanos.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <div className="flex items-start gap-2">
            <FileWarning className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-amber-900">
                {formatCurrency(data.huerfanos.reduce((s, h) => s + h.total, 0))} en{" "}
                {data.huerfanos.length} venta{data.huerfanos.length === 1 ? "" : "s"} que nadie está
                cobrando
              </div>
              <p className="text-[11px] text-amber-800/80 mt-0.5 mb-2">
                Quedaron a crédito pero en Byte no tienen cuota de cobro: no figuran como deuda de
                nadie. Suele pasar cuando se anula una factura y la venta queda como ticket suelto.
                Hay que asignarles la cuota en Byte.
              </p>
              <div className="space-y-1">
                {data.huerfanos.slice(0, 6).map((h) => (
                  <div key={h.docKey} className="flex justify-between text-xs gap-3">
                    <span className="text-amber-900">
                      {h.cliente}{" "}
                      <span className="text-amber-700/70">
                        · {h.docKey} · {fechaCorta(h.fecha)}
                      </span>
                    </span>
                    <span className="tabular-nums text-amber-800 whitespace-nowrap">
                      {formatCurrency(h.total)}
                    </span>
                  </div>
                ))}
                {data.huerfanos.length > 6 && (
                  <div className="text-[11px] text-amber-700">
                    y {data.huerfanos.length - 6} más
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Antigüedad de la deuda */}
      {data.porCobrar > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Hace cuánto que te deben</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
            Cuanto más a la derecha, más difícil de cobrar. Contado desde la fecha de la venta.
          </p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.antiguedad} margin={{ left: 4, right: 12, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="tramo" tick={{ fontSize: 10 }} interval={0} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v}`} width={56} />
                <Tooltip
                  formatter={(v) => [formatCurrency(Number(v)), "Por cobrar"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                  {data.antiguedad.map((_, i) => (
                    <Cell key={i} fill={COLOR_TRAMO[i] ?? ROJO} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Quién debe */}
      {data.deudores.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Quién te debe</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              De mayor a menor. Fonavi y Centro van en la misma lista, marcados como sede.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[540px]">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-2 text-right font-semibold">Debe</th>
                  <th className="px-4 py-2 text-right font-semibold">Atrasado</th>
                  <th className="px-4 py-2 text-right font-semibold">Docs</th>
                  <th className="px-4 py-2 text-right font-semibold">Más antiguo</th>
                </tr>
              </thead>
              <tbody>
                {data.deudores.map((d) => (
                  <tr key={d.clave} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <div className="text-gray-900 flex items-center gap-1.5">
                        {d.cliente}
                        {d.esSede && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wide bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-semibold">
                            <Building2 className="w-2.5 h-2.5" /> sede
                          </span>
                        )}
                      </div>
                      {d.documento && (
                        <div className="text-[10px] text-gray-400 tabular-nums">{d.documento}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                      {formatCurrency(d.deuda)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {d.atrasado > 0 ? (
                        <span className="text-red-600 font-medium">{formatCurrency(d.atrasado)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      {d.documentos}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                      {d.diasMasViejo} día{d.diasMasViejo === 1 ? "" : "s"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detalle documento por documento */}
      {data.documentos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Documentos sin cobrar</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Del más antiguo al más reciente.
              {onSubir && " Marca lo que ya cobraste y aún no registraste en Byte."}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2 text-left font-semibold">Documento</th>
                  <th className="px-4 py-2 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-2 text-right font-semibold">Monto</th>
                  <th className="px-4 py-2 text-right font-semibold">Antigüedad</th>
                  {onSubir && <th className="px-4 py-2 text-right font-semibold">Cobrado</th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((d) => (
                  <tr
                    key={d.docKey}
                    className={`border-t border-gray-100 ${d.cobradoManual ? "bg-blue-50/50" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <div className="text-gray-900 tabular-nums text-xs">{d.serie ?? d.docKey}</div>
                      <div className="text-[10px] text-gray-400">
                        {d.tipo.toLowerCase()} · {fechaCorta(d.fecha)}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-gray-900 text-xs flex items-center gap-1.5">
                        {d.cliente}
                        {d.esSede && (
                          <span className="text-[9px] uppercase bg-gray-100 text-gray-600 rounded px-1 py-0.5 font-semibold">
                            sede
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                      {formatCurrency(d.total)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium tabular-nums ${
                          d.atrasado ? "text-red-600" : "text-gray-500"
                        }`}
                      >
                        {d.atrasado && <Clock className="w-3 h-3" />}
                        {d.dias} día{d.dias === 1 ? "" : "s"}
                      </span>
                    </td>
                    {onSubir && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => toggleCobrado(d.docKey, d.cobradoManual)}
                          disabled={pendiente}
                          title={
                            d.cobradoManual
                              ? "Quitar la marca de cobrado"
                              : "Marcar que ya lo cobraste (falta registrarlo en Byte)"
                          }
                          className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-lg px-2 py-1 border transition-colors disabled:opacity-50 ${
                            d.cobradoManual
                              ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          {d.cobradoManual ? "Cobrado" : "Marcar"}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.documentos.length > 10 && (
            <button
              onClick={() => setVerTodos((v) => !v)}
              className="w-full px-4 py-2.5 text-xs font-medium text-primary hover:bg-gray-50 border-t border-gray-100"
            >
              {verTodos ? "Ver solo los 10 más antiguos" : `Ver los ${data.documentos.length} documentos`}
            </button>
          )}
        </div>
      )}

      {/* Cuadre: control, no operación del día — va plegado */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setVerCuadre((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              {cuadreOk ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              Cuadre: lo facturado contra lo vendido
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {c.hayAmbos
                ? cuadreOk
                  ? "Todo cuadra. Ábrelo para ver el detalle."
                  : "Hay diferencias que revisar."
                : "Sube los dos reportes para poder cuadrar."}
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${verCuadre ? "rotate-180" : ""}`}
          />
        </button>

        {verCuadre && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1">
                No toda tu venta es factura
              </div>
              <p className="text-[11px] text-gray-500 mb-2">
                Por eso «facturas emitidas» nunca va a ser igual al reporte de ventas. El cuadre
                correcto suma los tres tipos de documento.
              </p>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-600">Facturas</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                      {formatCurrency(c.facturas)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-600">+ Boletas</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                      {formatCurrency(c.boletas)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-600">+ Tickets</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                      {formatCurrency(c.tickets)}
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-1.5 text-gray-900">= Total del Reporte de Ventas</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                      {formatCurrency(c.totalVentas)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {c.hayAmbos && (
              <div
                className={`rounded-lg p-3 border ${
                  Math.abs(c.diferencia) < 0.01
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="text-xs font-semibold text-gray-800 mb-1">
                  Las facturas de los dos archivos
                </div>
                <div className="flex justify-between text-xs text-gray-700">
                  <span>En el Reporte de Ventas</span>
                  <span className="tabular-nums">{formatCurrency(c.facturas)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-700">
                  <span>En el Consolidado (emitidas)</span>
                  <span className="tabular-nums">{formatCurrency(c.facturasConsolidado)}</span>
                </div>
                <div
                  className={`flex justify-between text-xs font-semibold mt-1 pt-1 border-t ${
                    Math.abs(c.diferencia) < 0.01
                      ? "border-emerald-200 text-emerald-800"
                      : "border-red-200 text-red-800"
                  }`}
                >
                  <span>Diferencia</span>
                  <span className="tabular-nums">{formatCurrency(c.diferencia)}</span>
                </div>
              </div>
            )}

            {c.anuladas.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-1">
                  Facturas anuladas ({c.anuladas.length})
                </div>
                <p className="text-[11px] text-gray-500 mb-1.5">
                  No cuentan como venta ni como deuda. Si la venta igual se entregó, revisa que
                  aparezca arriba en «ventas que nadie está cobrando».
                </p>
                {c.anuladas.map((a) => (
                  <div key={a.docKey} className="flex justify-between text-xs text-gray-600 gap-3">
                    <span>
                      {a.docKey} · {a.cliente}
                    </span>
                    <span className="tabular-nums whitespace-nowrap">{formatCurrency(a.total)}</span>
                  </div>
                ))}
              </div>
            )}

            {(c.soloEnVentas.length > 0 ||
              c.soloEnConsolidado.length > 0 ||
              c.montosDistintos.length > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                {c.soloEnVentas.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-900">
                      Vendido pero sin factura en el consolidado ({c.soloEnVentas.length})
                    </div>
                    {c.soloEnVentas.map((x) => (
                      <div key={x.docKey} className="flex justify-between text-xs text-amber-800 gap-3">
                        <span>
                          {x.docKey} · {x.cliente}
                        </span>
                        <span className="tabular-nums">{formatCurrency(x.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {c.soloEnConsolidado.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-900">
                      Facturado pero sin venta que lo respalde ({c.soloEnConsolidado.length})
                    </div>
                    {c.soloEnConsolidado.map((x) => (
                      <div key={x.docKey} className="flex justify-between text-xs text-amber-800 gap-3">
                        <span>
                          {x.docKey} · {x.cliente}
                        </span>
                        <span className="tabular-nums">{formatCurrency(x.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {c.montosDistintos.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-amber-900">
                      Montos que no coinciden entre los dos archivos ({c.montosDistintos.length})
                    </div>
                    {c.montosDistintos.map((x) => (
                      <div key={x.docKey} className="text-xs text-amber-800">
                        {x.docKey} · {x.cliente}: ventas {formatCurrency(x.enVentas)} vs consolidado{" "}
                        {formatCurrency(x.enConsolidado)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
