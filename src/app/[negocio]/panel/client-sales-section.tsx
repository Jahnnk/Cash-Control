"use client";

/**
 * Seguimiento de clientes B2B de Atelier (a partir del reporte de Byte).
 *
 * Se usa en DOS lugares con el mismo componente: el panel de Luis
 * (con botón de subir archivo) y Grupo Yayi's (solo lectura) — así las
 * dos pantallas nunca cuentan historias distintas.
 *
 * Orden deliberado: primero la respuesta ("¿cómo vamos con los
 * clientes?"), después el detalle. Las ventas a Fonavi y Centro van en
 * su propio bloque y NUNCA dentro del ranking: son traslados del grupo,
 * no venta nueva, y si se mezclaran coparían siempre los primeros
 * puestos (66% del total en el archivo de muestra).
 */

import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Sparkles, AlertTriangle, Building2, Upload } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ClientSalesAnalisis } from "@/app/actions/client-sales";

const VERDE = "#098B5F";
const VERDE_OSCURO = "#004C40";
const AMBAR = "#B45309";
const ROJO = "#B91C1C";

function fechaCorta(iso: string) {
  const [, m, d] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${d} ${meses[Number(m) - 1]}`;
}

/** Etiqueta de variación vs. el período anterior. */
function Variacion({ pct, estado }: { pct: number | null; estado: string }) {
  if (estado === "nuevo") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-light">
        <Sparkles className="w-3 h-3" /> nuevo
      </span>
    );
  }
  if (pct === null) return <span className="text-[11px] text-gray-400">—</span>;
  const sube = pct > 0;
  const fuerte = Math.abs(pct) > 5;
  if (!fuerte) return <span className="text-[11px] text-gray-400">estable</span>;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        sube ? "text-emerald-700" : "text-red-600"
      }`}
    >
      {sube ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {sube ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

export function ClientSalesSection({
  data,
  onSubir,
}: {
  data: ClientSalesAnalisis;
  /** Solo el panel de Atelier lo pasa; en Grupo va sin botón. */
  onSubir?: () => void;
}) {
  const [verTodos, setVerTodos] = useState(false);

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
        <h3 className="text-sm font-semibold text-gray-900">Aún no hay reportes de clientes</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
          {onSubir
            ? "Sube el reporte «Ventas por Cliente» de Byte y acá vas a ver quiénes son los mejores clientes, quién creció y quién dejó de comprar."
            : "Cuando Luis suba el primer reporte «Ventas por Cliente» de Byte, el análisis aparece acá."}
        </p>
        {onSubir && (
          <button
            onClick={onSubir}
            className="mt-4 inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-light"
          >
            <Upload className="w-4 h-4" /> Subir el reporte
          </button>
        )}
      </div>
    );
  }

  const varTotal =
    data.ventasExternasAnterior !== null && data.ventasExternasAnterior > 0
      ? Math.round(
          ((data.ventasExternas - data.ventasExternasAnterior) / data.ventasExternasAnterior) * 1000,
        ) / 10
      : null;

  const visibles = verTodos ? data.ranking : data.ranking.slice(0, 8);
  const grafico = data.ranking.slice(0, 8).map((c) => ({
    nombre: c.cliente.length > 22 ? c.cliente.slice(0, 21) + "…" : c.cliente,
    ventas: c.ventas,
    estado: c.estado,
  }));
  const crecieron = data.ranking.filter((c) => c.estado === "creció").length;
  const cayeron = data.ranking.filter((c) => c.estado === "cayó").length;
  const nuevos = data.ranking.filter((c) => c.estado === "nuevo").length;

  return (
    <div className="space-y-4">
      {/* Encabezado + período */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Clientes de Atelier</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Semana del {fechaCorta(data.periodo!.inicio)} al {fechaCorta(data.periodo!.fin)}
            {data.periodoAnterior && (
              <> · comparado con {fechaCorta(data.periodoAnterior.inicio)}–{fechaCorta(data.periodoAnterior.fin)}</>
            )}
          </p>
        </div>
        {onSubir && (
          <button
            onClick={onSubir}
            className="inline-flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50"
          >
            <Upload className="w-3.5 h-3.5" /> Subir reporte
          </button>
        )}
      </div>

      {/* Los 4 números que importan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Venta a clientes
          </div>
          <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
            {formatCurrency(data.ventasExternas)}
          </div>
          <div className="text-[11px] mt-0.5">
            {varTotal === null ? (
              <span className="text-gray-400">primera semana</span>
            ) : (
              <span className={varTotal >= 0 ? "text-emerald-700" : "text-red-600"}>
                {varTotal >= 0 ? "▲" : "▼"} {Math.abs(varTotal).toFixed(1)}% vs semana anterior
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Clientes que compraron
          </div>
          <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
            {data.clientesExternos}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {nuevos > 0 ? `${nuevos} nuevo${nuevos === 1 ? "" : "s"} esta semana` : "sin clientes nuevos"}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Ticket promedio
          </div>
          <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
            {formatCurrency(data.ticketPromedio)}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">por pedido de cliente externo</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Concentración
          </div>
          <div className="text-xl font-bold text-gray-900 mt-1 tabular-nums">
            {data.concentracion.pesoTop3.toFixed(0)}%
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            lo hacen los 3 primeros
            {data.concentracion.pesoTop3 > 70 && (
              <span className="block text-amber-700 font-medium">riesgo: muy concentrado</span>
            )}
          </div>
        </div>
      </div>

      {/* Ventas a las sedes — separadas a propósito */}
      {data.sedes.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="flex items-start gap-2">
            <Building2 className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-700">
                Aparte: lo que Atelier le vendió a nuestras propias sedes
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
                No entra en el ranking de arriba. Para el grupo esto no es venta nueva: es producto
                que pasa de Atelier a la cafetería.
              </p>
              <div className="flex flex-wrap gap-4">
                {data.sedes.map((s) => (
                  <div key={s.sedeId} className="text-sm">
                    <span className="font-semibold text-gray-900">{s.sede}</span>
                    <span className="text-gray-600 tabular-nums"> · {formatCurrency(s.ventas)}</span>
                    <span className="text-gray-400 text-xs"> ({s.pedidos} pedidos)</span>
                  </div>
                ))}
                <div className="text-sm border-l border-gray-300 pl-4">
                  <span className="text-gray-500">Total </span>
                  <span className="font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(data.ventasSedes)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico: quién compra más */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Quién compró más esta semana</h3>
        <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
          Solo clientes externos. Verde = creció, rojo = cayó, ámbar = nuevo.
        </p>
        <div className="h-64 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v}`} />
              <YAxis
                type="category"
                dataKey="nombre"
                width={140}
                tick={{ fontSize: 10 }}
                interval={0}
              />
              <Tooltip
                formatter={(v) => [formatCurrency(Number(v)), "Ventas"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="ventas" radius={[0, 4, 4, 0]}>
                {grafico.map((g, i) => (
                  <Cell
                    key={i}
                    fill={
                      g.estado === "creció" ? VERDE
                        : g.estado === "cayó" ? ROJO
                        : g.estado === "nuevo" ? AMBAR
                        : VERDE_OSCURO
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Evolución semana a semana */}
      {data.historial.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Cómo viene la venta a clientes</h3>
          <p className="text-[11px] text-gray-500 mt-0.5 mb-3">
            Cada punto es una semana importada.
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.historial} margin={{ left: 4, right: 12, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="periodo" tickFormatter={fechaCorta} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `S/${v}`} width={56} />
                <Tooltip
                  formatter={(v, n) => [
                    formatCurrency(Number(v)),
                    n === "externas" ? "Clientes externos" : "A nuestras sedes",
                  ]}
                  labelFormatter={(l) => (typeof l === "string" ? fechaCorta(l) : String(l ?? ""))}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line
                  type="monotone" dataKey="externas" stroke={VERDE} strokeWidth={2}
                  dot={{ r: 3 }} name="externas"
                />
                <Line
                  type="monotone" dataKey="sedes" stroke="#9CA3AF" strokeWidth={2}
                  strokeDasharray="4 4" dot={{ r: 2 }} name="sedes"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Alerta: dejaron de comprar */}
      {data.dejaronDeComprar.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-amber-900">
                {data.dejaronDeComprar.length} cliente
                {data.dejaronDeComprar.length === 1 ? "" : "s"} no compró esta semana
              </div>
              <p className="text-[11px] text-amber-800/80 mt-0.5 mb-2">
                Compraron la semana pasada y esta no aparecen. Vale una llamada.
              </p>
              <div className="space-y-1">
                {data.dejaronDeComprar.slice(0, 6).map((c) => (
                  <div key={c.cliente} className="flex justify-between text-xs gap-3">
                    <span className="text-amber-900">{c.cliente}</span>
                    <span className="tabular-nums text-amber-800 whitespace-nowrap">
                      compró {formatCurrency(c.ventasAnteriores)}
                    </span>
                  </div>
                ))}
                {data.dejaronDeComprar.length > 6 && (
                  <div className="text-[11px] text-amber-700">
                    y {data.dejaronDeComprar.length - 6} más
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla completa */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Todos los clientes</h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {crecieron} crecieron · {cayeron} cayeron · {nuevos} nuevos
            </p>
          </div>
          {data.sinComprobante > 0 && (
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              {data.sinComprobante} pedido{data.sinComprobante === 1 ? "" : "s"} sin comprobante
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[620px]">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 text-left font-semibold">#</th>
                <th className="px-4 py-2 text-left font-semibold">Cliente</th>
                <th className="px-4 py-2 text-right font-semibold">Ventas</th>
                <th className="px-4 py-2 text-right font-semibold">Peso</th>
                <th className="px-4 py-2 text-right font-semibold">Pedidos</th>
                <th className="px-4 py-2 text-right font-semibold">Ticket</th>
                <th className="px-4 py-2 text-right font-semibold">vs. semana ant.</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c, i) => (
                <tr key={c.documento ?? c.cliente} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2">
                    <div className="text-gray-900">{c.cliente}</div>
                    {c.documento && (
                      <div className="text-[10px] text-gray-400 tabular-nums">{c.documento}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                    {formatCurrency(c.ventas)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                    {c.peso.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">{c.pedidos}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                    {formatCurrency(c.ticket)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Variacion pct={c.variacionPct} estado={c.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.ranking.length > 8 && (
          <button
            onClick={() => setVerTodos((v) => !v)}
            className="w-full px-4 py-2.5 text-xs font-medium text-primary hover:bg-gray-50 border-t border-gray-100"
          >
            {verTodos ? "Ver solo los 8 primeros" : `Ver los ${data.ranking.length} clientes`}
          </button>
        )}
      </div>
    </div>
  );
}
