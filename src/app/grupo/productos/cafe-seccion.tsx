"use client";

/**
 * Grupo → Productos → El mes → «Cafés» (pedido de Jahnn, 3-nov-2026): cuánto se vende y cuánto deja el café, para
 * decidir si Fonavi compra una máquina de café nueva. La cifra principal es lo que se prepara EN la máquina de espresso;
 * los frappés (café en licuadora) y el café pasado van aparte. Plegada (regla de orden visual): cerrada dice lo
 * esencial; abierta, el detalle por producto y los 3 últimos meses.
 *
 * Sale de la rentabilidad por producto (la misma de «¿Dónde ganamos plata?»), así que el costo es el de la receta de
 * la cafetería y no incluye planilla, alquiler ni la máquina.
 */

import { useEffect, useState } from "react";
import { getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { esCafeteria } from "@/lib/productos/cafeterias";
import { NOMBRE_METODO, resumenCafe, type MetodoCafe, type ProductoCafe, type ResumenCafe } from "@/lib/productos/cafe";
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

const ETIQUETA_CORTA: Record<MetodoCafe, string> = { maquina: "máquina", filtrado: "filtro", licuadora: "licuadora" };

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
                <span className="block text-[11px] text-gray-400">{p.tipo === "frio" ? "Frío" : "Caliente"} · {ETIQUETA_CORTA[p.metodo]}</span>
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
            <th className="text-right font-medium py-2.5 px-3">Máquina: vendido</th>
            <th className="text-right font-medium py-2.5 px-3">Tazas por día</th>
            <th className="text-right font-medium py-2.5 px-3">Deja</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Todo con café</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map(({ mes, r }) => (
            <tr key={mes}>
              <td className="py-2.5 pl-4 pr-3 text-gray-900">{nombreMes(mes)}</td>
              {r ? (
                <>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{soles0(r.maquina.ventas)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-gray-700">{r.maquina.tazasPorDia ?? "—"}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-gray-900">{soles0(r.maquina.deja)}</td>
                  <td className="py-2.5 pl-3 pr-4 text-right tabular-nums text-gray-500">{soles0(r.todo.ventas)}</td>
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
      <p className="text-xs font-medium text-gray-700">{NOMBRE_METODO.maquina}: lo que haría la máquina nueva</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta titulo="Vendido con la máquina" valor={soles0(r.maquina.ventas)} nota={`${r.maquina.unidades.toLocaleString("es-PE")} tazas · ${pct(r.maquina.pctDeCarta)} de la carta`} />
        <Tarjeta titulo="Cuánto deja" valor={soles0(r.maquina.deja)} nota={`margen ${pct(r.maquina.margenPct)} · costo de preparar ${soles0(r.maquina.costo)}`} />
        <Tarjeta titulo="Por día" valor={`${r.maquina.tazasPorDia ?? "—"} tazas`} nota={`${soles0(r.maquina.ventasPorDia)} vendidos por día`} />
        <Tarjeta titulo="Por taza" valor={soles2(r.maquina.precioPromedio)} nota={r.maquina.unidades > 0 && r.maquina.deja !== null ? `deja ${soles2(r.maquina.deja / r.maquina.unidades)} por taza` : "precio promedio"} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([["maquina", r.maquina], ["filtrado", r.filtrado], ["licuadora", r.licuadora]] as const).map(([m, t]) => (
          <div key={m} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{NOMBRE_METODO[m]}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{soles0(t.ventas)}</div>
            <div className="text-xs text-gray-500">{t.unidades.toLocaleString("es-PE")} tazas · deja {soles0(t.deja)} ({pct(t.margenPct)})</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Todo lo que lleva café, se prepare donde se prepare: <strong className="text-gray-700">{soles0(r.todo.ventas)}</strong> en {r.todo.unidades.toLocaleString("es-PE")} tazas ({pct(r.todo.pctDeCarta)} de la carta), deja {soles0(r.todo.deja)}.</p>

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
        <p><strong>Qué cuenta como café:</strong> lo que sale de la máquina de espresso (espresso, americano, cortado, cappuccino, latte con sabores y fríos, macchiato, moccaccino, affogato); el café pasado y el cold brew, que llevan café pero no pasan por la máquina; y los frappés, que llevan café pero se hacen en licuadora. No cuentan las infusiones, el matcha (aunque se llame «latte»), los chocolates, los jugos ni los batidos.</p>
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
          Con la máquina: <strong className="text-gray-800">{soles0(r.maquina.ventas)}</strong> en <strong className="text-gray-800">{r.maquina.unidades.toLocaleString("es-PE")}</strong> tazas
          ({r.maquina.tazasPorDia ?? "—"} por día) · deja <strong className="text-gray-800">{soles0(r.maquina.deja)}</strong> ({pct(r.maquina.margenPct)}) · todo con café: {soles0(r.todo.ventas)}.
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
