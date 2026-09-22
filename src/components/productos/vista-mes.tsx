"use client";

/**
 * "El mes" — qué se vendió en el período cargado de una sede: indicadores,
 * qué familias pesan, los 10 que más facturan y el ranking de postres.
 * La misma vista para el panel de Grupo y el del administrador.
 */

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import type { PanoramaProductos, ProductoRanking } from "@/lib/productos/panorama";
import { Seccion, Kpi, Barra, PuntoFamilia, Puesto, colorFamilia, fechaCorta } from "./ui";

function FilaRanking({ n, x, max, conFamilia = false }: { n: number; x: ProductoRanking; max: number; conFamilia?: boolean }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Puesto n={n} destacado={n <= 3} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 leading-snug">{x.nombre}</div>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 min-w-0">
              {conFamilia ? <><PuntoFamilia familia={x.familia} /> <span className="truncate">{x.familia}</span></> : <>{x.unidadesPorDia ?? "—"} por día</>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(x.ingresos)}</div>
            <div className="text-xs text-gray-500 tabular-nums mt-0.5">
              {x.unidades} u{x.precio !== null && <span className="hidden sm:inline"> · {formatCurrency(x.precio)} c/u</span>}
            </div>
          </div>
        </div>
        <div className="mt-2"><Barra pct={(x.ingresos / max) * 100} color={colorFamilia(x.familia)} alto="h-1" /></div>
      </div>
    </li>
  );
}

export function VistaMes({ p, cargadoEl, conKpis = true }: { p: PanoramaProductos; cargadoEl?: string | null; conKpis?: boolean }) {
  const [todosPostres, setTodosPostres] = useState(false);
  const maxTop = p.top[0]?.ingresos ?? 1;
  const postres = todosPostres ? p.postres : p.postres.slice(0, 10);
  const maxPostre = p.postres[0]?.ingresos ?? 1;

  return (
    <div className="space-y-5">
      {conKpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi etiqueta="Ventas de carta" valor={formatCurrency(p.ventas)} detalle={`${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)} · ${p.dias} días`} />
          <Kpi etiqueta="Venta por día" valor={formatCurrency(p.ventaPorDia)} detalle={cargadoEl ? `reporte cargado el ${fechaCorta(cargadoEl.slice(0, 10))}` : undefined} />
          <Kpi etiqueta="Unidades" valor={p.unidades.toLocaleString("es-PE")} detalle={`${p.productos} productos distintos`} />
          <Kpi etiqueta="Los 10 primeros" valor={`${p.concentracionTop10}%`} detalle="de lo que se vendió" />
        </div>
      )}

      {/* Qué familias pesan: una franja a lo ancho */}
      <Seccion titulo="Qué se vende" subtitulo="Ventas de carta por familia de producto">
        <div className="flex h-3 rounded-full overflow-hidden mb-6 gap-0.5">
          {p.familias.map((f) => (
            <div key={f.familia} style={{ width: `${f.pct}%`, backgroundColor: colorFamilia(f.familia) }} title={`${f.familia}: ${f.pct}%`} />
          ))}
        </div>
        <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-5">
          {p.familias.map((f) => (
            <li key={f.familia} className="min-w-0">
              <div className="flex items-start gap-2 text-xs text-gray-600 leading-snug min-h-[2rem]">
                <span className="mt-1"><PuntoFamilia familia={f.familia} /></span>
                <span>{f.familia}</span>
              </div>
              <div className="text-lg font-semibold text-gray-900 tabular-nums mt-1">{formatCurrency(f.ventas)}</div>
              <div className="text-xs text-gray-500 tabular-nums mt-0.5">{f.pct}% · {f.unidades} unidades</div>
            </li>
          ))}
        </ul>
      </Seccion>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        {/* Los 10 que más facturan */}
        <Seccion titulo={`Los ${p.top.length} que más facturan`} subtitulo={`Explican el ${p.concentracionTop10}% de las ventas de carta`}>
          <ol className="divide-y divide-gray-100">
            {p.top.map((x, i) => (
              <FilaRanking key={x.nombre} n={i + 1} x={x} max={maxTop} conFamilia />
            ))}
          </ol>
        </Seccion>

        {/* Ranking de postres y pastelería */}
        {p.postres.length > 0 && (
          <Seccion
            titulo="Ranking de postres y pastelería"
            subtitulo={`${p.postres.length} productos · ordenados por ingresos`}
          >
            <ol className="divide-y divide-gray-100">
              {postres.map((x, i) => (
                <FilaRanking key={x.nombre} n={i + 1} x={x} max={maxPostre} />
              ))}
            </ol>
            {p.postres.length > 10 && (
              <button type="button" onClick={() => setTodosPostres((v) => !v)} className="mt-4 text-sm font-medium text-primary-light hover:text-primary">
                {todosPostres ? "Ver solo los 10 primeros" : `Ver los ${p.postres.length} productos`}
              </button>
            )}
          </Seccion>
        )}
      </div>

      {/* Notas al pie */}
      <div className="text-xs text-gray-500 leading-relaxed space-y-1 px-1">
        <p>{p.colaLarga} productos vendieron 3 unidades o menos en el período: la cola larga que conviene revisar en la carta.</p>
        {p.fueraDeCarta.ventas > 0 && (
          <p>
            Fuera de los rankings, {formatCurrency(p.fueraDeCarta.ventas)} que no es carta (delivery, extras, packaging, retail).
            Con eso, el período suma {formatCurrency(p.ventasTotales)}.
          </p>
        )}
        {p.eliminadas.lineas > 0 && (
          <p>
            Byte trajo {p.eliminadas.lineas} línea(s) «eliminadas» (productos editados o renombrados):
            {" "}{p.eliminadas.unidasAlProducto} se sumaron a su producto, {p.eliminadas.propias} quedaron como producto propio
            y {p.eliminadas.ajustes} son ajustes de caja.
          </p>
        )}
      </div>
    </div>
  );
}
