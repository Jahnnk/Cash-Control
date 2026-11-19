"use client";

/**
 * Acuerdos y tareas → Panel ejecutivo (19-nov-2026). Junta en una pestaña lo que mira el CEO: los indicadores
 * por mes (estilo Monday) y el resumen de la semana de la reunión (con PDF). Antes eran dos pestañas.
 */

import { useState } from "react";
import type { Acuerdo, Reunion } from "@/app/actions/acuerdos";
import { Segmentado } from "@/components/productos/ui";
import { IndicadoresAcuerdos } from "./indicadores";
import { ResumenSemanalVista } from "./resumen-semanal";

export function PanelEjecutivo({ acuerdos, reuniones, hoy, inicial = "semana" }: { acuerdos: Acuerdo[]; reuniones: Reunion[]; hoy: string; inicial?: "semana" | "mes" }) {
  const [vista, setVista] = useState<"semana" | "mes">(inicial);
  return (
    <div className="space-y-4">
      <Segmentado tamano="sm" valor={vista} onChange={setVista} opciones={[
        { valor: "semana", etiqueta: "Semana de la reunión" },
        { valor: "mes", etiqueta: "Indicadores por mes" },
      ]} />
      {vista === "semana" ? <ResumenSemanalVista acuerdos={acuerdos} reuniones={reuniones} hoy={hoy} /> : <IndicadoresAcuerdos />}
    </div>
  );
}
