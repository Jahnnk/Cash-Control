"use client";

/** Presupuesto en dos pestañas (13-nov-2026): el plan del mes y las palancas del EBITDA, de donde nace el plan. */

import { useState, type ReactNode } from "react";
import { Segmentado } from "@/components/productos/ui";
import { Palancas } from "./palancas";

export function PresupuestoPestanas({ plan }: { plan: ReactNode }) {
  const [vista, setVista] = useState<"plan" | "palancas">("plan");
  // Al guardar un borrador desde las palancas, el plan se vuelve a montar para leerlo de nuevo.
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-5">
      <Segmentado opciones={[{ valor: "plan", etiqueta: "Plan del mes" }, { valor: "palancas", etiqueta: "Palancas del EBITDA" }]} valor={vista} onChange={setVista} />
      {/* El plan se oculta sin desmontarse: no pierde lo que estés editando. */}
      <div key={version} className={vista === "plan" ? "space-y-5" : "hidden"}>{plan}</div>
      {vista === "palancas" && <Palancas onGuardado={() => setVersion((v) => v + 1)} />}
    </div>
  );
}
