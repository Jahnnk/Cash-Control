"use client";

import { CalendarCheck2 } from "lucide-react";
import type { KellyLoadStatus } from "@/app/actions/grupo";

/**
 * Semáforo de cargas del Excel de Kelly (transición ago-2026: ella lleva
 * las finanzas de las 3 sedes, sube los viernes; Jahnn solo verifica).
 * Regla auditable y visible: verde ≤7 días, ámbar 8-14, rojo >14 o nunca.
 */

const LEVEL_META: Record<KellyLoadStatus["level"], { dot: string; label: string; cls: string }> = {
  verde: { dot: "bg-emerald-500", label: "al día", cls: "text-emerald-700" },
  ambar: { dot: "bg-amber-500", label: "atrasada", cls: "text-amber-700" },
  rojo: { dot: "bg-red-500", label: "sin carga esta quincena", cls: "text-red-700" },
};

function ddmm(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}

export function KellyLoadCard({ items }: { items: KellyLoadStatus[] }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarCheck2 className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold text-gray-900">Cargas de Excel por sede</h2>
        <span className="text-[11px] text-gray-400">acuerdo: todos los viernes</span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {items.map((it) => {
          const meta = LEVEL_META[it.level];
          return (
            <div key={it.businessId} className="border border-gray-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${meta.dot}`} />
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-900">{it.name.replace("Yayi's ", "")}</div>
                {it.lastImportAt === null ? (
                  <div className="text-[11px] text-red-700">Nunca se ha cargado Excel en esta sede.</div>
                ) : (
                  <div className={`text-[11px] ${meta.cls}`}>
                    Última carga {ddmm(it.lastImportAt)} ({it.daysSinceImport === 0 ? "hoy" : `hace ${it.daysSinceImport} día${it.daysSinceImport === 1 ? "" : "s"}`}) — {meta.label}
                    <span className="block text-gray-400">datos hasta el {ddmm(it.coversThrough)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
