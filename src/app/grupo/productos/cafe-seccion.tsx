"use client";

/**
 * Grupo → Productos → El mes → «Cafés» (pedido de Jahnn, 3-nov-2026): cuánto se vende y cuánto deja solo el café,
 * frío y caliente, para decidir si Fonavi compra una máquina de café nueva. Plegada (regla de orden visual): cerrada
 * dice lo esencial; abierta, el detalle por producto y los 3 últimos meses.
 *
 * Sale de la rentabilidad por producto (la misma de «¿Dónde ganamos plata?»), así que el costo es el de la receta de
 * la cafetería y no incluye planilla, alquiler ni la máquina.
 */

import { useEffect, useState } from "react";
import { getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { esCafeteria } from "@/lib/productos/cafeterias";
import { resumenCafe, type ProductoCafe, type ResumenCafe } from "@/lib/productos/cafe";
import { SeccionDesplegable, nombreMes } from "@/components/productos/ui";

const soles0 = (n: number | null) => (n === null ? "—" : `S/ ${Math.round(n).toLocaleString("es-PE")}`);
const soles2 = (n: number | null) => (n === null ? "—" : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);

function mesAnterior(mes: string, atras: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - atras, 1));
  return d.toISOString().slice(0, 7);
}

type Estado = { clave: string; actual: ResumenCafe | null; error: string | null };

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{titulo}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{valor}</div>
      <div className="text-xs text-gray-500">{nota}</div>
    </div>
  );
}

function TablaProductos({ productos }: { productos: ProductoCafe[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2.5 pl-4 pr-3">Café</th>
            <th className="text-right font-medium py-2.5 px-3">Tazas</th>
            <th className="text-right font-medium py-2.5 px-3">Vendió</th>
            <th className="text-right font-medium py-2.5 px-3">Costo c/u</th>
            <th className="text-right font-medium py-2.5 px-3">Margen</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Cuánto deja</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {productos.map((p) => (
            <tr key={p.nombre}>
              <td className="py-2.5 pl-4 pr-3 text-gray-900 leading-tight">
                {p.nombre}
                <span className="block text-[11px] text-gray-400">{p.tipo === "frio" ? "Frío" : "Caliente"}</span>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{p.unidades.toLocaleString("es-PE")}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{soles0(p.ingresos)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{soles2(p.costo)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-900">{pct(p.margenPct)}</td>
              <td className="py-2.5 pl-3 pr-4 text-right tabular-nums font-semibold text-gray-900">{soles0(p.deja)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Meses({ filas }: { filas: { mes: string; r: ResumenCafe | null }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2.5 pl-4 pr-3">Mes</th>
            <th className="text-right font-medium py-2.5 px-3">Café vendido</th>
            <th className="text-right font-medium py-2.5 px-3">Tazas por día</th>
            <th className="text-right font-medium py-2.5 px-3">% de la carta</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Deja</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map(({ mes, r }) => (
            <tr key={mes}>
              <td className="py-2.5 pl-4 pr-3 text-gray-900">{nombreMes(mes)}</td>
              {r ? (
                <>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{soles0(r.ventas)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.tazasPorDia ?? "—"}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{pct(r.pctDeCarta)}</td>
                  <td className="py-2.5 pl-3 pr-4 text-right tabular-nums font-semibold text-gray-900">{soles0(r.deja)}</td>
                </>
              ) : (
                <td colSpan={4} className="py-2.5 px-3 text-right text-xs text-gray-400">Sin reporte de rotación</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cuerpo({ r, anteriores }: { r: ResumenCafe; anteriores: { mes: string; r: ResumenCafe | null }[] | null }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta titulo="Café vendido" valor={soles0(r.ventas)} nota={`${r.unidades.toLocaleString("es-PE")} tazas · ${pct(r.pctDeCarta)} de la carta`} />
        <Tarjeta titulo="Cuánto deja" valor={soles0(r.deja)} nota={`margen ${pct(r.margenPct)} · costo de preparar ${soles0(r.costo)}`} />
        <Tarjeta titulo="Por día" valor={`${r.tazasPorDia ?? "—"} tazas`} nota={`${soles0(r.ventasPorDia)} vendidos por día`} />
        <Tarjeta titulo="Por taza" valor={soles2(r.precioPromedio)} nota={r.unidades > 0 && r.deja !== null ? `deja ${soles2(r.deja / r.unidades)} por taza` : "precio promedio"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([["Café caliente", r.caliente], ["Café frío", r.frio]] as const).map(([titulo, t]) => (
          <div key={titulo} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{titulo}</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-lg font-semibold tabular-nums text-gray-900">{soles0(t.ventas)}</span>
              <span className="text-xs text-gray-500">{t.unidades.toLocaleString("es-PE")} tazas · deja {soles0(t.deja)} ({pct(t.margenPct)})</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Los últimos 3 meses</h4>
        {anteriores ? <Meses filas={[...anteriores, { mes: r.mes, r }]} /> : <p className="text-sm text-gray-400">Calculando…</p>}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Cada café, de mayor a menor venta</h4>
        <TablaProductos productos={r.productos} />
      </div>

      {r.sinCosto.length > 0 && (
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">{r.sinCosto.length === 1 ? "1 café sin costo" : `${r.sinCosto.length} cafés sin costo`}</strong> ({soles0(r.sinCosto.reduce((t, p) => t + p.ingresos, 0))} vendidos): {r.sinCosto.map((p) => p.nombre).join(", ")}. Cuentan en lo vendido pero no en lo que deja. Se cargan en Grupo → Recetas y costos.
        </p>
      )}

      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
        <p><strong>Qué cuenta como café:</strong> café pasado, americano, espresso, cortado, cappuccino, latte (con sabores), macchiato, moccaccino, affogato, cold brew y frappés. No cuentan las infusiones, el matcha (aunque se llame «latte»), los chocolates, los jugos ni los batidos.</p>
        <p><strong>Cuánto deja</strong> = lo vendido − lo que cuesta preparar cada taza (la receta de la cafetería). No descuenta planilla, alquiler ni la máquina: sirve para saber cuánto margen aporta el café, no para decir si la máquina se paga sola.</p>
      </div>
    </div>
  );
}

export function CafeSeccion({ month, sede }: { month: string; sede: number }) {
  const clave = `${month}-${sede}`;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [previos, setPrevios] = useState<{ clave: string; filas: { mes: string; r: ResumenCafe | null }[] } | null>(null);

  useEffect(() => {
    if (!esCafeteria(sede)) return;
    let vivo = true;
    getRentabilidadProductos(month, sede).then((x) => {
      if (!vivo) return;
      setEstado({ clave, actual: x.ok && x.data ? resumenCafe(x.data) : null, error: x.ok ? null : x.error });
    });
    return () => { vivo = false; };
  }, [month, sede, clave]);

  function cargarAnteriores() {
    if (previos?.clave === clave) return;
    Promise.all([2, 1].map((n) => {
      const mes = mesAnterior(month, n);
      return getRentabilidadProductos(mes, sede).then((x) => ({ mes, r: x.ok && x.data ? resumenCafe(x.data) : null }));
    })).then((filas) => setPrevios({ clave, filas }));
  }

  if (!esCafeteria(sede)) return null;
  const listo = estado && estado.clave === clave ? estado : null;
  const r = listo?.actual ?? null;

  const resumen = !listo
    ? <p className="text-xs text-gray-400">Calculando…</p>
    : r && r.productos.length > 0
      ? <p className="text-xs text-gray-600">
          <strong className="text-gray-800">{soles0(r.ventas)}</strong> en <strong className="text-gray-800">{r.unidades.toLocaleString("es-PE")}</strong> tazas ({pct(r.pctDeCarta)} de la carta) ·
          deja <strong className="text-gray-800">{soles0(r.deja)}</strong> ({pct(r.margenPct)}) · {r.tazasPorDia ?? "—"} tazas por día.
        </p>
      : <p className="text-xs text-gray-500">Sin reporte de rotación de {nombreMes(month)}.</p>;

  return (
    <SeccionDesplegable
      titulo="Cafés"
      subtitulo="Cuánto se vende y cuánto deja solo el café, frío y caliente."
      resumen={resumen}
      onAbrir={cargarAnteriores}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !listo ? <p className="text-sm text-gray-400">Calculando…</p>
        : r && r.productos.length > 0 ? <Cuerpo r={r} anteriores={previos?.clave === clave ? previos.filas : null} />
        : <p className="text-sm text-gray-500">No hay ventas de café en el reporte de {nombreMes(month)}.</p>}
    </SeccionDesplegable>
  );
}
