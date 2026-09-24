"use client";

/**
 * Grupo → Productos → El mes: dos apartados pedidos por Jahnn el 24-sep-2026.
 *
 *  · Ranking por categoría: igual que el de postres, para cada categoría
 *    (sánguches, bebidas calientes, bebidas frías, cócteles, panadería…),
 *    con los candidatos a reemplazo de esa categoría. Los candidatos son los
 *    MISMOS de la sección "Candidatos a reemplazo", solo repartidos por
 *    categoría: un solo criterio, nunca se contradicen.
 *  · Regla 80/20: cuántos productos hacen el 80% de la venta, del mes y de
 *    los últimos 3 meses, para ver si la venta se concentra o se reparte.
 *
 * Los dos van plegados (regla de orden visual): se cargan al abrirlos, salvo
 * el resumen del 80/20, que se ve cerrado.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PanoramaProductos, ProductoRanking } from "@/lib/productos/panorama";
import { FAMILIA_OTROS } from "@/lib/productos/panorama";
import { candidatosDeCategoria } from "@/lib/productos/por-categoria";
import { tendenciaPareto, type Pareto } from "@/lib/productos/ochenta-veinte";
import {
  getCandidatosReemplazo, getReglaOchentaVeinte, type CandidatosReemplazo, type OchentaVeinteSede,
} from "@/app/actions/productos-panorama";
import { Barra, Pastilla, PuntoFamilia, Puesto, SeccionDesplegable, colorFamilia, nombreMes } from "@/components/productos/ui";

/* ─────────────────────── Ranking por categoría ─────────────────────── */

const VEREDICTO: Record<"sacar" | "preparar" | "revisar" | "confirmar", { etiqueta: string; tono: "rojo" | "ambar" | "azul" | "gris" }> = {
  sacar: { etiqueta: "Sacar de carta", tono: "rojo" },
  preparar: { etiqueta: "Preparar reemplazo", tono: "ambar" },
  revisar: { etiqueta: "Revisar en una sede", tono: "azul" },
  confirmar: { etiqueta: "¿Ya salió?", tono: "gris" },
};
function FilaCategoria({ n, x, max, ventasCategoria }: { n: number; x: ProductoRanking; max: number; ventasCategoria: number }) {
  const pctCat = ventasCategoria > 0 ? Math.round((x.ingresos / ventasCategoria) * 1000) / 10 : 0;
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Puesto n={n} destacado={n <= 3} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 leading-snug">{x.nombre}</div>
            <div className="text-xs text-gray-500 mt-0.5">{x.unidadesPorDia ?? "—"} por día · {x.unidades} u{x.precio !== null && <> · {formatCurrency(x.precio)} c/u</>}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(x.ingresos)}</div>
            <div className="text-xs text-gray-500 tabular-nums mt-0.5">{pctCat}% de la categoría</div>
          </div>
        </div>
        <div className="mt-2"><Barra pct={(x.ingresos / max) * 100} color={colorFamilia(x.familia)} alto="h-1" /></div>
      </div>
    </li>
  );
}

export function RankingPorCategoria({ p, sede, month }: { p: PanoramaProductos; sede: number; month: string }) {
  const familias = p.familias.filter((f) => f.familia !== FAMILIA_OTROS && f.ventas > 0);
  const [fam, setFam] = useState<string>(familias[0]?.familia ?? "");
  const [todos, setTodos] = useState(false);
  const [cand, setCand] = useState<CandidatosReemplazo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCand, setErrorCand] = useState<string | null>(null);
  const cafeteria = sede === 2 || sede === 3;

  async function cargarCandidatos() {
    if (!cafeteria || cand || cargando) return;
    setCargando(true);
    const r = await getCandidatosReemplazo(month);
    setCargando(false);
    if (r.ok) setCand(r.data); else setErrorCand(r.error);
  }

  const productos = p.carta.filter((x) => x.familia === fam);
  const actual = familias.find((f) => f.familia === fam);
  const visibles = todos ? productos : productos.slice(0, 10);
  const deCategoria = cand ? candidatosDeCategoria(cand.candidatos, fam, sede) : [];
  const porCategoria = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cand?.candidatos ?? []) {
      if (c.veredicto === "observar" || !c.sedes.some((x) => x.businessId === sede)) continue;
      m.set(c.familia, (m.get(c.familia) ?? 0) + 1);
    }
    return m;
  }, [cand, sede]);

  if (familias.length === 0) return null;
  return (
    <SeccionDesplegable
      titulo="Ranking por categoría"
      subtitulo="Los productos que más ingresan en cada categoría y cuáles son candidatos a reemplazo."
      onAbrir={cargarCandidatos}
      resumen={
        <div className="flex flex-wrap gap-1.5">
          {familias.slice(0, 4).map((f) => (
            <span key={f.familia} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-600">
              <PuntoFamilia familia={f.familia} /> {f.familia} <b className="tabular-nums text-gray-900">{f.pct}%</b>
            </span>
          ))}
          {familias.length > 4 && <span className="text-[11px] text-gray-500 self-center">y {familias.length - 4} más</span>}
        </div>
      }
    >
      {/* Selector de categoría */}
      <div className="flex flex-wrap gap-2 mb-5">
        {familias.map((f) => {
          const n = porCategoria.get(f.familia) ?? 0;
          const activa = f.familia === fam;
          return (
            <button
              key={f.familia}
              type="button"
              onClick={() => { setFam(f.familia); setTodos(false); }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                activa ? "border-primary-light bg-primary-50/60 ring-1 ring-primary-light/30" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <PuntoFamilia familia={f.familia} />
              <span className="font-medium text-gray-900">{f.familia}</span>
              <span className="tabular-nums text-gray-500">{f.pct}%</span>
              {n > 0 && <span className="rounded-full bg-red-50 px-1.5 text-[10px] font-semibold text-red-700 ring-1 ring-inset ring-red-200 tabular-nums">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
        <div className="xl:col-span-3 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <h4 className="text-sm font-semibold text-gray-900">{fam}</h4>
            {actual && (
              <span className="text-xs text-gray-500 tabular-nums">
                {formatCurrency(actual.ventas)} · {actual.pct}% de la venta · {productos.length} productos
              </span>
            )}
          </div>
          <ol className="divide-y divide-gray-100">
            {visibles.map((x, i) => (
              <FilaCategoria key={x.nombre} n={i + 1} x={x} max={productos[0]?.ingresos ?? 1} ventasCategoria={actual?.ventas ?? 0} />
            ))}
          </ol>
          {productos.length > 10 && (
            <button type="button" onClick={() => setTodos((v) => !v)} className="mt-4 text-sm font-medium text-primary-light hover:text-primary">
              {todos ? "Ver solo los 10 primeros" : `Ver los ${productos.length} productos`}
            </button>
          )}
        </div>

        <div className="xl:col-span-2 min-w-0 rounded-2xl bg-gray-50 border border-gray-200/80 p-4">
          <h4 className="text-sm font-semibold text-gray-900">Candidatos a reemplazo en {fam.toLowerCase()}</h4>
          <p className="text-xs text-gray-500 mt-1">Los mismos de la sección «Candidatos a reemplazo», solo los de esta categoría.</p>
          <div className="mt-4">
            {!cafeteria ? (
              <p className="text-sm text-gray-500">Los candidatos a reemplazo se calculan para Fonavi y Centro.</p>
            ) : cargando || (!cand && !errorCand) ? (
              <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
            ) : errorCand ? (
              <p className="text-sm text-red-700">{errorCand}</p>
            ) : deCategoria.length === 0 ? (
              <p className="text-sm text-gray-500">Ningún producto de esta categoría está para reemplazo.</p>
            ) : (
              <ul className="space-y-3">
                {deCategoria.map((c) => {
                  const v = VEREDICTO[c.veredicto as keyof typeof VEREDICTO];
                  return (
                    <li key={c.clave} className="rounded-xl bg-white border border-gray-200/80 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 leading-snug">{c.nombre}</span>
                        <Pastilla tono={v.tono}>{v.etiqueta}</Pastilla>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{c.razon}</p>
                      <p className="text-xs text-gray-500 mt-1 tabular-nums">Vende {formatCurrency(c.impactoMes.venta)} al mes entre las dos sedes.</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </SeccionDesplegable>
  );
}

/* ─────────────────────────── Regla 80/20 ─────────────────────────── */

function BloquePareto({ titulo, detalle, x }: { titulo: string; detalle: string; x: Pareto | null }) {
  if (!x) {
    return (
      <div className="rounded-2xl border border-gray-200/80 p-4">
        <div className="text-xs font-medium text-gray-500">{titulo}</div>
        <p className="text-sm text-gray-500 mt-2">Sin reportes cargados.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-200/80 p-4 min-w-0">
      <div className="text-xs font-medium text-gray-500">{titulo} <span className="text-gray-400">· {detalle}</span></div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">{x.nucleo} <span className="text-sm font-normal text-gray-500">de {x.productos} productos</span></div>
      <div className="text-sm text-gray-600">hacen el 80% de la venta ({x.pctNucleo}% de la carta)</div>
      {/* Las dos barras: qué parte de la carta vs qué parte de la venta */}
      <div className="mt-4 space-y-2 text-xs text-gray-500">
        <div>
          <div className="flex justify-between mb-1"><span>Productos</span><span className="tabular-nums">{x.pctNucleo}% · {x.nucleo}</span></div>
          <Barra pct={x.pctNucleo} color="#004C40" alto="h-2" />
        </div>
        <div>
          <div className="flex justify-between mb-1"><span>Venta</span><span className="tabular-nums">80%</span></div>
          <Barra pct={80} color="#098B5F" alto="h-2" />
        </div>
      </div>
      <ul className="mt-4 space-y-1 text-xs text-gray-600">
        <li>El 20% más vendido ({x.top20} productos) hace el <b className="tabular-nums text-gray-900">{x.ventasTop20Pct}%</b> de la venta.</li>
        <li>La cola: <b className="tabular-nums text-gray-900">{x.cola}</b> productos juntos hacen solo el <b className="tabular-nums text-gray-900">{x.ventasColaPct}%</b>.</li>
      </ul>
    </div>
  );
}

export function ReglaOchentaVeinte({ month, sede }: { month: string; sede: number }) {
  const [data, setData] = useState<OchentaVeinteSede[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let vivo = true;
    getReglaOchentaVeinte(month).then((r) => {
      if (!vivo) return;
      if (r.ok) setData(r.sedes); else setError(r.error);
    });
    return () => { vivo = false; };
  }, [month]);

  const sel = data?.find((x) => x.businessId === sede) ?? null;
  const tend = sel ? tendenciaPareto(sel.mes, sel.tresMeses) : null;
  const nucleo = sel?.mes ? sel.mes.lista.slice(0, sel.mes.nucleo) : [];
  const visibles = todos ? nucleo : nucleo.slice(0, 15);
  const meses = sel?.meses ?? [];

  return (
    <SeccionDesplegable
      titulo="Regla 80/20"
      subtitulo="¿El 80% de la venta sale del 20% de los productos? El mes contra los últimos 3 meses."
      resumen={
        error ? <span className="text-xs text-red-700">{error}</span>
        : !data ? <span className="text-xs text-gray-400">Calculando…</span>
        : (
          <div className="flex flex-wrap gap-1.5">
            {data.filter((x) => x.mes).map((x) => (
              <span key={x.businessId} className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-600">
                {x.sede}: el 80% sale de <b className="tabular-nums text-gray-900">{x.mes!.nucleo}</b> productos ({x.mes!.pctNucleo}%)
              </span>
            ))}
          </div>
        )
      }
    >
      {error ? <p className="text-sm text-red-700">{error}</p>
        : !sel ? <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Calculando…</div>
        : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BloquePareto titulo="Este mes" detalle={nombreMes(month)} x={sel.mes} />
              <BloquePareto titulo="Últimos 3 meses" detalle={meses.length ? `${nombreMes(meses[0], true)}–${nombreMes(meses[meses.length - 1], true)}` : ""} x={sel.tresMeses} />
            </div>
            {tend && (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${
                tend.tono === "concentra" ? "border-amber-200 bg-amber-50 text-amber-900" : tend.tono === "reparte" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-gray-200 bg-gray-50 text-gray-700"
              }`}>
                {tend.texto}
                {tend.tono === "concentra" && " Depender de menos productos es más riesgoso: si uno falta, se nota en la venta."}
              </div>
            )}
            {nucleo.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Los {nucleo.length} productos que hacen el 80% este mes</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left font-medium py-2 pr-3">#</th>
                        <th className="text-left font-medium py-2 pr-3">Producto</th>
                        <th className="text-left font-medium py-2 pr-3">Categoría</th>
                        <th className="text-right font-medium py-2 pr-3">Ingresos</th>
                        <th className="text-right font-medium py-2 pr-3">% venta</th>
                        <th className="text-right font-medium py-2">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {visibles.map((x, i) => (
                        <tr key={x.nombre}>
                          <td className="py-2 pr-3 text-gray-400 tabular-nums">{i + 1}</td>
                          <td className="py-2 pr-3 text-gray-900">{x.nombre}</td>
                          <td className="py-2 pr-3 text-gray-500 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><PuntoFamilia familia={x.familia} /> {x.familia}</span></td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-900">{formatCurrency(x.ingresos)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-gray-600">{x.pct}%</td>
                          <td className="py-2 text-right tabular-nums text-gray-600">{x.acumPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {nucleo.length > 15 && (
                  <button type="button" onClick={() => setTodos((v) => !v)} className="mt-3 text-sm font-medium text-primary-light hover:text-primary">
                    {todos ? "Ver solo los 15 primeros" : `Ver los ${nucleo.length} productos`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
    </SeccionDesplegable>
  );
}
