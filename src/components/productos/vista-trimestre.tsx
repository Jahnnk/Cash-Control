"use client";

/**
 * "Últimos 3 meses" — el informe trimestral de Jahnn (su Excel de Fonavi)
 * rediseñado para leerse sin esfuerzo:
 *
 *   1. Indicadores del trimestre.
 *   2. Mes a mes, como tarjetas (con la marca de mes a medias o sospechoso).
 *   3. Categorías: qué familia crece y cuál cae.
 *   4. Top 10 del trimestre, con los tres meses en miniatura.
 *   5. Top 10 por mes: UN mes a la vez, con nombres completos y cuánto subió
 *      o bajó cada producto en el ranking.
 *   6. Ranking por categoría con clase ABC, tendencia y recomendación.
 */

import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { InformeTrimestral, ProductoTrimestre, Tendencia, ClaseABC } from "@/lib/productos/trimestral";
import {
  Seccion, Kpi, Barra, PuntoFamilia, Puesto, Pastilla, Variacion, Segmentado,
  colorFamilia, fechaCorta, nombreMes,
} from "./ui";

const TONO_TENDENCIA: Record<Tendencia, "verde" | "rojo" | "gris" | "azul" | "ambar"> = {
  Creciendo: "verde", Estable: "gris", Cayendo: "rojo", Nuevo: "azul", "Dejó de venderse": "ambar", "Sin datos": "gris",
};
const TONO_CLASE: Record<ClaseABC, "marca" | "ambar" | "gris"> = { A: "marca", B: "ambar", C: "gris" };

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Los tres meses de un producto en barritas (escala del propio producto). */
function MiniMeses({ p, meses, aMedias }: { p: ProductoTrimestre; meses: string[]; aMedias: Set<string> }) {
  const max = Math.max(...p.porMes.map((m) => m.ingresos), 1);
  return (
    <div className="hidden sm:flex items-end gap-1.5" title={p.porMes.map((m) => `${nombreMes(m.month)}: ${formatCurrency(m.ingresos)}`).join(" · ")}>
      {meses.map((m) => {
        const v = p.porMes.find((x) => x.month === m)?.ingresos ?? 0;
        return (
          <div key={m} className="flex flex-col items-center gap-1">
            <div className="w-3 h-7 rounded-sm bg-gray-100 flex items-end overflow-hidden">
              <div className="w-full rounded-sm" style={{ height: `${(v / max) * 100}%`, backgroundColor: colorFamilia(p.familia), opacity: aMedias.has(m) ? 0.4 : 1 }} />
            </div>
            <span className="text-[9px] text-gray-400 uppercase">{nombreMes(m, true).slice(0, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CambioPuesto({ antes, ahora }: { antes: number | null; ahora: number }) {
  if (antes === null) return <Pastilla tono="azul">nuevo en el top</Pastilla>;
  const d = antes - ahora;
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-xs text-gray-400"><Minus className="w-3 h-3" /> igual</span>;
  return d > 0
    ? <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-700"><ArrowUp className="w-3 h-3" /> {d}</span>
    : <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-700"><ArrowDown className="w-3 h-3" /> {-d}</span>;
}

export function VistaTrimestre({ t, meses }: { t: InformeTrimestral; meses: string[] }) {
  const [mesTop, setMesTop] = useState(meses[meses.length - 1]);
  const [familia, setFamilia] = useState(t.familias[0]?.familia ?? "");
  const [todos, setTodos] = useState(false);

  const maxDia = Math.max(...t.meses.map((m) => m.ventaPorDia), 1);
  const maxTop = t.top[0]?.ingresos ?? 1;
  const iTop = t.topPorMes.findIndex((m) => m.month === mesTop);
  const topMes = t.topPorMes[iTop]?.productos ?? [];
  const topAnterior = iTop > 0 ? t.topPorMes[iTop - 1].productos : null;
  const fam = t.familias.find((f) => f.familia === familia) ?? t.familias[0];
  const listaFam = fam ? (todos ? fam.productos : fam.productos.slice(0, 15)) : [];
  const alguna = t.meses.find((m) => m.sospechoso);
  const aMedias = new Set(t.meses.filter((m) => m.incompleto).map((m) => m.month));
  const maxFamilia = Math.max(...t.familias.map((f) => f.pct), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi etiqueta="Ventas de carta" valor={formatCurrency(t.ventas)} detalle={`${t.meses.length} meses · ${t.dias} días`} />
        <Kpi etiqueta="Venta por día" valor={formatCurrency(t.ventaPorDia)} detalle="promedio del período" />
        <Kpi etiqueta="Unidades" valor={t.unidades.toLocaleString("es-PE")} detalle={`${t.productos} productos de carta`} />
        <Kpi etiqueta="Clase A" valor={t.claseA} detalle="productos que hacen el 80% de la venta" />
      </div>

      {alguna && (
        <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <strong>{capital(nombreMes(alguna.month))} vende muy poco por día</strong> comparado con los otros meses. Lo más probable es
            que el reporte cargado sea parcial: vuelve a subirlo desde «Cargas de Byte» antes de sacar conclusiones.
          </div>
        </div>
      )}

      {/* Mes a mes */}
      <Seccion titulo="Mes a mes" subtitulo="Ventas de carta de cada mes y su venta promedio por día">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {t.meses.map((m) => (
            <div key={m.month} className={`rounded-xl border px-4 py-4 ${m.sospechoso ? "border-red-200 bg-red-50/40" : "border-gray-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{capital(nombreMes(m.month))}</span>
                {m.sospechoso ? <Pastilla tono="rojo">¿carga parcial?</Pastilla>
                  : m.incompleto ? <Pastilla tono="ambar">{fechaCorta(m.desde)} → {fechaCorta(m.hasta)}</Pastilla>
                  : <Pastilla tono="verde">mes completo</Pastilla>}
              </div>
              <div className="text-2xl font-semibold text-gray-900 tabular-nums mt-3">{formatCurrency(m.ventas)}</div>
              <div className="text-xs text-gray-500 mt-1">{m.unidades.toLocaleString("es-PE")} unidades · {m.productos} productos</div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Por día</span><span className="font-medium text-gray-800 tabular-nums">{formatCurrency(m.ventaPorDia)}</span>
                </div>
                <Barra pct={(m.ventaPorDia / maxDia) * 100} color={m.sospechoso ? "#DC2626" : "#098B5F"} />
              </div>
            </div>
          ))}
        </div>
      </Seccion>

      {/* Categorías */}
      <Seccion
        titulo="Categorías"
        subtitulo={`Cuánto vendió cada familia por mes y su variación${t.tendenciaPorDia ? " (por día, porque hay un mes a medias)" : ""}`}
      >
        <div className="overflow-x-auto -mx-4 sm:-mx-6">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium py-2.5 pl-4 sm:pl-6">Categoría</th>
                {meses.map((m) => <th key={m} className="text-right font-medium py-2.5 px-3">{nombreMes(m)}</th>)}
                <th className="text-right font-medium py-2.5 px-3">Total</th>
                <th className="text-left font-medium py-2.5 px-3 w-44">Participación</th>
                <th className="text-right font-medium py-2.5 pr-4 sm:pr-6">Variación</th>
              </tr>
            </thead>
            <tbody>
              {t.familias.map((f) => (
                <tr key={f.familia} className="border-b border-gray-50 last:border-0">
                  <td className="py-3.5 pl-4 sm:pl-6 min-w-[12rem]">
                    <span className="flex items-center gap-2 text-gray-900"><PuntoFamilia familia={f.familia} />{f.familia}</span>
                  </td>
                  {meses.map((m) => (
                    <td key={m} className="py-3.5 px-3 text-right tabular-nums text-gray-600">
                      {formatCurrency(f.porMes.find((x) => x.month === m)?.ventas ?? 0)}
                    </td>
                  ))}
                  <td className="py-3.5 px-3 text-right tabular-nums font-semibold text-gray-900">{formatCurrency(f.ventas)}</td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-2">
                      <Barra pct={(f.pct / maxFamilia) * 100} color={colorFamilia(f.familia)} />
                      <span className="text-xs text-gray-500 tabular-nums w-11 text-right">{f.pct}%</span>
                    </div>
                  </td>
                  <td className="py-3.5 pr-4 sm:pr-6 text-right"><Variacion v={f.variacionPct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Top 10 del trimestre */}
        <Seccion
          titulo="Los 10 que más facturaron"
          subtitulo={`En los ${t.meses.length} meses · explican el ${t.concentracionTop10}% de la venta${aMedias.size > 0 ? " · las barritas claras son meses a medias" : ""}`}
        >
          <ol className="divide-y divide-gray-100">
            {t.top.map((p, i) => (
              <li key={p.nombre} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Puesto n={i + 1} destacado={i < 3} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 leading-snug">{p.nombre}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1"><Barra pct={(p.ingresos / maxTop) * 100} color={colorFamilia(p.familia)} alto="h-1" /></div>
                    <span className="text-xs text-gray-500 tabular-nums shrink-0">{p.unidades} u</span>
                  </div>
                </div>
                <MiniMeses p={p} meses={meses} aMedias={aMedias} />
                <div className="text-right shrink-0 w-24">
                  <div className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(p.ingresos)}</div>
                  <div className="text-xs text-gray-500 tabular-nums">{p.pctTrimestre}%</div>
                </div>
              </li>
            ))}
          </ol>
        </Seccion>

        {/* Top 10 por mes */}
        <Seccion
          titulo="Top 10 de cada mes"
          subtitulo="Elige el mes; la flecha dice cuántos puestos subió o bajó frente al mes anterior"
          acciones={
            <Segmentado
              tamano="sm"
              valor={mesTop}
              onChange={setMesTop}
              opciones={meses.map((m) => ({ valor: m, etiqueta: capital(nombreMes(m)) }))}
            />
          }
        >
          <ol className="divide-y divide-gray-100">
            {topMes.map((p, i) => {
              const antes = topAnterior ? topAnterior.findIndex((x) => x.nombre === p.nombre) : -2;
              return (
                <li key={p.nombre} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Puesto n={i + 1} destacado={i < 3} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 leading-snug">{p.nombre}</div>
                    <div className="text-xs text-gray-500 tabular-nums mt-0.5 flex items-center gap-2">
                      {p.unidades} u
                      {topAnterior && <span className="sm:hidden"><CambioPuesto antes={antes >= 0 ? antes + 1 : null} ahora={i + 1} /></span>}
                    </div>
                  </div>
                  {topAnterior && <div className="hidden sm:block shrink-0 w-28 text-right"><CambioPuesto antes={antes >= 0 ? antes + 1 : null} ahora={i + 1} /></div>}
                  <div className="text-sm font-semibold text-gray-900 tabular-nums shrink-0 w-24 text-right">{formatCurrency(p.ingresos)}</div>
                </li>
              );
            })}
          </ol>
        </Seccion>
      </div>

      {/* Ranking por categoría */}
      {fam && (
        <Seccion
          titulo="Ranking por categoría"
          subtitulo="Cada producto dentro de su familia: cómo le fue mes a mes, su clase ABC, su tendencia y qué hacer"
        >
          <div className="mb-5 overflow-x-auto">
            <Segmentado
              tamano="sm"
              valor={fam.familia}
              onChange={(v) => { setFamilia(v); setTodos(false); }}
              opciones={t.familias.map((f) => ({
                valor: f.familia,
                etiqueta: <span className="flex items-center gap-1.5"><PuntoFamilia familia={f.familia} />{f.familia} <span className="text-gray-400">{f.productos.length}</span></span>,
              }))}
            />
          </div>
          <div className="overflow-x-auto -mx-4 sm:-mx-6">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                  <th className="text-left font-medium py-2.5 pl-4 sm:pl-6">Producto</th>
                  {meses.map((m) => <th key={m} className="text-right font-medium py-2.5 px-3">{nombreMes(m)}</th>)}
                  <th className="text-right font-medium py-2.5 px-3">Total</th>
                  <th className="text-center font-medium py-2.5 px-2">ABC</th>
                  <th className="text-left font-medium py-2.5 px-3">Tendencia</th>
                  <th className="text-left font-medium py-2.5 pr-4 sm:pr-6 w-72">Qué hacer</th>
                </tr>
              </thead>
              <tbody>
                {listaFam.map((p) => (
                  <tr key={p.nombre} className="border-b border-gray-50 last:border-0 align-top">
                    <td className="py-3 pl-4 sm:pl-6 text-gray-900 leading-snug">{p.nombre}</td>
                    {meses.map((m) => {
                      const x = p.porMes.find((y) => y.month === m);
                      return (
                        <td key={m} className="py-3 px-3 text-right tabular-nums">
                          {x && x.unidades > 0
                            ? <><div className="text-gray-800">{formatCurrency(x.ingresos)}</div><div className="text-xs text-gray-400">{x.unidades} u</div></>
                            : <span className="text-gray-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="py-3 px-3 text-right tabular-nums">
                      <div className="font-semibold text-gray-900">{formatCurrency(p.ingresos)}</div>
                      <div className="text-xs text-gray-400">{p.pctFamilia}% de la familia</div>
                    </td>
                    <td className="py-3 px-2 text-center"><Pastilla tono={TONO_CLASE[p.clase]}>{p.clase}</Pastilla></td>
                    <td className="py-3 px-3">
                      <Pastilla tono={TONO_TENDENCIA[p.tendencia]}>
                        {p.tendencia}{p.variacionPct !== null && p.tendencia !== "Dejó de venderse" ? ` ${p.variacionPct > 0 ? "+" : ""}${p.variacionPct}%` : ""}
                      </Pastilla>
                    </td>
                    <td className="py-3 pr-4 sm:pr-6 text-xs text-gray-600 leading-relaxed">{p.recomendacion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fam.productos.length > 15 && (
            <button type="button" onClick={() => setTodos((v) => !v)} className="mt-4 text-sm font-medium text-primary-light hover:text-primary">
              {todos ? "Ver solo los 15 primeros" : `Ver los ${fam.productos.length} productos de ${fam.familia.toLowerCase()}`}
            </button>
          )}
        </Seccion>
      )}

      <div className="text-xs text-gray-500 leading-relaxed space-y-1 px-1">
        {t.fueraDeCarta.ventas > 0 && (
          <p>
            Fuera de los rankings, {formatCurrency(t.fueraDeCarta.ventas)} que no es carta (delivery, extras, packaging, retail y
            combos puntuales): {t.fueraDeCarta.filas.slice(0, 4).map((f) => f.nombre.toLowerCase()).join(", ")}
            {t.fueraDeCarta.filas.length > 4 ? "…" : ""}.
          </p>
        )}
        <p>
          Clase A = productos que juntan el 80% de la venta · B hasta el 95% · C el resto. Tendencia = último mes contra el
          primero (+15% o más, creciendo; −15% o menos, cayendo). La recomendación no mira costos ni márgenes: antes de sacar algo
          de carta, crúzalo con el Pricing Maestro y confirma si hubo quiebre de stock.
        </p>
      </div>
    </div>
  );
}
