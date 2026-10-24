"use client";

/**
 * Buscador de producto (pedido de Jahnn, 24-oct-2026): escribir un producto y ver cómo se vendió en cada sede el último mes,
 * los últimos 3, 6 o 12 meses, mes a mes. El historial se pide la primera vez que se usa el buscador; la búsqueda y los
 * periodos se resuelven aquí, sin volver a la base. Reglas en lib/productos/historial-producto.ts.
 */

import { useMemo, useRef, useState } from "react";
import { Lightbulb, Loader2, Search, X } from "lucide-react";
import { getCandidatosReemplazo, getHistorialProductos, type CandidatosReemplazo } from "@/app/actions/productos-panorama";
import { claveProducto } from "@/lib/productos/historial-producto";
import { CUADRANTES, fichaDeProducto, type Cuadrante } from "@/lib/productos/matriz-carta";
import { sugerirProducto, type AccionProducto, type Sugerencia } from "@/lib/productos/sugerencia-producto";
import { buscarEnHistorial, resumenProducto, type HistorialProductos, type ResumenSede } from "@/lib/productos/historial-producto";
import { Segmentado } from "@/components/productos/ui";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const corto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}`;
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const solesDia = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: n < 100 ? 1 : 0, maximumFractionDigits: n < 100 ? 1 : 0 })}`;
const unid = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: n < 10 ? 1 : 0 });
const PERIODOS = [{ valor: 1, etiqueta: "Último mes" }, { valor: 3, etiqueta: "3 meses" }, { valor: 6, etiqueta: "6 meses" }, { valor: 12, etiqueta: "12 meses" }];

export function TarjetaSede({ r, periodo }: { r: ResumenSede; periodo: number }) {
  const ultimos = r.serie.slice(-periodo).map((x) => x.mes);
  const tope = Math.max(...r.serie.map((x) => x.ventaDia), 0.01);
  return (
    <div className="min-w-0 rounded-xl border border-gray-200/80 bg-white px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">{r.sede}</h4>
        {r.puesto && <span className="text-[11px] text-gray-500">n.º <b className="text-gray-800">{r.puesto.n}</b> de {r.puesto.de} en {corto(r.puesto.mes).toLowerCase()}</span>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div><div className="text-[10px] uppercase tracking-wider text-gray-500">Venta</div><div className="text-lg font-semibold tabular-nums text-gray-900">{soles(r.venta)}</div><div className="text-[11px] text-gray-500">{solesDia(r.ventaDia)} por día</div></div>
        <div><div className="text-[10px] uppercase tracking-wider text-gray-500">Unidades</div><div className="text-lg font-semibold tabular-nums text-gray-900">{unid(r.unidades)}</div><div className="text-[11px] text-gray-500">{unid(r.unidadesDia)} por día</div></div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Contra antes</div>
          <div className={`text-lg font-semibold tabular-nums ${r.cambioPct === null ? "text-gray-400" : r.cambioPct < 0 ? "text-red-600" : "text-emerald-700"}`}>{r.cambioPct === null ? "—" : `${r.cambioPct > 0 ? "+" : ""}${r.cambioPct}%`}</div>
          <div className="text-[11px] text-gray-500">venta por día vs {periodo === 1 ? "el mes anterior" : `los ${periodo} meses anteriores`}</div>
        </div>
      </div>
      {r.pctSede !== null && <p className="mt-1 text-[11px] text-gray-500">Es el {r.pctSede}% de lo que vendió {r.sede} en el periodo.</p>}

      {/* Venta por día, mes a mes: así un mes a medias se compara con uno completo. */}
      <div className="mt-3 flex h-20 items-end gap-1" role="img" aria-label={`Venta por día de cada mes en ${r.sede}`}>
        {r.serie.map((x) => {
          const enPeriodo = ultimos.includes(x.mes);
          const h = Math.max((x.ventaDia / tope) * 100, x.ventaDia > 0 ? 3 : 0);
          return (
            <div key={x.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${corto(x.mes)}: ${solesDia(x.ventaDia)} por día · ${unid(x.unidades)} u · ${soles(x.venta)}${x.aMedias ? " (mes a medias)" : ""}${!x.confiable ? " · reporte no confiable" : ""}`}>
              <div className={`w-full rounded-t ${!x.confiable ? "bg-gray-200 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.7)_3px,rgba(255,255,255,.7)_6px)]" : enPeriodo ? "bg-primary" : "bg-primary/25"}`} style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {r.serie.map((x) => <span key={x.mes} className={`min-w-0 flex-1 text-center text-[9px] ${ultimos.includes(x.mes) ? "font-semibold text-gray-700" : "text-gray-400"}`}>{corto(x.mes)}</span>)}
      </div>
      {r.noConfiables.length > 0 && <p className="mt-1.5 text-[10px] text-gray-400">{r.noConfiables.map(corto).join(", ")}: el reporte de Byte no cuadra con la venta del mes; no entra a los totales.</p>}
    </div>
  );
}


const TONO_ACCION: Record<AccionProducto, string> = {
  potenciar: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
  mantener: "border-sky-200 bg-sky-50/60 text-sky-800",
  promocionar: "border-violet-200 bg-violet-50/60 text-violet-800",
  preparar: "border-amber-200 bg-amber-50/60 text-amber-800",
  sacar: "border-red-200 bg-red-50/60 text-red-800",
  revisar: "border-sky-200 bg-sky-50/60 text-sky-800",
  esperar: "border-gray-200 bg-gray-50 text-gray-700",
  "sin-costo": "border-gray-200 bg-gray-50 text-gray-700",
  "sin-datos": "border-gray-200 bg-gray-50 text-gray-700",
};

/** La matriz en chico: en qué caja cae (ventas × lo que deja cada venta). */
function MatrizMini({ cuadrante }: { cuadrante: Cuadrante | null }) {
  // Arriba lo que deja mucho por venta; a la derecha lo que vende mucho.
  const orden: Cuadrante[] = ["interrogante", "estrella", "perro", "vaca"];
  return (
    <div className="shrink-0" aria-label="Dónde cae en la matriz de la carta">
      <div className="grid w-40 grid-cols-2 gap-1">
        {orden.map((c) => (
          <div key={c} className={`rounded-md px-1.5 py-1.5 text-center text-[10px] leading-tight ${c === cuadrante ? "bg-gray-900 font-semibold text-white" : "bg-gray-100 text-gray-500"}`}>
            {CUADRANTES[c].nombre}<span className="block text-[9px] opacity-80">{CUADRANTES[c].accion}</span>
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex w-40 justify-between text-[9px] text-gray-400"><span>vende poco</span><span>vende mucho →</span></div>
    </div>
  );
}

export function QueHacer({ s, precio, costo, margen, margenPct, cuadrante }: { s: Sugerencia; precio: number | null; costo: number | null; margen: number | null; margenPct: number | null; cuadrante: Cuadrante | null }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${TONO_ACCION[s.accion]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Qué hacer con este producto{s.caja ? ` · ${s.caja}` : ""}</div>
          <div className="mt-0.5 text-lg font-semibold">{s.titulo}</div>
          {(precio !== null || margen !== null) && (
            <p className="mt-1 text-xs text-gray-700">
              {precio !== null && <>Precio <b>S/ {precio.toFixed(2)}</b></>}
              {costo !== null && <> · costo <b>S/ {costo.toFixed(2)}</b></>}
              {margen !== null && <> · deja <b>S/ {margen.toFixed(2)}</b>{margenPct !== null ? ` (${margenPct}%)` : ""} por venta</>}
            </p>
          )}
          <ul className="mt-2 space-y-0.5 text-xs text-gray-700">{s.porque.map((x) => <li key={x}>· {x}</li>)}</ul>
          {s.ideas.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-1 text-xs font-semibold"><Lightbulb className="h-3.5 w-3.5" aria-hidden />Ideas</div>
              <ul className="mt-0.5 space-y-0.5 text-xs text-gray-700">{s.ideas.map((x) => <li key={x}>· {x}</li>)}</ul>
            </div>
          )}
          {s.ojo && <p className="mt-2 text-xs font-medium text-amber-800">Ojo: {s.ojo}</p>}
        </div>
        {cuadrante && <MatrizMini cuadrante={cuadrante} />}
      </div>
    </div>
  );
}

export function BuscadorProducto({ month, sedeFija = null }: { month: string; sedeFija?: number | null }) {
  const [hist, setHist] = useState<{ mes: string; data: HistorialProductos | null } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(3);
  const pedido = useRef<string | null>(null);

  const data = hist?.mes === month ? hist.data : undefined;
  function cargar() {
    if (pedido.current === month) return;
    pedido.current = month;
    setCargando(true);
    getHistorialProductos(month, 12, sedeFija)
      .then((r) => setHist({ mes: month, data: r.ok ? r.data : null }))
      .catch(() => setHist({ mes: month, data: null }))
      .finally(() => setCargando(false));
  }

  // La ingeniería de menú (carta de Fonavi y Centro): se pide la primera vez que se elige un producto de las cafeterías.
  const [cand, setCand] = useState<{ mes: string; data: CandidatosReemplazo | null } | null>(null);
  const pedidoCand = useRef<string | null>(null);
  function cargarCandidatos() {
    if (pedidoCand.current === month) return;
    pedidoCand.current = month;
    getCandidatosReemplazo(month)
      .then((r) => setCand({ mes: month, data: r.ok ? r.data : null }))
      .catch(() => setCand({ mes: month, data: null }));
  }
  const candidatos = cand?.mes === month ? cand.data : undefined;

  const sugerencias = useMemo(() => (data && texto.trim() && !elegido ? buscarEnHistorial(data.productos, texto) : []), [data, texto, elegido]);
  const producto = data && elegido ? data.productos.find((p) => p.clave === elegido) ?? null : null;
  const resumen = useMemo(() => (data && elegido ? resumenProducto(data, elegido, periodo) : []), [data, elegido, periodo]);
  const enCafeterias = !!producto && (!!producto.ventas[2] || !!producto.ventas[3]);
  const menu = useMemo(() => {
    if (!candidatos || !elegido) return null;
    const prod = candidatos.matriz.find((x) => x.clave === elegido || claveProducto(x.nombre) === elegido);
    const ficha = prod ? fichaDeProducto(candidatos.matriz, candidatos.cartas, prod.clave) : null;
    const candidato = prod ? candidatos.candidatos.find((c) => c.clave === prod.clave) ?? null : null;
    const precioDe = prod?.sedes.find((x) => x.precio !== null);
    return {
      s: sugerirProducto(ficha, candidato),
      cuadrante: ficha?.punto?.cuadrante ?? null,
      precio: ficha?.punto?.precio ?? precioDe?.precio ?? null,
      // Con la ficha, costo = precio − lo que deja (las mismas cifras de la matriz: siempre cuadran).
      costo: ficha?.punto?.precio != null ? Math.round((ficha.punto.precio - ficha.punto.margenUnidad) * 100) / 100 : precioDe?.costo ?? null,
      margen: ficha?.punto?.margenUnidad ?? null,
      margenPct: ficha?.punto?.margenPct ?? null,
    };
  }, [candidatos, elegido]);

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white px-4 py-4 sm:px-5" aria-label="Buscar un producto">
      <div className="relative">
        <label htmlFor="buscar-producto" className="sr-only">Buscar un producto</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input
          id="buscar-producto" type="search" autoComplete="off" value={texto}
          placeholder="Buscar un producto: ej. batido de plátano"
          onFocus={cargar}
          onChange={(e) => { cargar(); setTexto(e.target.value); setElegido(null); }}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-9 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {(cargando && !data) && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" aria-label="Cargando productos" />}
        {texto && !cargando && (
          <button type="button" onClick={() => { setTexto(""); setElegido(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700" aria-label="Borrar la búsqueda"><X className="h-4 w-4" /></button>
        )}
        {sugerencias.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg" role="listbox">
            {sugerencias.map((p) => (
              <li key={p.clave}>
                <button type="button" role="option" aria-selected={false} onClick={() => { setElegido(p.clave); setTexto(p.nombre); if (p.ventas[2] || p.ventas[3]) cargarCandidatos(); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="min-w-0 truncate text-gray-800">{p.nombre}</span>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    {data!.sedes.filter((s) => p.ventas[s.id]).map((s) => s.nombre).join(" · ")}{p.eliminado && " · eliminado en Byte"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {data && texto.trim() && !elegido && sugerencias.length === 0 && <p className="mt-2 text-xs text-gray-500">No encontré «{texto}» en los reportes de rotación de los últimos 12 meses.</p>}
      {data === null && <p className="mt-2 text-xs text-red-700">No se pudo leer el historial de productos.</p>}

      {producto && data && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{producto.nombre}</h3>
              {producto.eliminado && <p className="text-[11px] text-amber-700">Byte lo marca como eliminado.</p>}
            </div>
            <Segmentado tamano="sm" valor={periodo} onChange={setPeriodo} opciones={PERIODOS} />
          </div>
          {/* Ingeniería de menú: qué hacer con el producto (carta de Fonavi y Centro). */}
          {enCafeterias && (candidatos === undefined
            ? <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Calculando qué conviene hacer con este producto…</div>
            : candidatos && menu ? <QueHacer {...menu} /> : null)}
          {!enCafeterias && producto && (
            <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
              La ingeniería de menú es para la carta de Fonavi y Centro. En Atelier, un producto Y- se decide con lo que venden las cafeterías, y uno P- con su venta a otros clientes (abajo).
            </p>
          )}
          {resumen.length === 0
            ? <p className="text-sm text-gray-500">No tiene ventas en estos meses.</p>
            : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{resumen.map((r) => <TarjetaSede key={r.id} r={r} periodo={periodo} />)}</div>}
          <p className="text-[11px] text-gray-400">De los reportes de rotación de Byte. Las barras son la venta por día de cada mes (así un mes a medias se compara con uno completo); las oscuras son el periodo elegido.</p>
        </div>
      )}
    </section>
  );
}
