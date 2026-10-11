"use server";

/**
 * El rastreador de la semana de cada puesto (ver lib/seguimiento.ts).
 *
 * No calcula nada propio: junta lo que YA usan el panel de sede y Grupo
 * (registro diario, rutina del sábado, Highlight, revisión semanal, cierre,
 * presupuesto). Si cada pantalla contara por su cuenta, el rastreador diría
 * «al día» y la tarjeta de al lado «falta»: un solo cerebro, otra vista.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { activeBusinessId } from "@/lib/active-business";
import { getToday } from "@/lib/utils";
import { lunesDe, sumarDias, etiquetaSemana } from "@/lib/highlight";
import { semanaEnRevision, CHECKLIST } from "@/lib/control-mensual";
import { estadoMenor } from "@/lib/productos/estado-reportes";
import {
  seguimientoAdministrador, seguimientoCeoSemana, seguimientoCeoMes, type Seguimiento,
} from "@/lib/seguimiento";
import { getEstadoKpisSede, getCumplimientoEquipo } from "./llenado-reportes";
import { getCargaProductosSede } from "./product-sales-import";
import { getHighlightSede } from "./highlight";
import { contarPorDefinir } from "./por-definir";

const sql = neon(process.env.DATABASE_URL!);

const SEDES = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
] as const;

const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

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

export type SeguimientoDireccion =
  | {
      ok: true;
      semana: Seguimiento;
      mes: Seguimiento;
      /** El rastreador de cada sede, igual al que ve su administrador. */
      sedes: { businessId: number; sede: string; seguimiento: Seguimiento }[];
      /** «del 12 al 18 oct» y «octubre». */
      semanaTexto: string;
      mesTexto: string;
      actualizado: string;
    }
  | { ok: false };

/** La semana y el mes del CEO. Solo Jahnn: son sus tareas, no las de quien entre con sesión completa. */
export async function getSeguimientoDireccion(): Promise<SeguimientoDireccion> {
  const role = await getSessionRole();
  if (role?.kind !== "full" || role.quien !== "jahnn") return { ok: false };

  const hoy = getToday();
  const lunes = lunesDe(hoy);
  const mes = hoy.slice(0, 7);
  const anterior = mesMas(mes, -1);
  const siguiente = mesMas(mes, 1);
  const revision = semanaEnRevision(hoy);

  try {
    const [equipo, porDefinir, revisada, hls, propuestas, presupuestos, checklist, menor] = await Promise.all([
      getCumplimientoEquipo(),
      contarPorDefinir(),
      (sql`SELECT 1 FROM revision_semanal WHERE semana = ${revision.desde}` as unknown as Promise<unknown[]>).catch(() => []),
      (sql`SELECT business_id, texto, estado FROM highlights WHERE fecha >= ${lunes} AND fecha <= ${sumarDias(lunes, 6)} ORDER BY fecha DESC` as unknown as Promise<{ business_id: number; texto: string; estado: string }[]>).catch(() => []),
      (sql`SELECT COUNT(*)::int AS n FROM highlight_propuestas WHERE estado = 'pendiente' AND fecha >= ${lunes}` as unknown as Promise<{ n: number }[]>).catch(() => [{ n: 0 }]),
      (sql`SELECT mes, COUNT(*)::int AS n FROM presupuesto_mes WHERE mes IN (${mes}, ${siguiente}) AND aprobado_el IS NOT NULL GROUP BY mes` as unknown as Promise<{ mes: string; n: number }[]>).catch(() => []),
      (sql`SELECT item FROM checklist_mensual WHERE mes = ${anterior}` as unknown as Promise<{ item: string }[]>).catch(() => []),
      (sql`SELECT business_id, desde::text AS desde, hasta::text AS hasta FROM productos_menor_rotacion GROUP BY 1, 2, 3` as unknown as Promise<{ business_id: number; desde: string; hasta: string }[]>).catch(() => []),
    ]);

    // Cada sede con el MISMO rastreador que ve su administrador.
    const sedes = SEDES.map(({ id, nombre }) => {
      const ev = equipo.control?.sedes.find((s) => s.businessId === id);
      const hl = hls.find((h) => h.business_id === id);
      return {
        businessId: id,
        sede: nombre,
        seguimiento: seguimientoAdministrador({
          hoy,
          highlight: hl ? { texto: hl.texto, estado: hl.estado as "pendiente" | "logrado" | "no_logrado" } : null,
          faltan: ev?.diasKpiFaltantes ?? [],
          incompletos: [],
          reportes: ev?.reportes ?? [],
          modo: id === 1 ? "importado" : "manual",
        }),
      };
    });

    const semana = seguimientoCeoSemana({
      hoy,
      semanaRevision: revision,
      revisada: revisada.length > 0,
      highlights: SEDES.map(({ id, nombre }) => ({ sede: nombre, asignado: hls.some((h) => h.business_id === id) })),
      porDefinir,
      propuestas: propuestas[0]?.n ?? 0,
      sedes: sedes.map((s) => ({ sede: s.sede, seguimiento: s.seguimiento })),
    });

    const ids = new Set(CHECKLIST.map((i) => i.id));
    const mesSeg = seguimientoCeoMes({
      hoy,
      totalSedes: SEDES.length,
      presupuestoMes: presupuestos.find((p) => p.mes === mes)?.n ?? 0,
      presupuestoSiguiente: presupuestos.find((p) => p.mes === siguiente)?.n ?? 0,
      cierreMarcados: checklist.filter((c) => ids.has(c.item)).length,
      cierreTotal: CHECKLIST.length,
      menorAnterior: SEDES.filter(({ id }) =>
        estadoMenor(menor.filter((m) => m.business_id === id), anterior, hoy).estado === "completo").length,
    });

    const mesTexto = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" });
    return { ok: true, semana, mes: mesSeg, sedes, semanaTexto: etiquetaSemana(hoy), mesTexto, actualizado: new Date().toISOString() };
  } catch (e) {
    console.error("[getSeguimientoDireccion] failed:", e);
    return { ok: false };
  }
}
