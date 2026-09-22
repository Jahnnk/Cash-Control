"use client";

/**
 * Informe trimestral de rotación en Grupo — el "Reporte_Trimestral_Fonavi.xlsx"
 * de Jahnn dentro del sistema (pedido del 22-sep-2026), con sus mismas vistas:
 * comparativo mensual, categorías por mes, top 10 (del trimestre y de cada
 * mes), ranking por categoría con tendencia, clase ABC y recomendación, y lo
 * que no es carta.
 *
 * Arriba va el comparativo de las tres sedes y el cruce de las dos fuentes de
 * carga (la del administrador y la de dirección): si no coinciden, se ve acá
 * antes de mirar cualquier ranking.
 */

import { useEffect, useState } from "react";
import { Loader2, BarChart3, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import {
  getInformeTrimestral, getCruceFuentes,
  type InformeTrimestralSede, type CruceFuentes,
} from "@/app/actions/productos-panorama";
import type { ClaseABC, ProductoTrimestre, Tendencia } from "@/lib/productos/trimestral";

const SEDES = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

const COLOR_TENDENCIA: Record<Tendencia, string> = {
  Creciendo: "text-emerald-700",
  Estable: "text-gray-600",
  Cayendo: "text-red-700",
  Nuevo: "text-sky-700",
  "Dejó de venderse": "text-amber-700",
  "Sin datos": "text-gray-400",
};
const COLOR_CLASE: Record<ClaseABC, string> = {
  A: "bg-primary/10 text-primary",
  B: "bg-amber-50 text-amber-800",
  C: "bg-gray-100 text-gray-600",
};

const mesCorto = (m: string) => monthLabel(m).split(" ")[0];

function Variacion({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-400">—</span>;
  return <span className={v >= 15 ? "text-emerald-700" : v <= -15 ? "text-red-700" : "text-gray-600"}>{v > 0 ? "+" : ""}{v}%</span>;
}

function FilaProducto({ p, meses }: { p: ProductoTrimestre; meses: string[] }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-1.5 text-gray-900">{p.nombre}</td>
      {meses.map((m) => {
        const x = p.porMes.find((y) => y.month === m);
        return (
          <td key={m} className="px-2 py-1.5 text-right tabular-nums text-gray-600">
            {x && x.unidades > 0 ? <>{x.unidades} u<span className="block text-[10px] text-gray-400">{formatCurrency(x.ingresos)}</span></> : "—"}
          </td>
        );
      })}
      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatCurrency(p.ingresos)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{p.pctFamilia}%</td>
      <td className="px-2 py-1.5 text-center">
        <span className={`text-[11px] px-1.5 py-0.5 rounded ${COLOR_CLASE[p.clase]}`}>{p.clase}</span>
      </td>
      <td className={`px-2 py-1.5 text-xs whitespace-nowrap ${COLOR_TENDENCIA[p.tendencia]}`}>
        {p.tendencia}{p.variacionPct !== null && p.tendencia !== "Dejó de venderse" ? ` (${p.variacionPct > 0 ? "+" : ""}${p.variacionPct}%)` : ""}
      </td>
      <td className="px-3 py-1.5 text-xs text-gray-600">{p.recomendacion}</td>
    </tr>
  );
}

export function InformeTrimestralGrupo({ hastaMes }: { hastaMes: string }) {
  const [sede, setSede] = useState(2);
  const [data, setData] = useState<{ sede: InformeTrimestralSede; comparativo: { businessId: number; sede: string; ventas: number; unidades: number; familias: { familia: string; pct: number }[] }[] } | null>(null);
  const [cruce, setCruce] = useState<CruceFuentes[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    /* eslint-disable react-hooks/set-state-in-effect -- se recarga al cambiar sede o mes */
    setCargando(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    Promise.all([getInformeTrimestral(hastaMes, sede), getCruceFuentes(hastaMes)])
      .then(([r, c]) => {
        if (!vivo) return;
        setData(r.ok ? { sede: r.sede, comparativo: r.comparativo } : null);
        setCruce(c.ok ? c.sedes : null);
      })
      .catch(() => { if (vivo) setData(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [hastaMes, sede]);

  if (cargando) {
    return <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  const t = data?.sede.informe;
  const meses = data?.sede.meses ?? [];
  const avisos = (cruce ?? []).filter((c) => c.aviso);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Informe trimestral de rotación
          </div>
          <div className="text-[11px] text-gray-500">
            {meses.length > 0 ? `${monthLabel(meses[0])} · ${monthLabel(meses[1] ?? meses[0])} · ${monthLabel(meses[meses.length - 1])}` : ""} ·
            {" "}fuente: reportes «Platos con mayor rotación» de Byte
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {SEDES.map((s) => (
            <button key={s.id} type="button" onClick={() => setSede(s.id)}
              className={`px-3 py-1.5 rounded-lg border ${s.id === sede ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-300"}`}>
              {s.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Cruce de las dos fuentes: lo primero que hay que saber */}
      {avisos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
          <div className="text-xs font-semibold text-amber-900 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Cruce de cargas ({monthLabel(hastaMes)})</div>
          {avisos.map((c) => <div key={c.businessId} className="text-[11px] text-amber-900">{c.sede}: {c.aviso}</div>)}
        </div>
      )}

      {/* Comparativo de las 3 sedes */}
      {data && data.comparativo.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {data.comparativo.map((c) => (
            <button key={c.businessId} type="button" onClick={() => setSede(c.businessId)}
              className={`text-left rounded-xl border p-3 ${c.businessId === sede ? "border-primary bg-primary/5" : "border-gray-200"}`}>
              <div className="text-xs text-gray-500">{c.sede}</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(c.ventas)}</div>
              <div className="text-[11px] text-gray-500">{c.unidades} unidades en el trimestre</div>
              <div className="text-[11px] text-gray-600 mt-1">
                {c.familias.slice(0, 3).map((f) => `${f.familia.split(",")[0].split(" y ")[0]} ${f.pct}%`).join(" · ")}
              </div>
            </button>
          ))}
        </div>
      )}

      {!t ? (
        <p className="text-xs text-gray-500">Esta sede no tiene reportes de rotación cargados en esos meses.</p>
      ) : (
        <>
          {/* 1 · Resumen y comparativo mensual */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Ventas del trimestre", formatCurrency(t.ventas)],
              ["Unidades", String(t.unidades)],
              [`Venta prom./día (${t.dias} días)`, formatCurrency(t.ventaPorDia)],
              ["Productos de carta", `${t.productos} · ${t.claseA} clase A`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-gray-200 p-3">
                <div className="text-lg font-bold text-gray-900 tabular-nums">{v}</div>
                <div className="text-[11px] text-gray-500">{k}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                  <th className="text-left px-3 py-1.5 font-medium">Mes</th>
                  <th className="text-right px-3 py-1.5 font-medium">Días</th>
                  <th className="text-right px-3 py-1.5 font-medium">Ventas</th>
                  <th className="text-right px-3 py-1.5 font-medium">Unidades</th>
                  <th className="text-right px-3 py-1.5 font-medium">Prom./día</th>
                  <th className="text-right px-3 py-1.5 font-medium">Productos</th>
                  <th className="text-right px-3 py-1.5 font-medium">Fuera de carta</th>
                </tr>
              </thead>
              <tbody>
                {t.meses.map((m) => (
                  <tr key={m.month} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium">
                      {monthLabel(m.month)}
                      {m.incompleto && <span className="block text-[10px] text-amber-700">solo {m.desde.slice(8)}/{m.desde.slice(5, 7)} → {m.hasta.slice(8)}/{m.hasta.slice(5, 7)}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{m.dias}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatCurrency(m.ventas)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{m.unidades}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{formatCurrency(m.ventaPorDia)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{m.productos}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">{formatCurrency(m.fueraDeCarta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 2 · Categorías por mes */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                  <th className="text-left px-3 py-1.5 font-medium">Categoría</th>
                  {meses.map((m) => <th key={m} className="text-right px-2 py-1.5 font-medium">{mesCorto(m)}</th>)}
                  <th className="text-right px-3 py-1.5 font-medium">Trimestre</th>
                  <th className="text-right px-2 py-1.5 font-medium">%</th>
                  <th className="text-right px-2 py-1.5 font-medium">Var.</th>
                </tr>
              </thead>
              <tbody>
                {t.familias.map((f) => (
                  <tr key={f.familia} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-800">{f.familia}</td>
                    {meses.map((m) => (
                      <td key={m} className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                        {formatCurrency(f.porMes.find((x) => x.month === m)?.ventas ?? 0)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatCurrency(f.ventas)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{f.pct}%</td>
                    <td className="px-2 py-1.5 text-right tabular-nums"><Variacion v={f.variacionPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 3 · Top 10 del trimestre y de cada mes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-800">
                Top 10 del trimestre <span className="text-xs font-normal text-gray-500">· explican {t.concentracionTop10}%</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {t.top.map((p, i) => (
                    <tr key={p.nombre} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-400 tabular-nums w-6">{i + 1}</td>
                      <td className="px-2 py-1.5 text-gray-900">{p.nombre}<span className="block text-[10px] text-gray-400">{p.familia}</span></td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{p.unidades} u</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatCurrency(p.ingresos)}<span className="block text-[10px] text-gray-400">{p.pctTrimestre}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-800">Top 10 por mes</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
                {t.topPorMes.map((m) => (
                  <div key={m.month}>
                    <div className="text-[11px] font-semibold text-primary mb-1">{monthLabel(m.month)}</div>
                    <ol className="text-[11px] text-gray-700 space-y-0.5">
                      {m.productos.slice(0, 10).map((p, i) => (
                        <li key={p.nombre} className="flex justify-between gap-2">
                          <span className="truncate">{i + 1}. {p.nombre}</span>
                          <span className="tabular-nums text-gray-500 shrink-0">{formatCurrency(p.ingresos)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4 · Ranking por categoría */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-gray-900">Ranking por categoría</div>
            {t.familias.map((f) => {
              const abierto = abierta === f.familia;
              const lista = abierto ? (verTodos ? f.productos : f.productos.slice(0, 12)) : [];
              return (
                <div key={f.familia} className="rounded-xl border border-gray-200 overflow-hidden">
                  <button type="button" onClick={() => { setAbierta(abierto ? null : f.familia); setVerTodos(false); }}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm">
                    <span className="font-semibold text-gray-800">{f.familia} <span className="font-normal text-gray-500">· {f.productos.length} productos · {formatCurrency(f.ventas)} ({f.pct}%)</span></span>
                    {abierto ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </button>
                  {abierto && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[11px] uppercase text-gray-500 bg-white border-b border-gray-100">
                            <th className="text-left px-3 py-1.5 font-medium">Producto</th>
                            {meses.map((m) => <th key={m} className="text-right px-2 py-1.5 font-medium">{mesCorto(m)}</th>)}
                            <th className="text-right px-3 py-1.5 font-medium">Trimestre</th>
                            <th className="text-right px-2 py-1.5 font-medium">% cat.</th>
                            <th className="text-center px-2 py-1.5 font-medium">ABC</th>
                            <th className="text-left px-2 py-1.5 font-medium">Tendencia</th>
                            <th className="text-left px-3 py-1.5 font-medium">Recomendación</th>
                          </tr>
                        </thead>
                        <tbody>{lista.map((p) => <FilaProducto key={p.nombre} p={p} meses={meses} />)}</tbody>
                      </table>
                      {f.productos.length > 12 && (
                        <button type="button" onClick={() => setVerTodos((v) => !v)} className="w-full px-3 py-2 text-xs text-primary bg-gray-50 border-t border-gray-100">
                          {verTodos ? "Ver solo los 12 primeros" : `Ver los ${f.productos.length} productos`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 5 · Lo que no es carta */}
          {t.fueraDeCarta.ventas > 0 && (
            <div className="text-[11px] text-gray-500">
              Fuera de los rankings, {formatCurrency(t.fueraDeCarta.ventas)} que no es carta (delivery, extras, packaging, retail y combos puntuales):
              {" "}{t.fueraDeCarta.filas.slice(0, 5).map((f) => `${f.nombre.toLowerCase()} ${formatCurrency(f.ingresos)}`).join(" · ")}
              {t.fueraDeCarta.filas.length > 5 ? "…" : ""}.
            </div>
          )}
          <div className="text-[11px] text-gray-400">
            Clase A = productos que juntan el 80% de la venta · B hasta 95% · C el resto. Tendencia = último mes contra el primero
            (≥ +15% creciendo, ≤ −15% cayendo). La recomendación no mira costos ni márgenes: antes de sacar algo de carta, cruzar con
            el Pricing Maestro y confirmar si hubo quiebre de stock.
          </div>
        </>
      )}
    </div>
  );
}
