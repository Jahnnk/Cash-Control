"use client";

/**
 * Préstamos entre sedes bajo «Movimiento de dinero» (pedido de Jahnn, 9-nov-2026). Fonavi y Centro le prestaron a
 * Atelier en agosto, sin intereses, en 5 cuotas. Es informativo: plata que cambia de bolsillo dentro del grupo, ni venta
 * ni gasto. Muestra lo devuelto y lo que falta (lib/prestamos-entre-sedes.ts).
 */

import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { getPrestamosEntreSedes } from "@/app/actions/prestamos-entre-sedes";
import type { PrestamoEntreSedes } from "@/lib/prestamos-entre-sedes";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });

/** `sede`: la elegida en el Dashboard (null = Grupo). Atelier y Grupo ven todos; Fonavi y Centro, el suyo. */
export function PrestamosEntreSedes({ sede }: { sede: number | null }) {
  const [lista, setLista] = useState<PrestamoEntreSedes[] | null>(null);
  useEffect(() => { void getPrestamosEntreSedes().then((r) => setLista(r.ok ? r.prestamos : [])); }, []);
  if (!lista) return null;
  const ver = lista.filter((p) => !p.saldado && (sede === null || sede === 1 || p.prestamistaId === sede));
  if (ver.length === 0) return null;
  const falta = ver.reduce((t, p) => t + p.pendiente, 0);
  return (
    <div className="mt-3 rounded-2xl bg-violet-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-gray-600"><ArrowLeftRight className="h-4 w-4 text-violet-600" aria-hidden />Préstamos entre sedes · falta devolver</div>
        {ver.length > 1 && <b className="text-xl font-semibold tabular-nums text-gray-900">{soles(falta)}</b>}
      </div>
      <ul className="mt-1 divide-y divide-violet-100">
        {ver.map((p) => (
          <li key={`${p.prestamistaId}-${p.fecha}`} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-700">{p.prestamista} → {p.deudor}</span>
              <b className="text-lg font-semibold tabular-nums text-gray-900">{soles(p.pendiente)}</b>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              Prestó {soles(p.prestado)} el {fecha(p.fecha)}, sin intereses · devuelto {soles(p.devuelto)}
              {p.cuotasTotal !== null && <> ({p.cuotasPagadas} de {p.cuotasTotal} cuotas de {soles(p.cuota ?? 0)})</>}
              {p.proxima && <> · próxima cuota: {fecha(p.proxima)}</>}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-gray-500">Esta plata cambia de bolsillo dentro del grupo: no es venta, ni gasto, ni ahorro nuevo.</p>
    </div>
  );
}
