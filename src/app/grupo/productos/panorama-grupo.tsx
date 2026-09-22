"use client";

/**
 * "Qué se vendió este mes" en Grupo: las tres sedes, con las mismas vistas que
 * ve cada administrador en su panel (pedido de Jahnn, 21-sep-2026).
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPanoramaProductosGrupo, type PanoramaDeSede } from "@/app/actions/productos-panorama";
import { PanoramaProductosVista } from "@/components/panorama-productos";
import { formatCurrency, monthLabel } from "@/lib/utils";

export function PanoramaProductosGrupo({ month }: { month: string }) {
  const [sedes, setSedes] = useState<PanoramaDeSede[] | null>(null);
  const [activa, setActiva] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    /* eslint-disable react-hooks/set-state-in-effect -- se recarga al cambiar de mes */
    setCargando(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    getPanoramaProductosGrupo(month)
      .then((r) => {
        if (!vivo) return;
        setSedes(r.ok ? r.sedes : null);
        if (r.ok) setActiva(r.sedes.find((s) => s.panorama)?.businessId ?? null);
      })
      .catch(() => { if (vivo) setSedes(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [month]);

  if (cargando) {
    return <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (!sedes || sedes.every((s) => !s.panorama)) return null;
  const sel = sedes.find((s) => s.businessId === activa) ?? sedes.find((s) => s.panorama)!;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">Rotación de productos · {monthLabel(month)}</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {sedes.map((s) => (
            <button key={s.businessId} type="button" onClick={() => setActiva(s.businessId)} disabled={!s.panorama}
              className={`px-3 py-1.5 rounded-lg border ${s.businessId === sel.businessId ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-gray-300"} disabled:opacity-40`}>
              {s.sede}
              {s.panorama ? <span className="ml-1.5 opacity-70">{formatCurrency(s.panorama.ventas)}</span> : <span className="ml-1.5 opacity-70">sin reporte</span>}
            </button>
          ))}
        </div>
      </div>
      {sel.panorama && <PanoramaProductosVista p={sel.panorama} titulo={`Qué se vendió este mes · ${sel.sede}`} cargadoEl={sel.cargadoEl} />}
    </div>
  );
}
