"use client";

/**
 * «Descargar para Kelly»: arma el Excel con lo que Jahnn ve al importar (verificación + cosas por definir)
 * escrito para quien lleva el Excel. Lee los datos al hacer clic, así siempre sale lo último.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { getPorDefinir } from "@/app/actions/por-definir";
import { getVerificacionKelly } from "@/app/actions/verificacion-kelly";
import { mesDeRevision } from "@/lib/revision-clasificacion";

export function BotonRevisionKelly({ className }: { className?: string }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setCargando(true);
    setError(null);
    try {
      const [bandeja, ver] = await Promise.all([getPorDefinir(), getVerificacionKelly()]);
      if (!bandeja.ok) throw new Error(bandeja.error);
      if (!ver.ok) throw new Error(ver.error);
      // Solo el último mes con Excel cargado (el que se acaba de importar).
      const ultimo = ver.items.reduce((m, v) => (v.month > m ? v.month : m), "");
      const { renderRevisionKellyXlsx } = await import("@/lib/revision-kelly-xlsx");
      const { blob, filename } = await renderRevisionKellyXlsx({
        // Solo lo del mes del Excel (los meses anteriores ya se definieron); lo que no tiene mes claro va igual.
        pendientes: bandeja.data.pendientes.filter((i) => { const m = mesDeRevision(i.datos); return !m || !ultimo || m === ultimo; }),
        paraKelly: bandeja.data.paraKelly,
        verificaciones: ver.items.filter((v) => v.month === ultimo),
        generado: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      });
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
    <span className={className}>
      <button type="button" onClick={descargar} disabled={cargando}
        className="inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-emerald-50 disabled:opacity-60">
        {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Descargar para Kelly (Excel)
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
