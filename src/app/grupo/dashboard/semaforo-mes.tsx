"use client";

/**
 * ¿Los números del mes son confiables? · el semáforo (24-oct-2026, tras la auditoría de setiembre).
 *
 * Va arriba de las seis cifras (Dashboard de Grupo) y de la cascada y la regla 33-33-33 (Reportes). Los ocho controles
 * son los de lib/controles-fiabilidad.ts; aquí solo se decide cómo se muestran y a quién (lib/controles-vista.ts):
 *   · CEO (Jahnn y la llave de solo lectura): UNA línea, cerrada. Al abrirla, solo los rojos: Sede · Qué pasa · S/ ·
 *     Quién lo resuelve, con el detalle completo a un toque. Sin tareas: no le tocan.
 *   · Kelly: el checklist del mes por sede, con el qué hacer de cada control (rojos primero, luego amarillos).
 */

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getControlesDelMes, type ControlesDelMes } from "@/app/actions/controles-fiabilidad";
import type { Semaforo } from "@/lib/controles-fiabilidad";
import { checklistKelly, resumenCeo, solesConDecimales, solesSinDecimales, type FilaCeo } from "@/lib/controles-vista";

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

/** Solo dibuja (se puede ver sin base de datos). `undefined` = cargando; `null` = no se pudo revisar. */
export function VistaSemaforoMes({ data }: { data: ControlesDelMes | null | undefined }) {
  if (data === undefined) return <div className="h-9 rounded-xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Revisando si los números del mes son confiables" />;
  if (data === null) return null;
  return data.vista === "kelly" ? <ChecklistKelly data={data} /> : <LineaCeo data={data} />;
}

const PUNTO: Record<Semaforo, string> = { verde: "bg-emerald-500", amarillo: "bg-amber-500", rojo: "bg-red-500" };

// ─────────────────────────── Vista del CEO ───────────────────────────
export function LineaCeo({ data }: { data: ControlesDelMes }) {
  const r = resumenCeo(data);
  if (r.estado === "confiable") {
    return <p className="text-xs font-medium text-emerald-700" aria-label="Números del mes confiables">{r.texto}</p>;
  }
  const linea = (
    <>
      {/* El punto va pegado al texto: en el celular no queda solo en su línea. */}
      <span className="inline-flex items-start gap-1.5">
        <span className={`mt-[4px] h-2 w-2 shrink-0 rounded-full ${PUNTO[r.estado === "no_confiable" ? "rojo" : "amarillo"]}`} aria-hidden />
        <span className="font-medium text-gray-900">{r.texto}</span>
      </span>
      {r.observaciones && <span className="text-gray-400">{r.observaciones}</span>}
      <span className="flex items-center gap-2.5 sm:ml-2">
        {r.puntos.map((p) => (
          <span key={p.sede} className="inline-flex items-center gap-1 text-gray-500">
            {p.sede} <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[p.color]}`} aria-label={p.color} />
          </span>
        ))}
      </span>
    </>
  );
  // Sin rojos no hay nada que abrir: los amarillos solo se cuentan.
  if (r.filas.length === 0) {
    return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs">{linea}</div>;
  }
  return (
    <details className="group rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs" aria-label="¿Los números del mes son confiables?">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
        {linea}
        <ChevronDown className="ml-auto h-3.5 w-3.5 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-1 pr-3 font-medium">Sede</th>
              <th className="py-1 pr-3 font-medium">Qué pasa</th>
              <th className="py-1 pr-3 text-right font-medium">S/</th>
              <th className="py-1 font-medium leading-tight">Quién lo resuelve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{r.filas.map((f) => <FilaRoja key={f.clave} f={f} />)}</tbody>
        </table>
      </div>
    </details>
  );
}

function FilaRoja({ f }: { f: FilaCeo }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <tr className="align-baseline">
        <td className="py-1.5 pr-3 font-medium text-gray-800">{f.sede}</td>
        <td className="py-1.5 pr-3 text-gray-700">
          {f.quePasa}{" "}
          <button type="button" onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} className="text-[10px] text-primary hover:underline">detalle</button>
        </td>
        <td className="py-1.5 pr-3 text-right tabular-nums text-gray-800">{f.monto === null ? "—" : solesSinDecimales(f.monto)}</td>
        <td className={`py-1.5 ${f.quien === "Sistema" ? "text-gray-500 italic" : "text-gray-700"}`}>{f.quien}</td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={4} className="pb-2 pt-0 text-[11px] leading-relaxed text-gray-500">
            {f.detalle}
            {f.filas.length > 0 && <ul className="mt-0.5 tabular-nums">{f.filas.slice(0, 8).map((x) => <li key={x}>· {x}</li>)}</ul>}
          </td>
        </tr>
      )}
    </>
  );
}

// ─────────────────────────── Vista de Kelly ───────────────────────────
export function ChecklistKelly({ data }: { data: ControlesDelMes }) {
  const c = checklistKelly(data);
  if (c.pendientes === 0 && c.sistema.length === 0) {
    return <p className="text-xs font-medium text-emerald-700">✓ Checklist de {c.mes}: nada pendiente, los números están confiables.</p>;
  }
  return (
    <details className="group rounded-xl border border-gray-200 bg-white px-4 py-2.5" aria-label="Checklist del mes">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-sm [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-gray-900">Checklist de {c.mes}</span>
        <span className="text-gray-500">· {c.pendientes} pendiente{c.pendientes === 1 ? "" : "s"}</span>
        <ChevronDown className="ml-auto h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <p className="mt-1.5 text-[11px] text-gray-500">Cada punto se marca solo cuando el control pasa a verde (al corregir y volver a subir el Excel). Primero los rojos.</p>
      <div className="mt-2 grid gap-3 lg:grid-cols-3">
        {c.sedes.filter((s) => s.tareas.length > 0).map((s) => (
          <section key={s.sede} className="rounded-lg border border-gray-100 px-3 py-2" aria-label={`Checklist de ${s.sede}`}>
            <h3 className="text-sm font-semibold text-gray-900">{s.sede}</h3>
            <ul className="mt-1 space-y-2">
              {s.tareas.map((t) => (
                <li key={t.clave} className="flex gap-2">
                  <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-2 ${t.estado === "rojo" ? "border-red-500" : "border-amber-500"}`} aria-label={t.estado === "rojo" ? "pendiente, en rojo" : "pendiente, en amarillo"} />
                  <div className="min-w-0 text-xs">
                    <div className="font-semibold text-gray-900">{t.quePasa}{t.monto !== null && t.monto > 0 && <span className="font-normal tabular-nums text-gray-500"> · S/{solesConDecimales(t.monto)}</span>}</div>
                    <p className="text-gray-700">{t.queHacer}</p>
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-[10px] text-primary">detalle</summary>
                      <p className="text-[11px] leading-relaxed text-gray-500">{t.detalle}</p>
                      {t.filas.length > 0 && <ul className="text-[11px] tabular-nums text-gray-500">{t.filas.slice(0, 8).map((x) => <li key={x}>· {x}</li>)}</ul>}
                    </details>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {c.sistema.length > 0 && (
        <p className="mt-2 text-[11px] text-gray-500">Error de cálculo de la app ({c.sistema.map((x) => x.sede).join(", ")}): no es tarea tuya, lo corrige el sistema.</p>
      )}
    </details>
  );
}
