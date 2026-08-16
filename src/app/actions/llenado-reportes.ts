"use server";

/**
 * Estado de llenado de los reportes diarios de las 3 sedes.
 *
 * Todo lo que llenan los administradores cada día (venta, personas,
 * NPS, mermas, tiempos) vive en `upselling_daily`, una fila por sede y
 * día — incluido Atelier, aunque a él le llega desde el reporte de Byte
 * en vez de tecleado. Por eso basta una consulta.
 *
 * La lógica de qué cuenta como falta está en src/lib/kpis/llenado.ts,
 * separada y con tests: acá solo se trae el dato.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import {
  evaluarLlenado, diasDeLaSemana, TODA_LA_SEMANA, LUNES_A_SABADO,
  type EstadoLlenado, type FilaDia, type SedeInfo,
} from "@/lib/kpis/llenado";

const sql = neon(process.env.DATABASE_URL!);

/** Atelier (1) es producción: no lleva NPS ni tiempos de salón. */
const ES_CAFETERIA: Record<number, boolean> = { 1: false, 2: true, 3: true };

/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  QUÉ DÍAS SE ESPERA QUE REPORTE CADA SEDE                       │
 * │                                                                 │
 * │  Para que Atelier vuelva a reportar los domingos, cambia su     │
 * │  línea a TODA_LA_SEMANA. No hay que tocar nada más.             │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Atelier libra los domingos (día libre de su administrador, decisión
 * de Jahnn del 16-ago-2026): reclamárselo cada semana sería ruido fijo,
 * y una alerta que siempre está encendida deja de leerse.
 *
 * Si un domingo IGUAL registran, se muestra como cualquier día lleno:
 * el dato real siempre gana sobre lo esperado.
 */
const DIAS_ESPERADOS: Record<number, number[]> = {
  1: LUNES_A_SABADO,   // Atelier
  2: TODA_LA_SEMANA,   // Fonavi
  3: TODA_LA_SEMANA,   // Centro
};

const VACIO = (weekStart: string, hoy: string): EstadoLlenado => ({
  weekStart, hoy, sedes: [], alDia: true,
  totalFaltan: 0, totalIncompletos: 0, pendientesHoy: [],
});

export async function getLlenadoReportes(weekStart: string): Promise<EstadoLlenado> {
  const hoy = getToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return VACIO(hoy, hoy);

  // Solo dirección: es una vista de control de las 3 sedes.
  const role = await getSessionRole();
  if (role?.kind !== "full") return VACIO(weekStart, hoy);

  try {
    const fechas = diasDeLaSemana(weekStart);
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];

    const negocios = (await sql`
      SELECT id, name, system_start_date::text AS desde
      FROM businesses ORDER BY id
    `) as { id: number; name: string; desde: string | null }[];

    const filasDb = (await sql`
      SELECT business_id, date::text AS fecha,
             revenue::float AS revenue, nps::float AS nps, mermas_soles::float AS mermas
      FROM upselling_daily
      WHERE date >= ${desde} AND date <= ${hasta}
    `) as { business_id: number; fecha: string; revenue: number | null; nps: number | null; mermas: number | null }[];

    const sedes: SedeInfo[] = negocios.map((n) => ({
      businessId: n.id,
      // "Yayi's Fonavi" → "Fonavi": en una tabla de 3 columnas el
      // prefijo repetido solo estorba.
      sede: n.name.replace(/^Yayi'?s\s+/i, ""),
      desde: n.desde,
      esCafeteria: ES_CAFETERIA[n.id] ?? true,
      diasEsperados: DIAS_ESPERADOS[n.id] ?? TODA_LA_SEMANA,
    }));

    const filas: FilaDia[] = filasDb.map((f) => ({
      businessId: f.business_id,
      fecha: f.fecha,
      revenue: f.revenue,
      nps: f.nps,
      mermas: f.mermas,
    }));

    return evaluarLlenado({ weekStart, hoy, sedes, filas });
  } catch (e) {
    console.error("[getLlenadoReportes] failed:", e);
    return VACIO(weekStart, hoy);
  }
}
