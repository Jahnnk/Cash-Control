"use client";

/**
 * Dashboard de Grupo · sección 3 «Egresos» (diseño de Jahnn, 1-nov-2026): el total de salidas de dinero, los costos
 * operativos contra lo que no es gasto, la barra de cómo se reparten, las cuatro familias con su detalle y, aparte,
 * la conciliación. Es su pestaña «Resumen fijo vs variable»: los % son «de las salidas». Lógica: lib/dashboard-egresos.ts.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { SeccionDesplegable } from "@/components/productos/ui";
import { getEgresosPorTipo } from "@/app/actions/egresos-por-tipo";
import type { EgresosPorTipo } from "@/lib/egresos-por-tipo";
import { COLOR_SALIDA, vistaEgresos, type FamiliaSalida, type VistaEgresos } from "@/lib/dashboard-egresos";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct1 = (n: number) => `${n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Trae lo que salió de la cuenta de cada sede en el mes. `undefined` = cargando, `null` = no se pudo leer. */
export function useEgresosPorTipo(mes: string): EgresosPorTipo[] | null | undefined {
  const [res, setRes] = useState<{ mes: string; sedes: EgresosPorTipo[] | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    getEgresosPorTipo(mes)
      .then((r) => { if (vivo) setRes({ mes, sedes: r.ok ? r.sedes : null }); })
      .catch(() => { if (vivo) setRes({ mes, sedes: null }); });
    return () => { vivo = false; };
  }, [mes]);
  return res?.mes === mes ? res.sedes : undefined;
}

export function EgresosCuerpo({ sedes, sede, enCurso, cajaHref }: { sedes: EgresosPorTipo[] | null | undefined; sede: number | null; enCurso: boolean; cajaHref: string }) {
  if (sedes === undefined) return <div className="h-40 rounded-2xl bg-gray-50 motion-safe:animate-pulse" aria-label="Cargando los egresos" />;
  const v = sedes ? vistaEgresos(sedes, sede) : null;
  if (!v || v.total <= 0) return <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">Todavía no hay egresos cargados de este mes: falta el Excel de Finanzas.</p>;
  return <Vista v={v} enCurso={enCurso} cajaHref={cajaHref} />;
}

function Vista({ v, enCurso, cajaHref }: { v: VistaEgresos; enCurso: boolean; cajaHref: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gray-50 p-4 sm:p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Total de salidas de dinero</div>
        <div className="mt-1.5 text-4xl font-semibold tabular-nums leading-none tracking-tight text-gray-900 sm:text-5xl">{soles(v.total)}</div>
        <p className="mt-3 flex items-start gap-1.5 text-sm text-gray-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Incluye costos operativos, financiamiento, inversión, movimientos que no son gasto y pendientes.{enCurso ? " Hasta la fecha: faltan pagos de fin de mes." : ""}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Costos operativos</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{soles(v.operativos.monto)}</div>
          <div className="mt-0.5 text-sm text-gray-500">{pct1(v.operativos.pct)} del total</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-sm text-gray-500">Movimientos no considerados gasto</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{soles(v.noGasto.monto)}</div>
          <div className="mt-0.5 text-sm text-gray-500">{pct1(v.noGasto.pct)} del total</div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900">Distribución de las salidas de dinero</h3>
        <div className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Cómo se reparten las salidas: ${v.barra.map((b) => `${b.etiqueta} ${pct1(b.pct)}`).join(", ")}`}>
          {v.barra.map((b) => <span key={b.clave} style={{ width: `${Math.max(b.pct, 0.4)}%`, background: COLOR_SALIDA[b.clave] }} title={`${b.etiqueta} · ${soles(b.monto)}`} />)}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {v.barra.map((b) => <li key={b.clave} className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_SALIDA[b.clave] }} aria-hidden />{b.etiqueta}</li>)}
        </ul>
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-900">4 familias de egresos</h3>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {v.familias.map((f) => (
            <div key={f.clave} className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4">
              <span className="block h-1.5 w-8 rounded-full" style={{ background: COLOR_SALIDA[f.clave] }} aria-hidden />
              <span className="mt-3 block text-sm font-medium text-gray-900">{f.etiqueta}</span>
              <span className="mt-0.5 block text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{soles(f.monto)}</span>
              <span className="mt-0.5 block text-xs text-gray-500">{pct1(f.pct)} de salidas</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-900">Detalle por tipo de egreso</h3>
        <div className="mt-2 space-y-3">
          {v.detalles.map((f) => <Bloque key={f.clave} f={f} abierto={f.clave === "fijos" || f.clave === "variables"} revisar={f.clave === "pendiente" && v.hayPendiente} />)}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">«No es gasto» y «Por conciliar» salieron de la cuenta pero no son costo de la operación: se ven aparte para no confundir transferencias, distribuciones y partidas pendientes con gastos.</p>
      </div>

      <p className="text-[11px] leading-snug text-gray-500">
        Esto es lo que salió de la cuenta, tal cual el Excel. Los costos del EBITDA (sección 4) son lo que le toca a cada sede, con las devoluciones y las partes de otras sedes ya restadas.{" "}
        <Link href={cajaHref} className="font-medium text-primary hover:underline">Ver cómo cuadra →</Link>
      </p>
    </div>
  );
}

function Bloque({ f, abierto, revisar }: { f: FamiliaSalida; abierto: boolean; revisar: boolean }) {
  const top = f.categorias.slice(0, 3).map((c) => c.nombre).join(", ");
  return (
    <SeccionDesplegable
      abiertaAlInicio={abierto}
      titulo={<span className="flex flex-wrap items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_SALIDA[f.clave] }} aria-hidden />{f.etiqueta} · {soles(f.monto)}{revisar && <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">Revisar</span>}</span>}
      subtitulo={`${pct1(f.pct)} de las salidas`}
      resumen={<span className="text-xs text-gray-600">{f.categorias.length === 0 ? "Sin movimientos este mes." : `Lo que más pesa: ${top}.`}</span>}
    >
      <Detalle f={f} revisar={revisar} />
    </SeccionDesplegable>
  );
}

function Detalle({ f, revisar }: { f: FamiliaSalida; revisar: boolean }) {
  const [vista, setVista] = useState<"categorias" | "participacion">("categorias");
  const max = Math.max(...f.categorias.map((c) => c.monto), 1);
  return (
    <div>
      <div className="flex gap-1" role="tablist" aria-label="Cómo ver el desglose">
        {([["categorias", "Categorías"], ["participacion", "Participación"]] as const).map(([k, etiqueta]) => (
          <button key={k} type="button" role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${vista === k ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"}`}>{etiqueta}</button>
        ))}
      </div>
      {f.categorias.length === 0 ? <p className="mt-4 text-sm text-gray-500">Sin movimientos este mes.</p> : (
        <ul className="mt-3 space-y-3">
          {f.categorias.map((c) => (
            <li key={c.nombre}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-gray-800">{c.nombre}</span>
                <span className="shrink-0 tabular-nums text-gray-900">{vista === "categorias" ? soles(c.monto) : pct1(c.pctFamilia)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full" style={{ width: `${Math.max(vista === "categorias" ? (c.monto / max) * 100 : c.pctFamilia, 1)}%`, background: COLOR_SALIDA[f.clave] }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {revisar && <p className="mt-3 text-xs text-orange-700">Se corrige en el Excel (la fila indicada) y el movimiento vuelve a su tipo.</p>}
    </div>
  );
}
