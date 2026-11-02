/**
 * Reportes · la línea «Datos · …» (1-nov-2026): lo esencial del estado de los datos en pocas palabras, sin pantalla.
 * Junta hasta cuándo llega el Excel (frescura) con lo que falta subir a los administradores (listo para la reunión).
 */

import { fechaLarga, type FrescuraGrupo } from "./frescura-datos";
import type { ListoReunion } from "./kpis/listo-reunion";

export type Gravedad = "ok" | "ojo" | "mal";
const PEOR: Record<Gravedad, number> = { ok: 0, ojo: 1, mal: 2 };

function gravedadExcel(f: FrescuraGrupo | null): Gravedad {
  if (!f) return "ok";
  return f.estado === "al_dia" ? "ok" : f.estado === "atrasado" ? "ojo" : "mal";
}
function gravedadAdmins(d: ListoReunion | null | undefined): Gravedad {
  if (!d) return "ok";
  return d.listo ? "ok" : d.faltas > 0 ? "mal" : "ojo";
}

/** Lo esencial en pocas palabras: «Excel hasta el 13 de octubre · 5 datos de administradores por completar». */
export function resumenEstadoDatos(f: FrescuraGrupo | null, d: ListoReunion | null | undefined): { texto: string; gravedad: Gravedad } {
  const partes: string[] = [];
  if (f) partes.push(f.estado === "al_dia" ? "Excel al día" : f.hasta ? `Excel hasta el ${fechaLarga(f.hasta)}` : "Sin Excel");
  if (d) {
    if (d.listo) partes.push("administradores al día");
    else if (d.faltas > 0) partes.push(`${d.faltas} ${d.faltas === 1 ? "dato" : "datos"} de administradores por completar`);
    else partes.push(`${d.avisos} ${d.avisos === 1 ? "aviso" : "avisos"} de administradores por revisar`);
  }
  const gravedad = PEOR[gravedadExcel(f)] >= PEOR[gravedadAdmins(d)] ? gravedadExcel(f) : gravedadAdmins(d);
  return { texto: partes.length ? partes.join(" · ") : "Sin información de los datos", gravedad };
}
