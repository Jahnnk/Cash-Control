"use client";

/**
 * «Tu semana» — el rastreador del administrador, estilo pedido de delivery
 * (pedido de Jahnn, 11-oct-2026): Highlight recibido → Registro diario →
 * Reportes de Byte → Semana cerrada, con la frase de qué sigue y el botón del
 * paso que toca. Reglas en lib/seguimiento.ts.
 *
 * Reemplaza arriba a las dos tarjetas de estado (registro del día y rutina
 * del sábado): esas siguen completas, plegadas debajo, para ver el detalle.
 */

import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getSeguimientoSede } from "@/app/actions/seguimiento";
import { SeguimientoTracker, useSeguimientoVivo } from "@/components/seguimiento/tracker";
import type { AccionPaso } from "@/lib/seguimiento";
import { EstadoKpisCard } from "./estado-kpis-card";
import { MiRutina } from "./mi-rutina";

export function TuSemana({
  refrescar,
  onRegistrar,
  onSubirReporte,
  esProduccion = false,
}: {
  refrescar: number;
  onRegistrar: (fecha: string) => void;
  onSubirReporte: () => void;
  esProduccion?: boolean;
}) {
  const leer = useCallback(() => getSeguimientoSede(), []);
  const { data, cargando } = useSeguimientoVivo(leer, refrescar);
  const [verDetalle, setVerDetalle] = useState(false);

  function alEvento(a: Extract<AccionPaso, { tipo: "evento" }>) {
    if (a.evento === "registrar") onRegistrar(a.fecha ?? "");
    else if (a.evento === "subir") onSubirReporte();
    else document.getElementById("highlight")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const detalle = (
    <div className="space-y-3">
      <EstadoKpisCard refrescar={refrescar} onRegistrar={onRegistrar} />
      <MiRutina esProduccion={esProduccion} refrescar={refrescar} onSubirReporte={onSubirReporte} />
    </div>
  );

  // Sin acceso o si algo falla, quedan las tarjetas de siempre: nunca menos información.
  if (data && !data.ok) return detalle;
  if (!data) return <div className="h-44 rounded-2xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Cargando tu semana" />;

  return (
    <div className="space-y-2">
      <SeguimientoTracker seguimiento={data.seguimiento} subtitulo={data.semana} actualizado={data.actualizado} cargando={cargando} onEvento={alEvento} />
      <button type="button" onClick={() => setVerDetalle((v) => !v)}
        className="flex w-full items-center justify-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800">
        {verDetalle ? "Ocultar el detalle" : "Ver el detalle: días registrados y qué subir el sábado"}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verDetalle ? "rotate-180" : ""}`} />
      </button>
      {verDetalle && detalle}
    </div>
  );
}
