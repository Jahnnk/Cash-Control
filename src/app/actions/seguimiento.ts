"use server";

/**
 * El rastreador de la semana del administrador (ver lib/seguimiento.ts).
 *
 * No calcula nada propio: junta lo que YA usa el panel de sede (registro
 * diario, rutina del sábado, Highlight). Si cada pantalla contara por su
 * cuenta, el rastreador diría «al día» y la tarjeta de al lado «falta»: un solo
 * cerebro, otra vista.
 */

import { getSessionRole } from "@/lib/session-access";
import { activeBusinessId } from "@/lib/active-business";
import { etiquetaSemana } from "@/lib/highlight";
import { seguimientoAdministrador, type Seguimiento } from "@/lib/seguimiento";
import { getEstadoKpisSede } from "./llenado-reportes";
import { getCargaProductosSede } from "./product-sales-import";
import { getHighlightSede } from "./highlight";

export type SeguimientoSede = { ok: true; seguimiento: Seguimiento; semana: string; actualizado: string } | { ok: false };

/** La semana del administrador de la sede abierta (la misma que ve Jahnn si entra a ese panel). */
export async function getSeguimientoSede(): Promise<SeguimientoSede> {
  const role = await getSessionRole();
  if (!role) return { ok: false };
  let bId: number;
  try {
    bId = await activeBusinessId();
  } catch {
    return { ok: false };
  }
  if (!(role.kind === "full" || (role.kind === "admin" && role.sede === bId))) return { ok: false };

  try {
    const [kpis, carga, hl] = await Promise.all([getEstadoKpisSede(), getCargaProductosSede(), getHighlightSede()]);
    if (!kpis.visible) return { ok: false };
    const seguimiento = seguimientoAdministrador({
      hoy: kpis.hoy,
      highlight: hl.hoy ? { texto: hl.hoy.texto, estado: hl.hoy.estado } : null,
      faltan: kpis.dias.filter((d) => d.estado === "falta").map((d) => d.fecha),
      incompletos: kpis.dias.filter((d) => d.estado === "incompleto").map((d) => d.fecha),
      reportes: (carga.semanal?.reportes ?? []).map((r) => ({ nombre: r.nombre, ultimaCarga: r.ultimaCarga })),
      modo: kpis.modo,
    });
    return { ok: true, seguimiento, semana: etiquetaSemana(kpis.hoy), actualizado: new Date().toISOString() };
  } catch (e) {
    console.error("[getSeguimientoSede] failed:", e);
    return { ok: false };
  }
}
