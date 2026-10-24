"use client";

/**
 * ¿Los números del mes son confiables? · el semáforo (24-oct-2026, tras la auditoría de setiembre).
 *
 * Va arriba de las seis cifras (Dashboard de Grupo) y de la cascada y la regla 33-33-33 (Reportes). Una línea con el
 * estado del grupo y de cada sede; al abrirla, los ocho controles de cada sede con qué hacer en cada uno
 * (lib/controles-fiabilidad.ts). Plegado por defecto: el estado se lee en la línea de arriba.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { getControlesDelMes, type ControlesDelMes } from "@/app/actions/controles-fiabilidad";
import { NOMBRE_ESTADO, type Control, type ControlesMes, type EstadoMes, type Semaforo } from "@/lib/controles-fiabilidad";

// Una sola consulta por mes aunque el semáforo aparezca en dos lugares de la misma pantalla.
const pedidos = new Map<string, Promise<ControlesDelMes | null>>();
function pedir(mes: string): Promise<ControlesDelMes | null> {
  if (!pedidos.has(mes)) {
    pedidos.set(mes, getControlesDelMes(mes).then((r) => (r.ok ? r.data : null)).catch(() => null));
    // Se vuelve a pedir en la próxima visita (puede haber un Excel nuevo).
    setTimeout(() => pedidos.delete(mes), 60_000);
  }
  return pedidos.get(mes)!;
}

export function SemaforoMes({ mes }: { mes: string }) {
  const [res, setRes] = useState<{ mes: string; data: ControlesDelMes | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    void pedir(mes).then((data) => { if (vivo) setRes({ mes, data }); });
    return () => { vivo = false; };
  }, [mes]);
  return <VistaSemaforoMes data={res?.mes === mes ? res.data : undefined} />;
}

const PUNTO: Record<Semaforo, string> = { verde: "bg-emerald-500", amarillo: "bg-amber-500", rojo: "bg-red-500" };
const TONO_ESTADO: Record<EstadoMes, { pildora: string; punto: Semaforo }> = {
  confiable: { pildora: "bg-emerald-50 text-emerald-900 ring-emerald-200", punto: "verde" },
  con_observaciones: { pildora: "bg-amber-50 text-amber-900 ring-amber-200", punto: "amarillo" },
  no_confiable: { pildora: "bg-red-50 text-red-800 ring-red-200", punto: "rojo" },
};
const ICONO: Record<EstadoMes, typeof ShieldCheck> = { confiable: ShieldCheck, con_observaciones: ShieldQuestion, no_confiable: ShieldAlert };

function Pildora({ nombre, estado }: { nombre: string; estado: EstadoMes }) {
  const t = TONO_ESTADO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${t.pildora}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[t.punto]}`} aria-hidden />
      {nombre && <span className="font-medium">{nombre}</span>}
      <span>{NOMBRE_ESTADO[estado]}</span>
    </span>
  );
}

function FilaControl({ c }: { c: Control }) {
  return (
    <li className="flex gap-2.5 py-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[c.estado]}`} aria-label={c.estado} />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-gray-900"><span className="font-semibold">{c.id} · {c.nombre}</span></div>
        <p className="text-xs leading-relaxed text-gray-600">{c.detalle}</p>
        {c.filas && c.filas.length > 0 && c.estado !== "verde" && (
          <ul className="mt-1 space-y-0.5 text-[11px] text-gray-500 tabular-nums">
            {c.filas.slice(0, 8).map((f) => <li key={f}>· {f}</li>)}
            {c.filas.length > 8 && <li>· y {c.filas.length - 8} más</li>}
          </ul>
        )}
        {c.queHacer && <p className="mt-1 text-xs font-medium text-gray-800">Qué hacer: {c.queHacer}</p>}
      </div>
    </li>
  );
}

function Sede({ s }: { s: ControlesMes }) {
  const orden: Record<Semaforo, number> = { rojo: 0, amarillo: 1, verde: 2 };
  const controles = [...s.controles].sort((a, b) => orden[a.estado] - orden[b.estado] || a.id.localeCompare(b.id));
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{s.sede}</h3>
        <Pildora nombre="" estado={s.estado} />
      </div>
      <ul className="divide-y divide-gray-50">{controles.map((c) => <FilaControl key={c.id} c={c} />)}</ul>
    </div>
  );
}

/** Solo dibuja (se puede ver sin base de datos). `undefined` = cargando; `null` = no se pudo revisar. */
export function VistaSemaforoMes({ data }: { data: ControlesDelMes | null | undefined }) {
  if (data === undefined) return <div className="h-12 rounded-2xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Revisando si los números del mes son confiables" />;
  if (data === null) return null;
  const Icono = ICONO[data.grupo.estado];
  const color = data.grupo.estado === "confiable" ? "text-emerald-600" : data.grupo.estado === "con_observaciones" ? "text-amber-600" : "text-red-600";
  return (
    <details className="group rounded-2xl border border-gray-200 bg-white px-4 py-3 sm:px-5" aria-label="¿Los números del mes son confiables?">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 [&::-webkit-details-marker]:hidden">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Icono className={`h-4 w-4 ${color}`} aria-hidden /> ¿Los números del mes son confiables?
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pildora nombre="Grupo" estado={data.grupo.estado} />
          {data.sedes.map((s) => <Pildora key={s.businessId} nombre={s.sede} estado={s.estado} />)}
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary">
          Ver los controles <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <p className="mt-2 text-xs text-gray-500">
        Confiable = los ocho controles en verde. Con observaciones = hay amarillos. No confiable = hay al menos uno en rojo: no cierres el mes ni tomes decisiones con esas cifras hasta corregirlo.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {data.sedes.map((s) => <Sede key={s.businessId} s={s} />)}
      </div>
      <div className="mt-3"><Sede s={data.grupo} /></div>
    </details>
  );
}
