"use client";

/**
 * Panel ejecutivo → «Carga del equipo» y «Avance por estado» (referencia: informes de Jira, 19-nov-2026).
 *   · Carga: quién tiene cuánto del trabajo abierto (barra con su color, % y cantidad; vencidos en rojo).
 *   · Avance: dona con el % cumplido al centro y cuántos hay en cada estado.
 * Cálculos en src/lib/acuerdos.ts (cargaEquipo, avancePorEstado).
 */

import type { Acuerdo } from "@/app/actions/acuerdos";
import { avancePorEstado, cargaEquipo, ESTADO_LABEL, ESTADOS_AVANCE } from "@/lib/acuerdos";
import { Avatar, colorPersona } from "@/components/acuerdos/ui";

const COLOR_ESTADO: Record<(typeof ESTADOS_AVANCE)[number], string> = {
  cumplido: "#059669", por_confirmar: "#F59E0B", en_proceso: "#3B82F6", vencido: "#DC2626", pendiente: "#D1D5DB",
};
const DIAS = 30;

export function InformesEquipo({ acuerdos, hoy }: { acuerdos: Acuerdo[]; hoy: string }) {
  const carga = cargaEquipo(acuerdos, hoy);
  const av = avancePorEstado(acuerdos, hoy, DIAS);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold text-gray-900">Carga del equipo</h2>
        <p className="text-xs text-gray-500">Cuánto del trabajo abierto tiene cada persona.</p>
        {carga.length === 0 ? <p className="text-sm text-gray-500 py-4">No hay tareas abiertas.</p> : (
          <>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_40px_48px] gap-x-3 text-[10px] uppercase tracking-wide text-gray-400">
              <span>Responsable</span><span>Reparto</span><span className="text-right">%</span><span className="text-right">Tareas</span>
            </div>
            <ul className="mt-1">
              {carga.map((p) => (
                <li key={p.clave} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_40px_48px] items-center gap-x-3 py-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <Avatar nombre={p.nombre} clave={p.clave} tam="md" />
                    <span className="text-sm text-gray-900 truncate">{p.nombre}</span>
                  </span>
                  <span className="h-3 rounded-full bg-gray-100 overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${p.pct}%`, backgroundColor: colorPersona(p.clave) }} />
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-gray-900">{p.pct}%</span>
                  <span className="text-right tabular-nums">
                    <span className="text-sm font-semibold text-primary">{p.abiertos}</span>
                    {p.vencidos > 0 && <span className="block text-[10px] text-red-700">{p.vencidos} venc.</span>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-gray-900">Avance por estado</h2>
          <span className="text-[11px] text-gray-500">Abiertos y últimos {DIAS} días</span>
        </div>
        {av.total === 0 ? <p className="text-sm text-gray-500 py-4">Todavía no hay tareas.</p> : (
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <Dona av={av} />
            <ul className="flex-1 min-w-[160px] space-y-1.5 text-sm">
              {ESTADOS_AVANCE.map((e) => (
                <li key={e} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COLOR_ESTADO[e] }} />
                  <span className="text-gray-700 flex-1">{ESTADO_LABEL[e]}</span>
                  <span className="font-semibold tabular-nums text-primary">{av.conteo[e]}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 pt-1 border-t border-gray-100 font-semibold text-gray-900">
                <span className="flex-1 pl-5">Total</span><span className="tabular-nums">{av.total}</span>
              </li>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/** Dona en SVG: un arco por estado y el % cumplido al centro. */
function Dona({ av }: { av: ReturnType<typeof avancePorEstado> }) {
  const r = 52, c = 2 * Math.PI * r;
  // Cada arco empieza donde terminó el anterior.
  const arcos = ESTADOS_AVANCE.filter((e) => av.conteo[e] > 0).reduce<{ e: (typeof ESTADOS_AVANCE)[number]; largo: number; desde: number }[]>((l, e) => {
    const desde = l.length ? l[l.length - 1].desde + l[l.length - 1].largo : 0;
    return [...l, { e, largo: (av.conteo[e] / av.total) * c, desde }];
  }, []);
  return (
    <svg viewBox="0 0 140 140" className="w-36 h-36 shrink-0" role="img" aria-label={`${av.pctCumplido}% cumplido`}>
      <g transform="rotate(-90 70 70)">
        {arcos.map(({ e, largo, desde }) => (
          <circle key={e} cx="70" cy="70" r={r} fill="none" stroke={COLOR_ESTADO[e]} strokeWidth="22"
            strokeDasharray={`${largo} ${c - largo}`} strokeDashoffset={-desde} />
        ))}
      </g>
      <text x="70" y="70" textAnchor="middle" className="fill-primary" style={{ fontSize: 24, fontWeight: 600 }}>{av.pctCumplido}%</text>
      <text x="70" y="88" textAnchor="middle" className="fill-gray-500" style={{ fontSize: 11 }}>cumplido</text>
    </svg>
  );
}
