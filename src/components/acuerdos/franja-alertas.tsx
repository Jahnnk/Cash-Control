"use client";

/**
 * Franja de alertas de acuerdos (19-nov-2026): lo que pide moverse YA (vencido, devuelto, vence hoy o mañana,
 * nuevo). Siempre visible cuando hay algo; sin nada, no aparece. Se usa en el Panel de Sede y en
 * Grupo → Acuerdos y tareas. Reglas: src/lib/acuerdos.ts → alertaDe.
 */

import { AlertTriangle, Bell } from "lucide-react";
import type { Acuerdo } from "@/app/actions/acuerdos";
import { ALERTA_LABEL, type Alerta } from "@/lib/acuerdos";
import { Pastilla } from "@/components/productos/ui";
import { fechaLarga } from "./acuerdo-item";

const TONO: Record<Alerta, "rojo" | "ambar" | "azul"> = { vencido: "rojo", devuelto: "rojo", hoy: "ambar", manana: "ambar", nuevo: "azul" };
const MAX = 5;

export function FranjaAlertas({ items, porConfirmar = 0, mostrarResponsable = false, onVer }: {
  items: { a: Acuerdo; alerta: Alerta }[];
  /** Para la dirección: cuántos esperan su confirmación. */
  porConfirmar?: number;
  mostrarResponsable?: boolean;
  onVer?: () => void;
}) {
  if (items.length === 0 && porConfirmar === 0) return null;
  const grave = items.some((x) => x.alerta === "vencido" || x.alerta === "devuelto");
  const soloNuevos = items.every((x) => x.alerta === "nuevo") && porConfirmar === 0;
  const caja = grave ? "border-red-200 bg-red-50/60" : soloNuevos ? "border-sky-200 bg-sky-50/60" : "border-amber-200 bg-amber-50/60";
  const Icono = soloNuevos ? Bell : AlertTriangle;
  const n = (a: Alerta) => items.filter((x) => x.alerta === a).length;
  const titulo = [
    n("vencido") && `${n("vencido")} ${n("vencido") === 1 ? "vencido" : "vencidos"}`,
    n("devuelto") && `${n("devuelto")} ${n("devuelto") === 1 ? "devuelto" : "devueltos"}`,
    n("hoy") && `${n("hoy")} ${n("hoy") === 1 ? "vence" : "vencen"} hoy`,
    n("manana") && `${n("manana")} ${n("manana") === 1 ? "vence" : "vencen"} mañana`,
    n("nuevo") && `${n("nuevo")} ${n("nuevo") === 1 ? "nuevo" : "nuevos"}`,
    porConfirmar && `${porConfirmar} ${porConfirmar === 1 ? "espera" : "esperan"} tu confirmación`,
  ].filter(Boolean).join(" · ");

  return (
    <section className={`rounded-2xl border px-4 py-3 sm:px-5 ${caja}`} aria-label="Alertas de acuerdos">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Icono className={`w-4 h-4 shrink-0 ${grave ? "text-red-700" : soloNuevos ? "text-sky-700" : "text-amber-700"}`} aria-hidden />
        <h2 className="text-sm font-semibold text-gray-900 flex-1 min-w-0">Acuerdos: {titulo}</h2>
        {onVer && <button type="button" onClick={onVer} className="text-xs font-medium text-primary whitespace-nowrap">Ver</button>}
      </div>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {items.slice(0, MAX).map(({ a, alerta }) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <Pastilla tono={TONO[alerta]}>{ALERTA_LABEL[alerta]}</Pastilla>
              <span className="font-medium text-gray-900">{a.que}</span>
              <span className="text-gray-500">{mostrarResponsable ? `${a.responsableNombre} · ` : ""}{fechaLarga(a.fechaLimite)}</span>
            </li>
          ))}
          {items.length > MAX && <li className="text-[11px] text-gray-500">y {items.length - MAX} más</li>}
        </ul>
      )}
    </section>
  );
}
