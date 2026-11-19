"use client";

/**
 * «Ver como administrador» (Jahnn, 19-nov-2026): la dirección ve el Panel de Sede tal cual lo ve el administrador
 * de esa sede, para saber exactamente qué le aparece. Con el interruptor activo:
 *   · se esconde lo que es solo de dirección (Liquidación, Base, KPIs completos, subir/borrar en el Highlight,
 *     marcar días que no cuentan);
 *   · «Mis acuerdos y tareas» muestra las tareas del administrador de la sede, no las de la dirección.
 * Es solo una VISTA: los permisos reales no cambian, y lo que se cambie se guarda a nombre de quien entró.
 * El menú de la izquierda sigue siendo el de la dirección. Se recuerda por pestaña (sessionStorage).
 */

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { puedeVerComoAdmin } from "@/app/actions/panel-vista";

const CLAVE = "yayis_panel_como_admin";
const SEDE_NOMBRE: Record<string, string> = { atelier: "Atelier", fonavi: "Fonavi", centro: "Centro" };

export function useComoAdmin() {
  const [puede, setPuede] = useState(false);
  const [activo, setActivo] = useState(false);
  useEffect(() => {
    void puedeVerComoAdmin().then((p) => {
      setPuede(p);
      if (!p) return;
      try { setActivo(sessionStorage.getItem(CLAVE) === "1"); } catch { /* sin almacenamiento: empieza apagado */ }
    }).catch(() => setPuede(false));
  }, []);
  function cambiar(v: boolean) {
    setActivo(v);
    try { if (v) sessionStorage.setItem(CLAVE, "1"); else sessionStorage.removeItem(CLAVE); } catch { /* nada */ }
  }
  return { puede, activo: puede && activo, cambiar };
}

/** El botón (apagado) o la franja de aviso con «Volver a mi vista» (encendido). Sin permiso, no aparece. */
export function BarraComoAdmin({ puede, activo, negocio, onChange }: {
  puede: boolean; activo: boolean; negocio: string; onChange: (v: boolean) => void;
}) {
  if (!puede) return null;
  const sede = SEDE_NOMBRE[negocio] ?? negocio;
  if (!activo) {
    return (
      <button type="button" onClick={() => onChange(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
        title={`Ver el panel tal como lo ve el administrador de ${sede}`}>
        <Eye className="w-3.5 h-3.5" />Ver como administrador
      </button>
    );
  }
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5">
      <Eye className="w-4 h-4 text-violet-700 shrink-0" aria-hidden />
      <p className="text-sm text-violet-900 flex-1 min-w-0">
        Estás viendo el panel <strong>como lo ve el administrador de {sede}</strong>. Lo que cambies se guarda de verdad.
      </p>
      <button type="button" onClick={() => onChange(false)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-800 border border-violet-300 bg-white hover:bg-violet-100 rounded-lg whitespace-nowrap">
        <EyeOff className="w-3.5 h-3.5" />Volver a mi vista
      </button>
    </div>
  );
}
