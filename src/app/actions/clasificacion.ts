"use server";

/**
 * El sello de confiabilidad de la clasificación de egresos · solo dirección.
 * Qué es cada nivel: src/lib/clasificador-gasto.ts.
 */

import { getSessionRole } from "@/lib/session-access";
import { activeBusinessId } from "@/lib/active-business";
import { calidadClasificacionSede, MESES_REVISADOS } from "@/lib/revision-clasificacion-sql";
import { porcentajeSeguro, type CalidadClasificacion } from "@/lib/clasificador-gasto";

export type SelloClasificacion = {
  businessId: number;
  sede: string;
  /** Periodo medido (fechas). */
  desde: string;
  hasta: string;
  calidad: CalidadClasificacion;
  /** % del gasto que no está en duda (alta + media). */
  pctSeguro: number | null;
};

const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];

function finDeMes(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function inicioVentana(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - MESES_REVISADOS, 1)).toISOString().slice(0, 10);
}

async function sello(bId: number, sede: string, desde: string, hasta: string): Promise<SelloClasificacion> {
  const calidad = await calidadClasificacionSede(bId, desde, hasta);
  return { businessId: bId, sede, desde, hasta, calidad, pctSeguro: porcentajeSeguro(calidad) };
}

/**
 * Por sede, en la ventana que usa el punto de equilibrio (los meses de
 * referencia más el mes elegido).
 */
export async function getSellosClasificacionGrupo(month: string): Promise<{ ok: true; sellos: SelloClasificacion[] } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const sellos = await Promise.all(SEDES.map(([id, n]) => sello(id, n, inicioVentana(month), finDeMes(month))));
    return { ok: true, sellos };
  } catch (e) {
    console.error("[getSellosClasificacionGrupo] failed:", e);
    return { ok: false, error: "No se pudo medir la clasificación." };
  }
}

/** La sede activa, solo el mes elegido (reporte de gastos por categoría). */
export async function getSelloClasificacionMes(month: string): Promise<{ ok: true; sello: SelloClasificacion } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const bId = await activeBusinessId();
    const nombre = SEDES.find(([id]) => id === bId)?.[1] ?? "Sede";
    return { ok: true, sello: await sello(bId, nombre, `${month}-01`, finDeMes(month)) };
  } catch (e) {
    console.error("[getSelloClasificacionMes] failed:", e);
    return { ok: false, error: "No se pudo medir la clasificación." };
  }
}
