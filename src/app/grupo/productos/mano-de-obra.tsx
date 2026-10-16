"use client";

/**
 * «Mano de obra por producto» (Grupo → Productos → El mes). De la asesoría con el coach de negocios
 * (15-oct-2026), tres métodos para el costo real de la mano de obra: (1) planilla ÷ ventas, rango
 * sano 20–25%; (2) la planilla repartida por ventas entre los productos: qué plato paga más sueldos;
 * (3) tiempo de preparación (pendiente: faltan los minutos de cada receta). Esta sección es el 1 y el 2.
 * Cálculo: lib/productos/mano-de-obra.ts. Va plegada y calcula al abrirla.
 */

import { useState } from "react";
import { getManoDeObraProductos } from "@/app/actions/mano-de-obra-productos";
import { esCafeteria } from "@/lib/productos/cafeterias";
import { estadoPlanilla, PLANILLA_SANA_MIN_PCT, TOPE_PLANILLA_PCT, type EstadoPlanilla } from "@/lib/regla-33";
import type { FilaManoDeObra, ManoDeObraSede } from "@/lib/productos/mano-de-obra";
import { Pastilla, SeccionDesplegable, nombreMes } from "@/components/productos/ui";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);

const PLANILLA: Record<EstadoPlanilla, { texto: string; tono: "verde" | "ambar" | "gris"; color: string }> = {
  sana: { texto: "Sana", tono: "verde", color: "text-emerald-700" },
  alta: { texto: "Alta", tono: "ambar", color: "text-amber-700" },
  baja: { texto: "Baja", tono: "gris", color: "text-gray-700" },
};

function Tabla({ filas }: { filas: FilaManoDeObra[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2.5 pl-4 pr-3">Producto</th>
            <th className="text-right font-medium py-2.5 px-3">Vendió</th>
            <th className="text-right font-medium py-2.5 px-3">Sueldos que paga</th>
            <th className="text-right font-medium py-2.5 px-3">Sueldos por unidad</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Queda tras insumos y sueldos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f) => (
            <tr key={f.nombre}>
              <td className="py-2.5 pl-4 pr-3 align-top">
                <div className="text-gray-900 leading-tight">{f.nombre}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {f.estado === "bajo" && <Pastilla tono="ambar">Bajo la meta</Pastilla>}
                  {f.estado === "sin-costo" && <span className="text-[10px] text-gray-400">sin costo de insumos</span>}
                  {f.deAtelier && <span className="text-[10px] text-gray-400">lo hace Atelier</span>}
                </div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700 align-top whitespace-nowrap">
                {soles0(f.ingresos)}
                <div className="text-[10px] text-gray-400">{f.unidades.toLocaleString("es-PE")} u · {soles(f.precio)} c/u</div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap">
                <span className="font-semibold text-gray-900">{soles0(f.moTotal)}</span>
                <div className="text-[10px] text-gray-400">{pct(f.participacionPct)} de la planilla</div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700 align-top whitespace-nowrap">{soles(f.moUnidad)}</td>
              <td className={`py-2.5 pl-3 pr-4 text-right tabular-nums align-top whitespace-nowrap ${f.estado === "bajo" ? "text-amber-700 font-medium" : "text-gray-900"}`}>
                {f.margenPct === null ? "—" : pct(f.margenPct)}
                {f.margenUnidad !== null && <div className="text-[10px] font-normal text-gray-400">{soles(f.margenUnidad)} c/u</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cuerpo({ d, nota }: { d: ManoDeObraSede; nota: string | null }) {
  const [todos, setTodos] = useState(false);
  const est = estadoPlanilla(d.planillaPct);
  const visibles = todos ? d.filas : d.filas.slice(0, 12);
  const margenOk = d.margenCartaPct !== null && d.margenCartaPct >= d.metaPct;
  return (
    <div className="space-y-5">
      {nota && <p className="text-[11px] text-amber-700">{nota}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">1 · Planilla sobre ventas</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${PLANILLA[est].color}`}>{pct(d.planillaPct)}</div>
          <div className="text-xs text-gray-500">lo sano es de {PLANILLA_SANA_MIN_PCT}% a {TOPE_PLANILLA_PCT}% · {nombreMes(d.base.mes)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">2 · Planilla repartida</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{soles0(d.repartida)}</div>
          <div className="text-xs text-gray-500">de lo vendido en el período, entre {d.filas.length} productos; los 5 que más venden pagan el {pct(d.top5Pct)}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Queda tras insumos y sueldos</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${margenOk ? "text-emerald-700" : "text-amber-700"}`}>{pct(d.margenCartaPct)}</div>
          <div className="text-xs text-gray-500">de la carta · la regla pide {pct(d.metaPct)} para otros fijos y EBITDA</div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">{todos ? "Todos los productos" : "Los 12 que más sueldos pagan"}, de mayor a menor</h4>
        <Tabla filas={visibles} />
        {d.filas.length > 12 && (
          <button type="button" onClick={() => setTodos(!todos)} className="mt-2 text-xs font-medium text-primary hover:underline">
            {todos ? "Ver solo los 12 primeros" : `Ver los ${d.filas.length} productos`}
          </button>
        )}
      </div>

      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
        <p><strong>Método 1:</strong> planilla ÷ ventas de {nombreMes(d.base.mes)} ({soles0(d.base.planilla)} ÷ {soles0(d.base.ventas)}). Lo sano es de {PLANILLA_SANA_MIN_PCT}% a {TOPE_PLANILLA_PCT}%.</p>
        <p><strong>Método 2:</strong> la planilla se reparte entre los productos en proporción a lo que cada uno vende. Sirve para ver, en soles, qué plato paga más sueldos y cuánto lleva cada unidad. <strong>Ojo:</strong> como se reparte por ventas, todos cargan el mismo % de su precio; no dice cuál producto es lento de preparar (eso lo dirá el método 3, cuando carguemos los minutos de cada receta).</p>
        <p>«Queda tras insumos y sueldos» = precio − costo de insumos − sueldos de la unidad. La meta es 100% − un tercio de insumos − {TOPE_PLANILLA_PCT}% de planilla; lo que queda paga los demás fijos y el EBITDA. El precio es el que Byte cobró en promedio; el costo es el de insumos, igual que en «Piso de precios».</p>
      </div>
    </div>
  );
}

export function ManoDeObra({ month, sede }: { month: string; sede: number }) {
  const [estado, setEstado] = useState<{ clave: string; data: ManoDeObraSede | null; nota: string | null; error: string | null } | null>(null);
  const clave = `${month}-${sede}`;
  if (!esCafeteria(sede)) return null;
  const listo = estado && estado.clave === clave ? estado : null;
  const cargar = () => {
    if (listo) return;
    getManoDeObraProductos(month, sede).then((r) => setEstado(r.ok ? { clave, data: r.data, nota: r.nota, error: null } : { clave, data: null, nota: null, error: r.error }));
  };

  return (
    <SeccionDesplegable
      titulo="Mano de obra por producto"
      subtitulo="Qué porcentaje de la venta se va en sueldos y cuánto paga cada producto: la planilla repartida por ventas."
      resumen={<p className="text-xs text-gray-500">Ábrela para ver cuánto de la planilla paga cada producto de la carta.</p>}
      onAbrir={cargar}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !listo ? <p className="text-sm text-gray-400">Calculando…</p>
        : listo.data ? <Cuerpo d={listo.data} nota={listo.nota} />
        : <p className="text-sm text-gray-500">{listo.nota ?? `No hay reporte de rotación de ${nombreMes(month)} o falta un mes con la planilla completa.`}</p>}
    </SeccionDesplegable>
  );
}
