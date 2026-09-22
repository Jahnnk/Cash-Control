"use client";

/**
 * "Qué se vendió este mes" en el panel de sede (pedido de Jahnn, 21-sep-2026):
 * el administrador ve los mismos tres cuadros que el informe de ventas —
 * panorama por familia, top 10 por ingresos y ranking de postres — con el
 * reporte de Byte que él mismo sube los sábados.
 */

import { useEffect, useState } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import { getPanoramaProductos, type PanoramaDeSede } from "@/app/actions/productos-panorama";
import { PanoramaProductosVista } from "@/components/panorama-productos";

export function ProductosCard({ month }: { month: string }) {
  const [data, setData] = useState<PanoramaDeSede | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    /* eslint-disable react-hooks/set-state-in-effect -- se recarga al cambiar de mes */
    setCargando(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    getPanoramaProductos(month)
      .then((r) => { if (vivo) setData(r.ok ? r.data : null); })
      .catch(() => { if (vivo) setData(null); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [month]);

  if (cargando) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!data?.panorama) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-base font-bold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-primary" /> Qué se vendió este mes
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Todavía no hay reporte de productos de este mes. Sube el reporte «Platos con mayor rotación» de Byte desde Productos.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <PanoramaProductosVista p={data.panorama} cargadoEl={data.cargadoEl} />
    </div>
  );
}
