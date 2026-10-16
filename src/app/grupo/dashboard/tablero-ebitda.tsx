"use client";

/**
 * «Rentabilidad» — el tablero del CEO con las ideas de la asesoría del coach (16-oct-2026): el EBITDA
 * como titular, cinco tarjetas (piso diario, Profit First, food cost, planilla, mermas), la regla
 * 33-33-33, los cuatro motores en un radar y los productos clave, con un selector Consolidado · Fonavi ·
 * Centro · Atelier. Todo sale de lo que ya calculan los otros motores (lib/tablero-ebitda.ts); lo que el
 * sistema no puede comprobar sale en gris, nunca inventado.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Segmentado } from "@/components/productos/ui";
import { PastelRegla, PARTES } from "@/components/pastel-regla";
import { getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { regla33, profitFirst } from "@/lib/regla-33";
import { tarjetasDelTablero, titularEbitda, puntosDelRadar, type Tarjeta } from "@/lib/tablero-ebitda";
import { pisoDePrecios, type PisoSede } from "@/lib/productos/piso-precios";
import { CAFETERIAS } from "@/lib/productos/cafeterias";
import type { EstadoMotor, Motores } from "@/lib/motores-ebitda";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const ESTADO: Record<EstadoMotor, { barra: string; texto: string; punto: string; chip: string }> = {
  verde: { barra: "bg-emerald-500", texto: "text-emerald-700", punto: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  ambar: { barra: "bg-amber-400", texto: "text-amber-700", punto: "bg-amber-400", chip: "bg-amber-50 text-amber-800 ring-amber-200" },
  rojo: { barra: "bg-red-500", texto: "text-red-700", punto: "bg-red-500", chip: "bg-red-50 text-red-700 ring-red-200" },
  gris: { barra: "bg-gray-300", texto: "text-gray-400", punto: "bg-gray-300", chip: "bg-gray-100 text-gray-500 ring-gray-200" },
};

const SEDES = [
  { etiqueta: "Consolidado", regla: "Grupo", id: CAFETERIAS },
  { etiqueta: "Fonavi", regla: "Fonavi", id: 2 },
  { etiqueta: "Centro", regla: "Centro", id: 3 },
  { etiqueta: "Atelier", regla: "Atelier", id: 1 },
] as const;

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);

function TarjetaKpi({ t }: { t: Tarjeta }) {
  const e = ESTADO[t.estado];
  return (
    <div className="min-w-0 rounded-2xl border border-gray-200/80 bg-white px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-500">
        <span className={`h-2 w-2 rounded-full ${e.punto}`} aria-hidden />{t.titulo}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold tabular-nums leading-none ${t.estado === "gris" ? "text-gray-400" : "text-gray-900"}`}>{t.valor}</div>
      <div className="mt-1 text-xs text-gray-500 leading-snug">{t.meta}</div>
      {t.avance !== null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-gray-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, t.avance)} aria-label={`${t.titulo}: ${t.avance}% de su meta`}>
          <div className={`h-full rounded-full ${e.barra}`} style={{ width: `${Math.max(2, Math.min(100, t.avance))}%` }} />
        </div>
      )}
      <div className={`mt-1.5 text-[11px] leading-snug ${t.estado === "gris" ? "text-gray-400" : e.texto}`}>{t.apoyo}</div>
    </div>
  );
}

/** El radar de los cuatro motores: un eje por motor, el borde punteado es la meta (100) y la mancha, cómo va. */
function Radar({ m }: { m: Motores | null }) {
  const ejes = puntosDelRadar(m);
  const C = 100, R = 66;
  // Arriba, derecha, abajo, izquierda.
  const dir = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  const punto = (i: number, v: number) => `${C + dir[i][0] * R * (v / 100)},${C + dir[i][1] * R * (v / 100)}`;
  const mancha = ejes.map((x, i) => punto(i, x.puntaje ?? 0)).join(" ");
  const nombres = ["Ventas", "Producto", "Fijos", "Eficiencia"];
  const anclas = ["middle", "start", "middle", "end"] as const;
  const lab = [[C, 14], [C + R + 8, C + 3], [C, 196], [C - R - 8, C + 3]] as const;
  return (
    <svg viewBox="-26 0 252 206" className="h-44 w-[13.5rem] shrink-0" role="img" aria-label={`Los cuatro motores: ${ejes.map((x, i) => `${nombres[i]} ${x.puntaje === null ? "sin dato" : `${x.puntaje} de 100`}`).join(", ")}`}>
      {[50, 100].map((v) => <polygon key={v} points={ejes.map((_, i) => punto(i, v)).join(" ")} fill="none" className={v === 100 ? "stroke-gray-400" : "stroke-gray-200"} strokeWidth={1} strokeDasharray={v === 100 ? "3 3" : undefined} />)}
      {dir.map((_, i) => <line key={i} x1={C} y1={C} x2={C + dir[i][0] * R} y2={C + dir[i][1] * R} className="stroke-gray-200" strokeWidth={1} />)}
      <polygon points={mancha} className="fill-emerald-500/20 stroke-emerald-600" strokeWidth={1.8} strokeLinejoin="round" />
      {ejes.map((x, i) => x.puntaje !== null && <circle key={x.clave} cx={C + dir[i][0] * R * (x.puntaje / 100)} cy={C + dir[i][1] * R * (x.puntaje / 100)} r={3.2} className={x.estado === "rojo" ? "fill-red-500" : x.estado === "ambar" ? "fill-amber-400" : "fill-emerald-600"} />)}
      {nombres.map((n, i) => <text key={n} x={lab[i][0]} y={lab[i][1]} textAnchor={anclas[i]} className="fill-gray-600 text-[9px] font-medium">{n}</text>)}
    </svg>
  );
}

function Panel({ titulo, children, pie }: { titulo: string; children: React.ReactNode; pie?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-gray-200/80 bg-white px-4 py-4 sm:px-5">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{titulo}</h3>
      <div className="mt-3">{children}</div>
      {pie && <div className="mt-3 border-t border-gray-100 pt-2.5 text-[11px]">{pie}</div>}
    </section>
  );
}

export function TableroEbitda({ cifras, breakeven, motores, selectedMonth, isCurrentMonth, periodo }: {
  cifras: SeisCifras | null; breakeven: GroupBreakeven | null; motores: Motores[] | null;
  selectedMonth: string; isCurrentMonth: boolean; periodo: string;
}) {
  const [sede, setSede] = useState<(typeof SEDES)[number]["etiqueta"]>("Consolidado");
  const s = SEDES.find((x) => x.etiqueta === sede)!;
  const filas = useMemo(() => (cifras ? regla33(cifras) : []), [cifras]);
  const profit = useMemo(() => (cifras ? profitFirst(cifras) : []), [cifras]);
  const fila = filas.find((x) => x.etiqueta === s.regla) ?? null;
  const pf = profit.find((x) => x.etiqueta === s.regla) ?? null;
  const mot = motores?.find((x) => x.etiqueta === s.regla) ?? null;
  const be = s.id === CAFETERIAS ? breakeven?.grupo ?? null : breakeven?.sedes.find((x) => x.businessId === s.id)?.result ?? null;

  const tarjetas = useMemo(() => tarjetasDelTablero({ regla: fila, profit: pf, equilibrio: be, enCurso: isCurrentMonth, motores: mot }), [fila, pf, be, isCurrentMonth, mot]);
  const titular = titularEbitda(fila);

  // Los productos de la carta (Consolidado = Fonavi + Centro; Atelier no tiene carta con precio).
  const [carta, setCarta] = useState<{ clave: string; piso: PisoSede | null } | null>(null);
  const clave = `${selectedMonth}-${s.id}`;
  useEffect(() => {
    if (s.id === 1) return;
    let vivo = true;
    getRentabilidadProductos(selectedMonth, s.id).then((r) => { if (vivo) setCarta({ clave, piso: r.ok && r.data ? pisoDePrecios(r.data) : null }); }).catch(() => { if (vivo) setCarta({ clave, piso: null }); });
    return () => { vivo = false; };
  }, [selectedMonth, s.id, clave]);
  const piso = s.id !== 1 && carta?.clave === clave ? carta.piso : null;
  const cargando = s.id !== 1 && carta?.clave !== clave;
  const top5 = useMemo(() => (piso ? [...piso.filas].sort((a, b) => (b.precio - b.costo) * b.unidades - (a.precio - a.costo) * a.unidades).slice(0, 5) : []), [piso]);

  if (!cifras) return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {periodo}.</p>;
  const aMedias = fila && !fila.mesCompleto;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Rentabilidad · {periodo.toLowerCase()}</h2>
        <Segmentado tamano="sm" valor={sede} onChange={setSede} opciones={SEDES.map((x) => ({ valor: x.etiqueta, etiqueta: x.etiqueta }))} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={`inline-flex items-center rounded-xl px-4 py-2 text-base font-semibold ring-1 ring-inset ${ESTADO[titular.estado].chip}`}>{titular.texto}</span>
        {mot && fila?.ebitda && <span className="text-sm text-gray-700">{mot.titular}</span>}
      </div>
      {aMedias && <p className="-mt-2 text-[11px] text-amber-700">Mes a medias: costos y gastos llegan hasta el último día con Excel; la planilla y el alquiler se pagan a fin de mes, así que lo de arriba aún no es el resultado del mes.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tarjetas.map((t) => <TarjetaKpi key={t.clave} t={t} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel titulo="Regla 33-33-33" pie={<Link href={`/grupo/reportes${isCurrentMonth ? "" : `?mes=${selectedMonth}`}`} className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">Ver el detalle en Reportes <ArrowRight className="h-3 w-3" /></Link>}>
          {fila?.ebitda && fila.costos && fila.fijos ? (
            <div className="flex items-center gap-4">
              <PastelRegla f={{ costos: fila.costos, fijos: fila.fijos, ebitda: fila.ebitda, termometro: fila.termometro }} className="h-32 w-32" />
              <ul className="min-w-0 flex-1 space-y-1.5 text-xs tabular-nums">
                {([["costos", fila.costos], ["fijos", fila.fijos], ["ebitda", fila.ebitda]] as const).map(([k, b]) => (
                  <li key={k} className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-gray-700"><span className={`h-2 w-2 rounded-full ${PARTES[k].punto}`} aria-hidden />{PARTES[k].nombre}</span>
                    <span className="whitespace-nowrap"><b className={(k === "ebitda" ? b.pct < b.metaPct : b.pct > b.metaPct) ? "text-amber-700" : "text-emerald-700"}>{pct(b.pct)}</b><span className="text-gray-400"> / {Math.round(b.metaPct)}%</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-xs text-gray-400">{fila?.sinResultadoPorque ?? "Sin datos"}: todavía no hay regla que mostrar.</p>}
        </Panel>

        <Panel titulo="Los cuatro motores" pie={<span className="text-gray-500">El borde punteado es la meta; la mancha, cómo va cada motor.</span>}>
          {mot ? (
            <div className="flex items-center gap-3">
              <Radar m={mot} />
              <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
                {mot.motores.map((x) => (
                  <li key={x.clave} className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-gray-700"><span className={`h-2 w-2 rounded-full ${ESTADO[x.estado].punto}`} aria-hidden />{x.titulo.replace("Eficiencia del sistema", "Eficiencia").replace("Costo del producto", "Producto")}</span>
                    <b className="tabular-nums text-gray-900">{x.puntaje === null ? "—" : x.puntaje}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-xs text-gray-400">Calculando los motores…</p>}
        </Panel>

        <Panel titulo="Precios de la carta" pie={s.id !== 1 ? <Link href="/grupo/productos" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">Ver Productos <ArrowRight className="h-3 w-3" /></Link> : undefined}>
          {s.id === 1 ? <p className="text-xs text-gray-500">Atelier vende por pedidos a empresas y a las cafeterías: no tiene carta con precio al público.</p>
            : cargando ? <p className="text-xs text-gray-400">Calculando…</p>
            : piso ? (
              <dl className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3"><dt className="text-gray-600">Bajo el piso (costo × 3)</dt><dd className={`font-semibold tabular-nums ${piso.bajo > 0 ? "text-amber-700" : "text-emerald-700"}`}>{piso.bajo} de {piso.conCosto}</dd></div>
                <div className="flex items-baseline justify-between gap-3"><dt className="text-gray-600">Margen bruto de la carta</dt><dd className={`font-semibold tabular-nums ${(piso.margenCartaPct ?? 0) >= 65 ? "text-emerald-700" : "text-amber-700"}`}>{pct(piso.margenCartaPct)}</dd></div>
                <div className="flex items-baseline justify-between gap-3"><dt className="text-gray-600">Planilla sobre ventas</dt><dd className="font-semibold tabular-nums text-gray-900">{pct(fila?.planilla?.pct ?? null)}</dd></div>
                <p className="text-[11px] leading-snug text-gray-500">Lo sano: margen bruto de 65% a 70% o más; planilla de 20% a 25%.</p>
              </dl>
            ) : <p className="text-xs text-gray-500">Sin reporte de rotación de {periodo.toLowerCase()} para calcular los precios.</p>}
        </Panel>
      </div>

      {s.id !== 1 && (
        <section className="min-w-0 rounded-2xl border border-gray-200/80 bg-white">
          <h3 className="px-4 pt-4 text-[11px] font-medium uppercase tracking-wider text-gray-500 sm:px-5">Los 5 productos que más dejan {s.id === CAFETERIAS ? "(Fonavi + Centro)" : `(${s.etiqueta})`}</h3>
          {cargando ? <p className="px-4 py-4 text-xs text-gray-400 sm:px-5">Calculando…</p>
            : top5.length === 0 ? <p className="px-4 py-4 text-xs text-gray-500 sm:px-5">Sin productos con precio y costo de insumos conocidos este mes.</p>
            : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
                      <th className="py-2 pl-4 pr-3 text-left font-medium sm:pl-5">Producto</th>
                      <th className="px-3 py-2 text-right font-medium">Vendió</th>
                      <th className="px-3 py-2 text-right font-medium">Precio</th>
                      <th className="px-3 py-2 text-right font-medium">Food cost</th>
                      <th className="px-3 py-2 text-right font-medium">Margen bruto</th>
                      <th className="py-2 pl-3 pr-4 text-right font-medium sm:pr-5">Deja</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {top5.map((p) => (
                      <tr key={p.nombre}>
                        <td className="py-2.5 pl-4 pr-3 text-gray-900 sm:pl-5">{p.nombre}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-700">{p.unidades.toLocaleString("es-PE")} u</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-700">S/{p.precio.toFixed(2)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-700">{pct(p.costoPct)}</td>
                        <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums font-medium ${p.estado === "bajo" ? "text-amber-700" : "text-emerald-700"}`}>{pct(p.margenPct)}</td>
                        <td className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right font-semibold tabular-nums text-gray-900 sm:pr-5">{soles((p.precio - p.costo) * p.unidades)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <p className="px-4 pb-3 pt-2 text-[11px] leading-snug text-gray-500 sm:px-5">«Deja» es precio menos costo de insumos por lo vendido en el período. El precio es el que Byte cobró en promedio.</p>
        </section>
      )}
    </div>
  );
}
