"use client";

/**
 * "¿Dónde ganamos plata?" (Grupo → Productos → El mes). Precio, costo, margen y
 * cuánto deja cada producto de la carta de Fonavi y Centro, con los que venden
 * mucho y dejan poco, y los que venden poco y dejan mucho. Pedido de Jahnn,
 * 4-oct-2026, idea de un libro. El cálculo y las marcas: lib/productos/rentabilidad.ts.
 * Va plegada: el resumen ya dice lo esencial.
 */

import { useEffect, useState } from "react";
import { getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { CAFETERIAS, NOMBRE_CAFETERIAS, esCafeteria } from "@/lib/productos/cafeterias";
import { MIN_UNIDADES, PUNTOS_DEJA_POCO, PUNTOS_MARGEN_ALTO, type MarcaRentabilidad, type ProductoRentable, type RentabilidadSede } from "@/lib/productos/rentabilidad";
import { Pastilla, SeccionDesplegable, fechaCorta, nombreMes } from "@/components/productos/ui";

const MARCAS: Record<MarcaRentabilidad, { texto: string; tono: "verde" | "ambar" | "azul" }> = {
  campeon: { texto: "Campeón", tono: "verde" },
  "mucho-deja-poco": { texto: "Vende mucho, deja poco", tono: "ambar" },
  joya: { texto: "Joya escondida", tono: "azul" },
};

const soles = (n: number | null) => (n === null ? "—" : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const soles0 = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

function Lista({ titulo, ayuda, tono, productos, vacio }: { titulo: string; ayuda: string; tono: "ambar" | "azul"; productos: ProductoRentable[]; vacio: string }) {
  return (
    <div className={`rounded-xl border p-4 min-w-0 ${tono === "ambar" ? "border-amber-200 bg-amber-50/40" : "border-sky-200 bg-sky-50/40"}`}>
      <h4 className="text-sm font-semibold text-gray-900">{titulo}</h4>
      <p className="mt-1 text-xs text-gray-600 leading-relaxed">{ayuda}</p>
      {productos.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500">{vacio}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {productos.map((p) => (
            <li key={p.nombre} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-gray-800 leading-tight">
                {p.nombre}
                <span className="block text-[11px] text-gray-500">{p.unidades.toLocaleString("es-PE")} u · margen {pct(p.margenPct)} · deja {soles(p.margenUnidad)} por unidad</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-900">{soles0(p.deja ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tabla({ productos }: { productos: ProductoRentable[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[620px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2.5 pl-4 pr-3">Producto</th>
            <th className="text-right font-medium py-2.5 px-3">Vendió</th>
            <th className="text-right font-medium py-2.5 px-3">Precio</th>
            <th className="text-right font-medium py-2.5 px-3">Costo</th>
            <th className="text-right font-medium py-2.5 px-3">Margen</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Cuánto deja</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {productos.map((p) => (
            <tr key={p.nombre}>
              <td className="py-2.5 pl-4 pr-3 align-top">
                <div className="text-gray-900 leading-tight">{p.nombre}</div>
                {p.marca && <div className="mt-1"><Pastilla tono={MARCAS[p.marca].tono}>{MARCAS[p.marca].texto}</Pastilla></div>}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700 align-top">{p.unidades.toLocaleString("es-PE")} u</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700 align-top">{soles(p.precio)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-gray-700 align-top">{soles(p.costo)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top">
                <div className="text-gray-900">{pct(p.margenPct)}</div>
                <div className="text-[10px] text-gray-400">{soles(p.margenUnidad)} c/u</div>
              </td>
              <td className="py-2.5 pl-3 pr-4 text-right tabular-nums font-semibold text-gray-900 align-top">{soles0(p.deja ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cuerpo({ d }: { d: RentabilidadSede }) {
  const [todos, setTodos] = useState(false);
  const conCosto = d.productos.filter((p) => p.deja !== null);
  const visibles = todos ? conCosto : conCosto.slice(0, 15);
  const muchoPoco = conCosto.filter((p) => p.marca === "mucho-deja-poco").sort((a, b) => b.ingresos - a.ingresos).slice(0, 6);
  const joyas = conCosto.filter((p) => p.marca === "joya").sort((a, b) => (b.margenUnidad ?? 0) - (a.margenUnidad ?? 0)).slice(0, 6);
  const aMedias = d.hasta < finDeMes(d.mes);
  const sinCostoVentas = d.sinCosto.reduce((t, p) => t + p.ingresos, 0);

  return (
    <div className="space-y-5">
      {aMedias && <p className="text-[11px] text-amber-700">Mes a medias: el reporte de Byte llega hasta el {fechaCorta(d.hasta)}.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Deja la carta</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{soles0(d.dejaTotal)}</div>
          <div className="text-xs text-gray-500">de {soles0(d.ventasCarta)} vendidos en carta</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Margen de la carta</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{pct(d.margenPromedioPct)}</div>
          <div className="text-xs text-gray-500">de cada S/ 100 de carta, quedan S/ {d.margenPromedioPct !== null ? Math.round(d.margenPromedioPct) : "—"} tras el costo</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Los 10 que más dejan</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{d.top10Pct !== null ? `${d.top10Pct}%` : "—"}</div>
          <div className="text-xs text-gray-500">de lo que deja toda la carta ({conCosto.length} productos)</div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">{todos ? "Todos los productos" : "Los 15 que más dejan"}, de mayor a menor</h4>
        <Tabla productos={visibles} />
        {conCosto.length > 15 && (
          <button type="button" onClick={() => setTodos(!todos)} className="mt-2 text-xs font-medium text-primary hover:underline">
            {todos ? "Ver solo los 15 primeros" : `Ver los ${conCosto.length} productos`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Lista
          titulo={`Venden mucho y dejan poco · ${d.conteo["mucho-deja-poco"]}`} tono="ambar" productos={muchoPoco}
          ayuda="Están entre los que más se venden, pero su margen está bien por debajo del promedio de la carta. Probar: subir el precio, bajar el costo o ajustar la porción."
          vacio="Ninguno este mes."
        />
        <Lista
          titulo={`Joyas escondidas · ${d.conteo.joya}`} tono="azul" productos={joyas}
          ayuda="Se venden poco, pero dejan mucho por cada unidad. Probar: ponerlos a la vista, sugerirlos al tomar el pedido o combinarlos."
          vacio="Ninguno este mes."
        />
      </div>

      {d.sinCosto.length > 0 && (
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong className="text-gray-700">{d.sinCosto.length} {d.sinCosto.length === 1 ? "producto sin costo" : "productos sin costo"}</strong> ({soles0(sinCostoVentas)} vendidos, no entran al cálculo): {d.sinCosto.slice(0, 4).map((p) => p.nombre).join(", ")}{d.sinCosto.length > 4 ? "…" : ""}. Se cargan en Grupo → Recetas y costos.
        </p>
      )}

      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
        <p><strong>Margen</strong> = (precio − costo) ÷ precio. <strong>Cuánto deja</strong> = margen en soles × unidades vendidas en el mes. El precio es el que Byte cobró en promedio.</p>
        <p><strong>El costo es lo que le cuesta a la cafetería</strong> (su receta o el precio interno de Atelier). No incluye planilla, alquiler ni servicios: por eso el margen de un producto sale mucho más alto que el margen de ganancia de la sede (el de Reportes → Los dos márgenes).</p>
        <p><strong>Cómo se marcan:</strong> «Campeón» es de los que más se venden (el tercio de arriba) con margen igual o mayor al promedio. «Vende mucho, deja poco» es de ese mismo tercio, con margen {PUNTOS_DEJA_POCO} puntos o más por debajo del promedio. «Joya escondida» se vende por debajo de la mediana, con margen {PUNTOS_MARGEN_ALTO} puntos o más sobre el promedio y buen margen en soles. Solo se marcan productos con costo conocido y {MIN_UNIDADES} unidades o más en el mes. Los que venden poco y dejan poco se revisan en «Candidatos a reemplazo».</p>
      </div>
    </div>
  );
}

export function RentabilidadProductos({ month, sede }: { month: string; sede: number }) {
  const [estado, setEstado] = useState<{ clave: string; data: RentabilidadSede | null; error: string | null } | null>(null);
  const clave = `${month}-${sede}`;

  useEffect(() => {
    if (!esCafeteria(sede)) return;
    let vivo = true;
    getRentabilidadProductos(month, sede).then((r) => {
      if (!vivo) return;
      setEstado(r.ok ? { clave, data: r.data, error: null } : { clave, data: null, error: r.error });
    });
    return () => { vivo = false; };
  }, [month, sede, clave]);

  if (!esCafeteria(sede)) {
    return <p className="text-xs text-gray-500 px-1">Atelier vende B2B y no tiene carta con precio al público: sus costos de receta están en Grupo → Recetas y costos.</p>;
  }
  const listo = estado && estado.clave === clave ? estado : null;
  const d = listo?.data ?? null;

  const resumen = !listo
    ? <p className="text-xs text-gray-400">Calculando…</p>
    : d
      ? <p className="text-xs text-gray-600">
          Los 10 que más dejan aportan el <strong className="text-gray-800">{d.top10Pct ?? "—"}%</strong> de lo que deja la carta ·{" "}
          <strong className="text-gray-800">{d.conteo["mucho-deja-poco"]}</strong> venden mucho y dejan poco ·{" "}
          <strong className="text-gray-800">{d.conteo.joya}</strong> joyas escondidas · costo conocido en el {d.coberturaPct}% de lo vendido.
        </p>
      : <p className="text-xs text-gray-500">Sin reporte de rotación de {nombreMes(month)}.</p>;

  return (
    <SeccionDesplegable
      titulo={`¿Dónde ganamos plata? · ${d?.sede ?? (sede === CAFETERIAS ? NOMBRE_CAFETERIAS : sede === 2 ? "Fonavi" : "Centro")} · ${nombreMes(month)}`}
      subtitulo="Qué deja cada producto: precio, costo y margen. Algunos venden mucho y dejan poco; otros venden poco y dejan mucho."
      resumen={resumen}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !listo ? <p className="text-sm text-gray-400">Calculando…</p>
        : d ? <Cuerpo d={d} />
        : <p className="text-sm text-gray-500">Esta sede no tiene reporte de rotación de {nombreMes(month)}. Súbelo con «Subir Reportes Gerencia».</p>}
    </SeccionDesplegable>
  );
}
