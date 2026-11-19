"use client";

/**
 * «Descargar Excel» de Grupo → Recetas y costos (fase 3 de «la carta vive en el sistema», 18-nov-2026): la
 * carta, los insumos y los costos de Atelier tal como están en el sistema, con la forma del Excel de pricing.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { getDatosExcelCarta } from "@/app/actions/carta";

export function BotonExcelCarta() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setCargando(true);
    setError(null);
    try {
      const d = await getDatosExcelCarta();
      if (!d.ok) throw new Error(d.error);
      const { renderCartaXlsx } = await import("@/lib/carta-xlsx");
      const { blob, filename } = await renderCartaXlsx({ ...d, generado: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={() => void descargar()} disabled={cargando}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-white border border-primary/40 hover:bg-emerald-50 rounded-xl whitespace-nowrap disabled:opacity-50">
        {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar Excel
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}
