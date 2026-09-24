"use client";

/**
 * Plan de acción de «Revisar en una sede» y su resultado (lo usan la tarjeta
 * de Grupo → Productos y el panel del administrador, que solo lo lee).
 */

import { Barra, fechaCorta } from "@/components/productos/ui";
import type { AccionPlan, PlanConResultado } from "@/lib/productos/candidatos";

export const ACCION_TEXTO: Record<AccionPlan, string> = {
  precio: "Ajustar el precio",
  vitrina: "Mejorar la vitrina / exhibición",
  ofrecer: "Ofrecerlo en caja y en mesa",
  calidad: "Revisar la calidad / presentación",
  otra: "Otra acción",
};

const soles = (n: number) => `S/${n.toFixed(2)}`;

export function EstadoPlan({ p }: { p: PlanConResultado }) {
  const titulo = p.accion === "otra" ? p.detalle ?? ACCION_TEXTO.otra : ACCION_TEXTO[p.accion];
  const diasTotales = 28;
  const transcurridos = p.diasTranscurridos;
  const tono = p.cambioPct === null ? "text-gray-600" : p.cambioPct >= 15 ? "text-emerald-700" : p.cambioPct <= -15 ? "text-red-700" : "text-gray-700";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-gray-800"><b>Plan en {p.sede}:</b> {titulo}{p.accion !== "otra" && p.detalle ? ` — ${p.detalle}` : ""}</span>
        <span className="text-gray-500 whitespace-nowrap">desde el {fechaCorta(p.inicio)}</span>
      </div>
      {!p.listo && <Barra pct={(Math.min(diasTotales, transcurridos) / diasTotales) * 100} alto="h-1" />}
      <div className={tono}>
        {p.ventaDiaDespues === null
          ? <>Midiendo: el resultado sale de las cargas del sábado desde el inicio{p.listo ? "; todavía no hay ninguna." : `, listo el ${fechaCorta(p.resultadoEl)}.`}</>
          : <>
            {p.ventaDiaAntes !== null ? <>Antes {soles(p.ventaDiaAntes)} al día → </> : null}
            ahora {soles(p.ventaDiaDespues)} al día ({p.diasMedidos} días medidos)
            {p.cambioPct !== null && <b> · {p.cambioPct > 0 ? "+" : ""}{p.cambioPct}%</b>}
            {p.listo
              ? p.cambioPct === null ? "" : p.cambioPct >= 15 ? " — funcionó." : p.cambioPct <= -15 ? " — empeoró: pásalo a preparar reemplazo." : " — no cambió: prueba otra acción o prepara el reemplazo."
              : ` · resultado final el ${fechaCorta(p.resultadoEl)}`}
          </>}
      </div>
    </div>
  );
}
