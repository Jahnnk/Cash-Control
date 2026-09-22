"use client";

/**
 * "Qué se vendió este mes" — las tres vistas del informe de ventas de Jahnn
 * (21-sep-2026): panorama por familia, los 10 productos con más ingresos y el
 * ranking de postres y pastelería.
 *
 * Se usa igual en el panel de cada sede y en el panel de Grupo, con los datos
 * de la carga de los sábados (reporte "Platos con mayor rotación" de Byte).
 */

import { useState } from "react";
import { ShoppingBag, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PanoramaProductos, ProductoRanking } from "@/lib/productos/panorama";

const COLOR_FAMILIA: Record<string, string> = {
  "Postres y pastelería": "bg-primary",
  "Sánguches, platos y desayunos": "bg-amber-500",
  "Empanadas": "bg-orange-400",
  "Jugos, batidos y bebidas frías": "bg-sky-500",
  "Panes y masa madre": "bg-yellow-600",
  "Café e infusiones": "bg-stone-500",
  "Otros (extras y retail)": "bg-gray-300",
};

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${Number(d)} ${meses[Number(m) - 1]}`;
}

function Tabla({ filas, mostrarFamilia }: { filas: ProductoRanking[]; mostrarFamilia?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
            <th className="text-left px-3 py-1.5 font-medium">#</th>
            <th className="text-left px-3 py-1.5 font-medium">Producto</th>
            {mostrarFamilia && <th className="text-left px-3 py-1.5 font-medium">Familia</th>}
            <th className="text-right px-3 py-1.5 font-medium">Precio</th>
            <th className="text-right px-3 py-1.5 font-medium">Unid.</th>
            <th className="text-right px-3 py-1.5 font-medium">Ingresos</th>
            <th className="text-right px-3 py-1.5 font-medium">U./día</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((p, i) => (
            <tr key={p.nombre} className="border-t border-gray-100">
              <td className="px-3 py-1.5 text-gray-400 tabular-nums">{i + 1}</td>
              <td className="px-3 py-1.5 text-gray-900">{p.nombre}</td>
              {mostrarFamilia && <td className="px-3 py-1.5 text-xs text-gray-500">{p.familia}</td>}
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{p.precio === null ? "—" : formatCurrency(p.precio)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{p.unidades}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{formatCurrency(p.ingresos)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{p.unidadesPorDia ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanoramaProductosVista({ p, titulo, cargadoEl }: { p: PanoramaProductos; titulo?: string; cargadoEl?: string | null }) {
  const [verTop, setVerTop] = useState(true);
  const [verPostres, setVerPostres] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" /> {titulo ?? "Qué se vendió este mes"}
          </div>
          <div className="text-[11px] text-gray-500">
            Del {fechaCorta(p.desde)} al {fechaCorta(p.hasta)} ({p.dias} días) · reporte de Byte que sube la sede
            {cargadoEl ? ` · cargado el ${fechaCorta(cargadoEl.slice(0, 10))}` : ""}
          </div>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(p.ventas)}</div>
            <div className="text-[11px] text-gray-500">vendido · {formatCurrency(p.ventaPorDia)}/día</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{p.unidades}</div>
            <div className="text-[11px] text-gray-500">unidades · {p.productos} productos</div>
          </div>
        </div>
      </div>

      {/* 1 · Panorama del mes */}
      <div className="space-y-1.5">
        <div className="flex h-3 rounded-full overflow-hidden">
          {p.familias.map((f) => (
            <div key={f.familia} className={COLOR_FAMILIA[f.familia] ?? "bg-gray-300"} style={{ width: `${f.pct}%` }} title={`${f.familia}: ${f.pct}%`} />
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {p.familias.map((f) => (
                <tr key={f.familia} className="border-b border-gray-50 last:border-0">
                  <td className="py-1.5 pr-2 w-4"><span className={`inline-block w-2.5 h-2.5 rounded-full ${COLOR_FAMILIA[f.familia] ?? "bg-gray-300"}`} /></td>
                  <td className="py-1.5 text-gray-800">{f.familia}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{formatCurrency(f.ventas)}</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500 w-16">{f.unidades} u</td>
                  <td className="py-1.5 text-right tabular-nums text-gray-500 w-14">{f.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2 · Los 10 productos con más ingresos */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => setVerTop((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-800">
          <span>Los {p.top.length} productos con más ingresos</span>
          <span className="flex items-center gap-2 text-xs font-normal text-gray-500">
            explican {p.concentracionTop10}% de las ventas {verTop ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>
        {verTop && <Tabla filas={p.top} mostrarFamilia />}
      </div>

      {/* 3 · Ranking de postres y pastelería */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => setVerPostres((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-semibold text-gray-800">
          <span>Ranking de postres y pastelería</span>
          <span className="flex items-center gap-2 text-xs font-normal text-gray-500">
            {p.postres.length} productos {verPostres ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>
        {verPostres && <Tabla filas={p.postres} />}
      </div>

      <div className="text-[11px] text-gray-500 space-y-0.5">
        <div>{p.colaLarga} productos vendieron 3 unidades o menos en el período: la cola larga que conviene revisar en la carta.</div>
        {p.eliminadas.lineas > 0 && (
          <div>
            Fuera del ranking: {p.eliminadas.lineas} línea(s) anuladas o de ajuste del reporte de Byte por {formatCurrency(p.eliminadas.ingresos)}
            {" "}({p.eliminadas.detalle.slice(0, 3).map((d) => d.nombre.toLowerCase()).join(", ")}
            {p.eliminadas.detalle.length > 3 ? "…" : ""}).
          </div>
        )}
      </div>
    </div>
  );
}
