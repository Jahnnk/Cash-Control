"use client";

/**
 * «Piso de precios» (Grupo → Productos → El mes). De la asesoría con el coach de negocios
 * (15-oct-2026): el precio mínimo de un producto es su costo × 3 (así el costo se queda cerca del
 * 33% del precio) y cada producto debe dejar un margen bruto de 65–70% o más. Muestra qué productos
 * de la carta venden por debajo del piso, a cuánto subirlos y lo que dejaría al mes si se vendiera
 * igual. Se apoya en «¿Dónde ganamos plata?»: mismos precios (Byte) y costos (Excel de pricing),
 * nada nuevo que cargar. Reglas: lib/productos/piso-precios.ts. Va plegada.
 */

import { useEffect, useState } from "react";
import { getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { esCafeteria } from "@/lib/productos/cafeterias";
import { MARGEN_IDEAL_PCT, MARGEN_MINIMO_PCT, MULTIPLO_PISO, pisoDePrecios, type EstadoPiso, type FilaPiso, type PisoSede } from "@/lib/productos/piso-precios";
import { Pastilla, SeccionDesplegable, fechaCorta, nombreMes } from "@/components/productos/ui";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const ESTADO: Record<EstadoPiso, { texto: string; tono: "verde" | "ambar" | "rojo" }> = {
  holgado: { texto: "Holgado", tono: "verde" },
  sano: { texto: "Sano", tono: "verde" },
  bajo: { texto: "Bajo el piso", tono: "ambar" },
};

function Tabla({ filas }: { filas: FilaPiso[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2.5 pl-4 pr-3">Producto</th>
            <th className="text-right font-medium py-2.5 px-3">Precio hoy</th>
            <th className="text-right font-medium py-2.5 px-3">Costo de insumos</th>
            <th className="text-right font-medium py-2.5 px-3">Margen</th>
            <th className="text-right font-medium py-2.5 px-3">Piso (costo × {MULTIPLO_PISO})</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Dejaría al mes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f) => (
            <tr key={f.nombre}>
              <td className="py-2.5 pl-4 pr-3 align-top">
                <div className="text-gray-900 leading-tight">{f.nombre}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Pastilla tono={ESTADO[f.estado].tono}>{ESTADO[f.estado].texto}</Pastilla>
                  {f.deAtelier && <span className="text-[10px] text-gray-400">lo hace Atelier</span>}
                </div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700 align-top whitespace-nowrap">
                {soles(f.precio)}
                <div className="text-[10px] text-gray-400">{f.unidades.toLocaleString("es-PE")} u</div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700 align-top whitespace-nowrap">
                {soles(f.costo)}
                <div className="text-[10px] text-gray-400">{pct(f.costoPct)} del precio</div>
              </td>
              <td className={`py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap ${f.estado === "bajo" ? "text-amber-700 font-medium" : "text-gray-900"}`}>{pct(f.margenPct)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap">
                {f.estado === "bajo" ? (
                  <>
                    <span className="font-semibold text-gray-900">{soles(f.precioSugerido)}</span>
                    <div className="text-[10px] text-gray-400">+{soles(f.subida)} por unidad</div>
                  </>
                ) : <span className="text-gray-400">ya lo cumple</span>}
              </td>
              <td className="py-2.5 pl-3 pr-4 text-right tabular-nums align-top font-semibold text-gray-900 whitespace-nowrap">{f.extraMes > 0 ? `+${soles0(f.extraMes)}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cuerpo({ d }: { d: PisoSede }) {
  const [todos, setTodos] = useState(false);
  const bajo = d.filas.filter((f) => f.estado === "bajo");
  const visibles = todos ? d.filas : bajo.slice(0, 12);
  const aMedias = d.hasta < finDeMes(d.mes);
  const margenOk = d.margenCartaPct !== null && d.margenCartaPct >= MARGEN_MINIMO_PCT;

  return (
    <div className="space-y-5">
      {aMedias && <p className="text-[11px] text-amber-700">Mes a medias: el reporte de Byte llega hasta el {fechaCorta(d.hasta)}.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Bajo el piso</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${d.bajo > 0 ? "text-amber-700" : "text-emerald-700"}`}>{d.bajo} de {d.conCosto}</div>
          <div className="text-xs text-gray-500">productos con margen menor a {MARGEN_MINIMO_PCT}%{d.ventasBajoPct !== null ? ` (${d.ventasBajoPct}% de lo vendido)` : ""}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Margen bruto de la carta</div>
          <div className={`mt-1 text-xl font-semibold tabular-nums ${margenOk ? "text-emerald-700" : "text-amber-700"}`}>{pct(d.margenCartaPct)}</div>
          <div className="text-xs text-gray-500">lo sano es de {MARGEN_MINIMO_PCT}% a {MARGEN_IDEAL_PCT}% o más</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Si subieran al piso</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{d.extraTotal > 0 ? `+${soles0(d.extraTotal)}` : "—"}</div>
          <div className="text-xs text-gray-500">más al mes, si se vendiera igual</div>
        </div>
      </div>

      {bajo.length === 0 ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-900">Ningún producto con costo conocido está bajo el piso este mes.</p>
      ) : (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">{todos ? "Todos los productos" : `Los ${Math.min(12, bajo.length)} que más dejarían`}, de mayor a menor</h4>
          <Tabla filas={visibles} />
          {(bajo.length > 12 || d.filas.length > bajo.length) && (
            <button type="button" onClick={() => setTodos(!todos)} className="mt-2 text-xs font-medium text-primary hover:underline">
              {todos ? "Ver solo los que están bajo el piso" : `Ver los ${d.filas.length} productos`}
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
        <p><strong>El piso</strong> es el costo × {MULTIPLO_PISO}: así el costo se queda cerca de un tercio del precio. <strong>Margen bruto</strong> = (precio − costo) ÷ precio; lo sano es de {MARGEN_MINIMO_PCT}% a {MARGEN_IDEAL_PCT}% o más. Un producto está «bajo el piso» si su margen es menor a {MARGEN_MINIMO_PCT}%; entonces se sugiere subirlo a costo × {MULTIPLO_PISO}, redondeado a S/ 0.10.</p>
        <p><strong>«Dejaría al mes»</strong> es una cuenta: la subida por unidad × lo que se vendió. No es una predicción: un precio más alto puede vender menos. Sirve para ordenar por dónde empezar. El precio es el que Byte cobró en promedio (con promociones y descuentos); el costo sale del Excel de pricing, igual que en «¿Dónde ganamos plata?».</p>
        <p><strong>El costo es el de insumos</strong> (lo que el coach llama food cost): la receta de la cafetería o, en lo que hace Atelier, el costo de Atelier. No es el precio interno al que Atelier se lo vende a la cafetería: ese ya trae el margen de Atelier y multiplicarlo por {MULTIPLO_PISO} lo contaría dos veces.{d.sinInsumos > 0 ? ` ${d.sinInsumos} ${d.sinInsumos === 1 ? "producto no tiene" : "productos no tienen"} costo de insumos conocido y no entran.` : ""}</p>
      </div>
    </div>
  );
}

export function PisoPrecios({ month, sede }: { month: string; sede: number }) {
  const [estado, setEstado] = useState<{ clave: string; data: PisoSede | null; error: string | null } | null>(null);
  const clave = `${month}-${sede}`;

  useEffect(() => {
    if (!esCafeteria(sede)) return;
    let vivo = true;
    getRentabilidadProductos(month, sede).then((r) => {
      if (!vivo) return;
      setEstado(r.ok ? { clave, data: r.data ? pisoDePrecios(r.data) : null, error: null } : { clave, data: null, error: r.error });
    });
    return () => { vivo = false; };
  }, [month, sede, clave]);

  if (!esCafeteria(sede)) return null;
  const listo = estado && estado.clave === clave ? estado : null;
  const d = listo?.data ?? null;

  const resumen = !listo
    ? <p className="text-xs text-gray-400">Calculando…</p>
    : d
      ? <p className="text-xs text-gray-600">
          <strong className={d.bajo > 0 ? "text-amber-700" : "text-emerald-700"}>{d.bajo} de {d.conCosto}</strong> productos venden por debajo del piso ·
          margen bruto de la carta <strong className="text-gray-800">{pct(d.margenCartaPct)}</strong>
          {d.extraTotal > 0 && <> · subirlos dejaría <strong className="text-gray-800">+{soles0(d.extraTotal)}</strong> al mes si se vendiera igual</>}.
        </p>
      : <p className="text-xs text-gray-500">Sin reporte de rotación de {nombreMes(month)}.</p>;

  return (
    <SeccionDesplegable
      titulo="Piso de precios"
      subtitulo={`El precio mínimo de cada producto: su costo × ${MULTIPLO_PISO}, con un margen bruto de ${MARGEN_MINIMO_PCT}% a ${MARGEN_IDEAL_PCT}% o más.`}
      resumen={resumen}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !listo ? <p className="text-sm text-gray-400">Calculando…</p>
        : d ? <Cuerpo d={d} />
        : <p className="text-sm text-gray-500">Esta sede no tiene reporte de rotación de {nombreMes(month)}.</p>}
    </SeccionDesplegable>
  );
}
