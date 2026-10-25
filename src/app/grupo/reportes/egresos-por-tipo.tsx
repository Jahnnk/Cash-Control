"use client";

/**
 * Reportes · «Egresos por tipo» (pedido de Jahnn, 25-oct-2026): su pestaña «Resumen fijo vs variable» del Excel,
 * dentro del sistema y para cualquier sede y mes. Todo lo que salió de la cuenta, en cinco tipos con su %; el
 * detalle por categoría y el puente hasta las seis cifras, a un toque. Fácil de leer: plegado, con el resumen a la vista.
 */

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getEgresosPorTipo } from "@/app/actions/egresos-por-tipo";
import { ENTRA_AL_PE, type EgresosPorTipo, type PuenteTipo } from "@/lib/egresos-por-tipo";

const soles = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

export function EgresosPorTipoSeccion({ mes, periodo }: { mes: string; periodo: string }) {
  const [res, setRes] = useState<{ mes: string; sedes: EgresosPorTipo[] | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    getEgresosPorTipo(mes)
      .then((r) => { if (vivo) setRes({ mes, sedes: r.ok ? r.sedes : null }); })
      .catch(() => { if (vivo) setRes({ mes, sedes: null }); });
    return () => { vivo = false; };
  }, [mes]);
  return <VistaEgresosPorTipo sedes={res?.mes === mes ? res.sedes : undefined} periodo={periodo} />;
}

/** Solo dibuja. `undefined` = cargando; `null` = no se pudo leer. */
export function VistaEgresosPorTipo({ sedes, periodo, sedeInicial, abierta = false }: { sedes: EgresosPorTipo[] | null | undefined; periodo: string; sedeInicial?: number; abierta?: boolean }) {
  const [elegida, setElegida] = useState<number | null>(sedeInicial ?? null);
  if (sedes === undefined) return <div className="h-12 rounded-2xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Cargando los egresos por tipo" />;
  if (sedes === null) return null;
  const e = sedes.find((s) => s.businessId === elegida) ?? sedes[0];
  if (!e) return null;
  return (
    <details open={abierta || undefined} className="group rounded-2xl border border-gray-200/80 bg-white px-4 py-3 sm:px-6" aria-label="Egresos por tipo">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold text-gray-900">Egresos por tipo <span className="font-normal text-gray-500">· {periodo}</span></h2>
        <span className="text-xs text-gray-500">Fijo, variable, financiamiento, inversión y no es gasto, por sede</span>
        <ChevronDown className="ml-auto h-4 w-4 self-center text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Sede">
        {sedes.map((s) => (
          <button key={s.businessId} type="button" role="tab" aria-selected={s.businessId === e.businessId} onClick={() => setElegida(s.businessId)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${s.businessId === e.businessId ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            {s.sede}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-500">Todo lo que salió de la cuenta de {e.sede} en {periodo.toLowerCase()}, clasificado con el catálogo.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <th className="py-1.5 pr-3 font-medium">Tipo</th>
              <th className="py-1.5 pr-3 text-right font-medium">Monto (S/)</th>
              <th className="py-1.5 pr-3 text-right font-medium">% de egresos</th>
              <th className="py-1.5 font-medium">¿Entra al punto de equilibrio?</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {e.tipos.map((t) => (
              <tr key={t.tipo}>
                <td className="py-1.5 pr-3 font-medium text-gray-800">{t.tipo}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-900">{soles(t.monto)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">{pct(t.pct)}</td>
                <td className="py-1.5 text-xs text-gray-500">{ENTRA_AL_PE[t.tipo]}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5 pr-3 text-gray-900">Total egresos</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-gray-900">{soles(e.totalEgresos)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-gray-600">100.0%</td>
              <td className="py-1.5 text-xs font-normal">{e.control === 0 ? <span className="text-emerald-700">✓ cuadra con el total de egresos</span> : <span className="text-red-700">No cuadra: {soles(e.control)}</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Fijo + Variable (base del punto de equilibrio)</dt><dd className="tabular-nums text-gray-900">S/ {soles(e.fijoMasVariable)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Ingresos del mes</dt><dd className="tabular-nums text-gray-900">S/ {soles(e.ingresos)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Fijo como % de los ingresos</dt><dd className="tabular-nums text-gray-900">{pct(e.fijoPctIngresos)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-gray-500">Variable como % de los ingresos</dt><dd className="tabular-nums text-gray-900">{pct(e.variablePctIngresos)}</dd></div>
      </dl>

      <details className="group/cat mt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-primary [&::-webkit-details-marker]:hidden">Ver por categoría</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 pr-3 font-medium">Categoría</th><th className="py-1 pr-3 font-medium">Tipo</th>
                <th className="py-1 pr-3 text-right font-medium">Monto (S/)</th><th className="py-1 text-right font-medium">% de egresos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {e.categorias.map((c) => (
                <tr key={c.categoria}>
                  <td className="py-1 pr-3 text-gray-800">{c.categoria}</td><td className="py-1 pr-3 text-gray-500">{c.tipo}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-gray-900">{soles(c.monto)}</td><td className="py-1 text-right tabular-nums text-gray-500">{pct(c.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-primary [&::-webkit-details-marker]:hidden">Ver el puente hasta las seis cifras</summary>
        <p className="mt-1 text-[11px] text-gray-500">De lo que salió de la cuenta al costo real del mes: lo que otras sedes devolvieron, la parte de otras sedes en los compartidos, los impuestos aparte…</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Puente titulo="Fijo" destino="Costos fijos (seis cifras)" p={e.puente.fijo} />
          <Puente titulo="Variable" destino="Costos variables (seis cifras)" p={e.puente.variable} />
        </div>
      </details>
    </details>
  );
}

function Puente({ titulo, destino, p }: { titulo: string; destino: string; p: PuenteTipo }) {
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2 text-xs">
      <div className="flex justify-between gap-3 font-medium text-gray-800"><span>{titulo} (lo que salió)</span><span className="tabular-nums">{soles(p.desde)}</span></div>
      {p.lineas.map((l) => (
        <div key={l.etiqueta} className="mt-1">
          <div className="flex justify-between gap-3 text-gray-600"><span>{l.etiqueta}</span><span className="tabular-nums">{l.monto > 0 ? "+" : "−"}{soles(Math.abs(l.monto))}</span></div>
          {l.detalle && l.detalle.length > 0 && <ul className="pl-3 text-[11px] text-gray-400">{l.detalle.map((x) => <li key={x}>· {x}</li>)}</ul>}
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-3 border-t border-gray-100 pt-1 font-semibold text-gray-900"><span>= {destino}</span><span className="tabular-nums">{soles(p.hasta)}</span></div>
      {p.sinExplicar !== 0 && <p className="mt-1 text-red-700">Falta explicar {soles(p.sinExplicar)} contra las seis cifras ({soles(p.seisCifras)}).</p>}
    </div>
  );
}
