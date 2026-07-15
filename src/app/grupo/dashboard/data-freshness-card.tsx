"use client";

import { CalendarClock } from "lucide-react";
import { formatDateShort } from "@/lib/utils";
import type { DataFreshness } from "@/app/actions/grupo";

/**
 * ¿Hasta qué fecha hay información por sede? (pedido de Jahnn)
 * Kelly registra Fonavi/Centro en su Excel y a veces entrega con
 * atraso — esta tarjeta le dice a Jahnn exactamente qué rango pedirle
 * para tener las 3 sedes al día. Semáforo: verde ≤2 días · ámbar ≤7 ·
 * rojo >7. Atelier lo registra Jahnn mismo.
 */
export function DataFreshnessCard({ items }: { items: DataFreshness[] }) {
  function nextDay(date: string): string {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
        <CalendarClock className="w-3.5 h-3.5" />
        ¿Hasta cuándo hay datos? · lo que falta pedir
      </h2>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {items.map((it) => {
          const d = it.daysBehind;
          const color = d === null ? "gris" : d <= 2 ? "verde" : d <= 7 ? "ambar" : "rojo";
          const dotCls = { verde: "bg-emerald-500", ambar: "bg-amber-400", rojo: "bg-red-500", gris: "bg-gray-300" }[color];
          const esDeKelly = it.businessId === 2 || it.businessId === 3;
          return (
            <div key={it.businessId} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{it.name}</span>
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotCls}`} />
              </div>
              {it.lastDate === null ? (
                <div className="text-xs text-gray-400 mt-1">Sin registros aún.</div>
              ) : (
                <>
                  <div className="text-sm text-gray-700 mt-1">
                    Datos hasta el <strong>{formatDateShort(it.lastDate)}</strong>
                    <span className={`ml-1.5 text-xs ${d !== null && d > 7 ? "text-red-600 font-semibold" : d !== null && d > 2 ? "text-amber-600" : "text-gray-400"}`}>
                      {d === 0 ? "(hoy — al día ✓)" : d === 1 ? "(ayer)" : `(hace ${d} días)`}
                    </span>
                  </div>
                  {d !== null && d > 2 && (
                    <div className="text-[11px] mt-1.5 rounded-lg px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-800">
                      {esDeKelly
                        ? <>📋 Pídele a Kelly del <strong>{formatDateShort(nextDay(it.lastDate))}</strong> a hoy.</>
                        : <>📋 Te falta registrar del <strong>{formatDateShort(nextDay(it.lastDate))}</strong> a hoy.</>}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
