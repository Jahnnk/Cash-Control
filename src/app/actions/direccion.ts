"use server";

/**
 * Sistema de Dirección (ASDR CORE) · acciones.
 *
 * Todo el tablero es editable desde la pantalla: objetivos, números,
 * metas, personas, decisiones y principios. Lo único que NO se escribe
 * a mano son las métricas enlazadas al sistema — esas las calcula el
 * MISMO motor que el resto de la app (una sola verdad).
 *
 * Solo dirección (requireFullSession). Tolerante a que la migración
 * aún no esté corrida: devuelve `tablaFalta` y la pantalla lo explica.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { requireFullSession } from "@/lib/session-access";
import { BLOCKS, isMetricKey, type Block, type DireccionItem } from "@/lib/direccion/types";
import { getGroupDashboard } from "./grupo";
import { getGroupVentasComparison } from "./group-ventas";
import { getGroupBreakeven } from "./breakeven";
import { salesInRange, opExpensesInRange } from "./command-center";

const sql = neon(process.env.DATABASE_URL!);
const NO_ACCESS = { ok: false as const, error: "El Sistema de Dirección es solo para la dirección." };

export type DireccionBoard = {
  items: DireccionItem[];
  metricas: Record<string, number | null>;
  tablaFalta: boolean;
};

type Row = {
  id: string; block: string; position: number; title: string; detail: string | null;
  status: string | null; metric_key: string | null; manual_value: number | null;
  target_value: number | null; target_unit: string | null; higher_is_better: boolean;
};

function toItem(r: Row): DireccionItem {
  return {
    id: r.id,
    block: r.block as Block,
    position: r.position,
    title: r.title,
    detail: r.detail,
    status: r.status,
    metricKey: r.metric_key && isMetricKey(r.metric_key) ? r.metric_key : null,
    manualValue: r.manual_value === null ? null : Number(r.manual_value),
    targetValue: r.target_value === null ? null : Number(r.target_value),
    targetUnit: r.target_unit,
    higherIsBetter: r.higher_is_better,
  };
}

/** Métricas que el sistema calcula solo — mismos motores del dashboard. */
async function resolverMetricas(): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  try {
    const dash = await getGroupDashboard();
    out.liquidez_grupo = dash.totals.bankBalance;
    out.margen_mes_grupo = dash.totals.margin;

    const ventas = await getGroupVentasComparison();
    if (ventas.ok) {
      const mes = ventas.sedes.reduce((s, v) => s + v.mes, 0);
      out.ventas_mes_grupo = mes;
      const cur = ventas.sedes.reduce((s, v) => s + (v.mesCmp?.sameDay.current ?? 0), 0);
      const prev = ventas.sedes.reduce((s, v) => s + (v.mesCmp?.sameDay.previous ?? 0), 0);
      out.ventas_delta_pct = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
      out.margen_pct_grupo = mes > 0 ? Math.round((dash.totals.margin / mes) * 1000) / 10 : null;
    }

    const be = await getGroupBreakeven(dash.selectedMonth);
    out.equilibrio_pct_grupo = be.ok ? be.data.grupo.avancePct : null;

    // ── EBITDA del grupo: MISMO cálculo que el Reporte Ejecutivo
    // (ventas − gastos operativos, con la exclusión canónica de
    // categorías marcadas exclude_from_ebitda). Nada de una fórmula
    // paralela: si el reporte y el tablero difieren, uno miente.
    const mesIni = `${dash.selectedMonth}-01`;
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const [y2, m2] = dash.selectedMonth.split("-").map(Number);
    const finMes = `${dash.selectedMonth}-${String(new Date(y2, m2, 0).getDate()).padStart(2, "0")}`;
    const mesFin = dash.isCurrentMonth ? hoy : finMes;

    let ventasEbitda = 0;
    let gastosOp = 0;
    for (const bId of [1, 2, 3]) {
      ventasEbitda += await salesInRange(bId, mesIni, mesFin);
      gastosOp += await opExpensesInRange(bId, mesIni, mesFin);
    }
    const ebitda = Math.round((ventasEbitda - gastosOp) * 100) / 100;
    out.ebitda_mes_grupo = ebitda;
    out.ebitda_pct_grupo = ventasEbitda > 0 ? Math.round((ebitda / ventasEbitda) * 1000) / 10 : null;

    // ── Profit First: lo que REALMENTE se separó a Ahorro este mes.
    // Mide la práctica, no la intención — si nadie transfirió nada, el
    // avance es 0 aunque la meta esté escrita.
    const ahorro = (await sql`
      SELECT COALESCE(SUM(amount), 0)::float AS t
      FROM expenses
      WHERE business_id IN (1, 2, 3)
        AND date >= ${mesIni} AND date <= ${mesFin}
        AND archived = false AND is_special_loan = false AND is_internal_transfer = false
        AND (category ILIKE '%ahorro%' OR category ILIKE '%profit%first%')
    `) as { t: number }[];
    const pf = Math.round((ahorro[0]?.t ?? 0) * 100) / 100;
    out.profit_first_mes_grupo = pf;
    out.profit_first_pct_grupo = ventasEbitda > 0 ? Math.round((pf / ventasEbitda) * 1000) / 10 : null;
  } catch (err) {
    console.error("[direccion] métricas no resueltas:", err);
  }
  return out;
}

export async function getDireccionBoard(): Promise<
  { ok: true; data: DireccionBoard } | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return NO_ACCESS;
  try {
    let rows: Row[] = [];
    let tablaFalta = false;
    try {
      rows = (await sql`
        SELECT id::text, block, position, title, detail, status, metric_key,
               manual_value, target_value, target_unit, higher_is_better
        FROM direccion_items WHERE archived = false
        ORDER BY block, position, created_at
      `) as Row[];
    } catch {
      tablaFalta = true;
    }
    return {
      ok: true,
      data: { items: rows.map(toItem), metricas: await resolverMetricas(), tablaFalta },
    };
  } catch (err) {
    console.error("[getDireccionBoard] failed:", err);
    return { ok: false, error: "No pude cargar el Sistema de Dirección." };
  }
}

export type SaveItemInput = {
  id?: string;
  block: string;
  title: string;
  detail?: string | null;
  status?: string | null;
  metricKey?: string | null;
  manualValue?: number | null;
  targetValue?: number | null;
  targetUnit?: string | null;
  higherIsBetter?: boolean;
};

export async function saveDireccionItem(
  input: SaveItemInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  const title = input.title.trim();
  if (!(BLOCKS as readonly string[]).includes(input.block)) return { ok: false, error: "Bloque inválido." };
  if (title.length < 2) return { ok: false, error: "Escribe un texto (mínimo 2 letras)." };
  if (title.length > 200) return { ok: false, error: "Texto demasiado largo (máx. 200)." };
  const metricKey = input.metricKey && isMetricKey(input.metricKey) ? input.metricKey : null;

  try {
    if (input.id) {
      const rows = (await sql`
        UPDATE direccion_items SET
          title = ${title},
          detail = ${input.detail?.trim() || null},
          status = ${input.status ?? null},
          metric_key = ${metricKey},
          manual_value = ${input.manualValue ?? null},
          target_value = ${input.targetValue ?? null},
          target_unit = ${input.targetUnit?.trim() || null},
          higher_is_better = ${input.higherIsBetter ?? true},
          updated_at = now()
        WHERE id = ${input.id}::uuid RETURNING id::text
      `) as { id: string }[];
      if (rows.length === 0) return { ok: false, error: "Ese elemento ya no existe." };
      revalidatePath("/grupo/direccion");
      return { ok: true, id: rows[0].id };
    }

    const pos = (await sql`
      SELECT COALESCE(MAX(position), 0) + 1 AS p FROM direccion_items WHERE block = ${input.block}
    `) as { p: number }[];
    const rows = (await sql`
      INSERT INTO direccion_items
        (block, position, title, detail, status, metric_key, manual_value, target_value, target_unit, higher_is_better)
      VALUES (${input.block}, ${pos[0]?.p ?? 1}, ${title}, ${input.detail?.trim() || null},
              ${input.status ?? null}, ${metricKey}, ${input.manualValue ?? null},
              ${input.targetValue ?? null}, ${input.targetUnit?.trim() || null}, ${input.higherIsBetter ?? true})
      RETURNING id::text
    `) as { id: string }[];
    revalidatePath("/grupo/direccion");
    return { ok: true, id: rows[0].id };
  } catch (err) {
    console.error("[saveDireccionItem] failed:", err);
    return { ok: false, error: "No pude guardar (¿falta correr la migración?)." };
  }
}

/** Cambia solo el estado — el clic rápido del kanban y de la salud. */
export async function setDireccionStatus(
  id: string, status: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  try {
    await sql`UPDATE direccion_items SET status = ${status}, updated_at = now() WHERE id = ${id}::uuid`;
    revalidatePath("/grupo/direccion");
    return { ok: true };
  } catch (err) {
    console.error("[setDireccionStatus] failed:", err);
    return { ok: false, error: "No pude cambiar el estado." };
  }
}

/** Archiva (no borra): la historia de lo que se decidió no se tira. */
export async function archiveDireccionItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return NO_ACCESS;
  try {
    await sql`UPDATE direccion_items SET archived = true, updated_at = now() WHERE id = ${id}::uuid`;
    revalidatePath("/grupo/direccion");
    return { ok: true };
  } catch (err) {
    console.error("[archiveDireccionItem] failed:", err);
    return { ok: false, error: "No pude quitar el elemento." };
  }
}

/**
 * Siembra el tablero con la estructura adaptada a Yayi's. Solo corre si
 * está VACÍO — nunca pisa lo que Jahnn ya escribió. Las metas van sin
 * número a propósito: son suyas, no copiadas de otra empresa.
 */
export async function seedDireccionBoard(): Promise<
  { ok: true; creados: number } | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return NO_ACCESS;
  try {
    const existentes = (await sql`SELECT COUNT(*)::int AS n FROM direccion_items`) as { n: number }[];
    if ((existentes[0]?.n ?? 0) > 0) return { ok: false, error: "El tablero ya tiene contenido." };

    const seed: SaveItemInput[] = [
      // Objetivos — el destino del año (los números los pone Jahnn).
      { block: "objetivo", title: "EBITDA sobre ventas", detail: "Escribe TU meta (%) y el avance se calcula solo.", metricKey: "ebitda_pct_grupo", targetUnit: "%", higherIsBetter: true },
      { block: "objetivo", title: "Profit First", detail: "% de la venta que separas a Ahorro. Mide la práctica, no la intención.", metricKey: "profit_first_pct_grupo", targetUnit: "%", higherIsBetter: true },
      { block: "objetivo", title: "Las 3 sedes cubren su punto de equilibrio", detail: "Cada una se paga sola, todos los meses.", metricKey: "equilibrio_pct_grupo", targetValue: 100, targetUnit: "%", higherIsBetter: true },
      { block: "objetivo", title: "Sistema funcionando sin que yo opere", detail: "Dirigir desde el panel; Kelly y los admins ejecutan." },

      // Números que mandan — enlazados al sistema donde se puede.
      { block: "numero", title: "Ventas del mes (grupo)", metricKey: "ventas_mes_grupo", targetUnit: "S/", higherIsBetter: true },
      { block: "numero", title: "Variación vs mes pasado", metricKey: "ventas_delta_pct", targetUnit: "%", higherIsBetter: true },
      { block: "numero", title: "EBITDA del mes", metricKey: "ebitda_mes_grupo", targetUnit: "S/", higherIsBetter: true },
      { block: "numero", title: "Profit First separado", metricKey: "profit_first_mes_grupo", targetUnit: "S/", higherIsBetter: true },
      { block: "numero", title: "Margen sobre ventas", metricKey: "margen_pct_grupo", targetUnit: "%", higherIsBetter: true },
      { block: "numero", title: "Liquidez (banco + caja)", metricKey: "liquidez_grupo", targetUnit: "S/", higherIsBetter: true },
      { block: "numero", title: "Punto de equilibrio del grupo", metricKey: "equilibrio_pct_grupo", targetUnit: "%", targetValue: 100, higherIsBetter: true },
      { block: "numero", title: "Ticket promedio", detail: "Escríbelo del panel de incentivos.", targetUnit: "S/", higherIsBetter: true },
      { block: "numero", title: "NPS", detail: "Del registro diario de las cafeterías.", targetUnit: "pts", higherIsBetter: true },

      // Salud del sistema — ¿qué camina solo?
      { block: "salud", title: "Datos a tiempo", detail: "Kelly sube los 3 Excel los viernes.", status: "atencion" },
      { block: "salud", title: "Responsables claros por sede", detail: "Un administrador por sede, sin zonas grises.", status: "atencion" },
      { block: "salud", title: "Producción centralizada en Atelier", status: "atencion" },
      { block: "salud", title: "Cuadre bancario al día", detail: "Saldo real vs sistema, sin diferencias.", status: "atencion" },
      { block: "salud", title: "Reglas automáticas activas", detail: "El sistema avisa solo cuando algo se sale de rango.", status: "bien" },

      // Personas clave — quién responde por qué.
      { block: "persona", title: "Jahnn · CEO", detail: "Dirección, decisiones, prioridades." },
      { block: "persona", title: "Kelly · Gerencia de Finanzas", detail: "Datos de las 3 sedes, control, cierre." },
      { block: "persona", title: "Luis · Administrador Atelier", detail: "Producción y operación del centro." },
      { block: "persona", title: "Chari · Administradora Centro", detail: "Operación, equipo, ticket promedio." },
      { block: "persona", title: "Administrador Fonavi · por cubrir", detail: "Operación, equipo, ticket promedio." },
      { block: "persona", title: "Luana · Supervisora Atelier", detail: "Disciplina y constancia del día a día." },

      // Decisiones de la semana.
      { block: "decision", title: "Kelly asume las finanzas de las 3 sedes", detail: "Desde el 1 de agosto.", status: "tomada" },
      { block: "decision", title: "Carga semanal de los Excel, los viernes", detail: "Delegado a Kelly.", status: "delegada" },
      { block: "decision", title: "¿El pendiente de préstamos socio se condona o se devuelve?", detail: "Definir con las socias.", status: "pendiente" },

      // Alertas de realidad — los principios que evitan autoengaños.
      { block: "alerta", title: "Más ventas ≠ más utilidad" },
      { block: "alerta", title: "Problema repetido = sistema roto" },
      { block: "alerta", title: "Urgente ≠ importante" },
      { block: "alerta", title: "Si depende de mí, no está listo" },
    ];

    let creados = 0;
    for (const [i, s] of seed.entries()) {
      await sql`
        INSERT INTO direccion_items
          (block, position, title, detail, status, metric_key, target_value, target_unit, higher_is_better)
        VALUES (${s.block}, ${i}, ${s.title}, ${s.detail ?? null}, ${s.status ?? null},
                ${s.metricKey ?? null}, ${s.targetValue ?? null}, ${s.targetUnit ?? null},
                ${s.higherIsBetter ?? true})
      `;
      creados++;
    }
    revalidatePath("/grupo/direccion");
    return { ok: true, creados };
  } catch (err) {
    console.error("[seedDireccionBoard] failed:", err);
    return { ok: false, error: "No pude preparar el tablero (¿falta correr la migración?)." };
  }
}
