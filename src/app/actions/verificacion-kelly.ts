"use server";

/**
 * Verificación automática del Excel de Kelly contra el sistema (Actions).
 * El motor y el porqué están en lib/verificacion-kelly.ts.
 *
 * Revisa, por sede, cada mes con Excel de Kelly de los últimos 3 meses (la
 * última carga de cada mes). Se llama al abrir Grupo → Resumen y al terminar
 * una carga, así que también detecta lo que alguien cambió a mano después.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { totalesMesSede } from "@/lib/totales-mes-sede";
import { leerFuentesVenta } from "@/lib/kpis/ventas-loader";
import { verificarMes, omitidosDeNotas, type Verificacion } from "@/lib/verificacion-kelly";
import { sheetMonthKey } from "@/lib/excel-month-pairing";

const sql = neon(process.env.DATABASE_URL!);
const SEDES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

export type VerificacionSedeMes = Verificacion & {
  businessId: number;
  sede: string;
  month: string;
  archivo: string;
  cargadoEl: string;
};

function finDeMes(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

async function verificarSedeMes(b: {
  id: string; business_id: number; month: string; file_name: string; cargado: string;
  excel_ingresos: string | null; excel_egresos: string | null; notes: string | null;
}): Promise<VerificacionSedeMes> {
  const desde = `${b.month}-01`;
  const hasta = finDeMes(b.month);
  const [ingresos, gastos, fijos, sistema, ventas] = await Promise.all([
    sql`SELECT amount::float AS monto, imported_from_excel AS importado, date::text AS fecha, COALESCE(note, '') AS nota,
               is_fonavi_reimbursement AS reemb, is_special_loan AS socio, is_internal_transfer AS interna, non_operative_category AS noop,
               loan_via_bank AS via
        FROM bank_income_items WHERE business_id = ${b.business_id} AND date BETWEEN ${desde} AND ${hasta} AND archived = false`,
    sql`SELECT amount::float AS monto, imported_from_excel AS importado, date::text AS fecha, COALESCE(category, '') AS categoria,
               COALESCE(concept, '') AS concepto, is_shared AS compartido, atelier_amount::float AS atelier,
               fonavi_amount::float AS fonavi, centro_amount::float AS centro, is_special_loan AS socio, is_internal_transfer AS interna,
               payment_method AS metodo, loan_via_bank AS via
        FROM expenses WHERE business_id = ${b.business_id} AND date BETWEEN ${desde} AND ${hasta} AND archived = false`,
    sql`SELECT c.name AS categoria, MIN(r.concept) AS concepto, SUM(r.atelier_fixed)::float AS fijo
        FROM shared_expense_rules r JOIN expense_categories c ON c.id = r.category_id
        WHERE r.active = true AND r.split_mode = 'fixed' AND r.atelier_fixed IS NOT NULL
        GROUP BY c.name`,
    totalesMesSede(b.business_id, desde, hasta),
    leerFuentesVenta(sql, b.business_id, desde, hasta),
  ]);
  const v = verificarMes({
    foto: b.excel_ingresos !== null && b.excel_egresos !== null
      ? { ingresos: Number(b.excel_ingresos), egresos: Number(b.excel_egresos), omitidosEgresos: omitidosDeNotas(b.notes) }
      : null,
    ingresos: (ingresos as Record<string, unknown>[]).map((r) => ({
      monto: Number(r.monto), importado: Boolean(r.importado), fecha: String(r.fecha), nota: String(r.nota),
      reembolsoEntreSedes: Boolean(r.reemb), prestamoSocio: Boolean(r.socio), transferenciaInterna: Boolean(r.interna),
      noOperativo: (r.noop as string | null) ?? null, viaBanco: Boolean(r.via),
    })),
    gastos: (gastos as Record<string, unknown>[]).map((r) => ({
      monto: Number(r.monto), importado: Boolean(r.importado), fecha: String(r.fecha), categoria: String(r.categoria),
      concepto: String(r.concepto), compartido: Boolean(r.compartido),
      atelier: r.atelier === null ? null : Number(r.atelier), fonavi: r.fonavi === null ? null : Number(r.fonavi),
      centro: r.centro === null ? null : Number(r.centro), prestamoSocio: Boolean(r.socio), transferenciaInterna: Boolean(r.interna),
      metodo: String(r.metodo ?? ""), viaBanco: Boolean(r.via),
    })),
    sistema: { ingresos: sistema.ingresos, gastos: sistema.gastos },
    fijosAtelier: (fijos as { categoria: string; concepto: string; fijo: number }[]),
    esAtelier: b.business_id === 1,
    ventas,
    caja: { entro: sistema.entro, salio: sistema.salio },
  });
  return { ...v, businessId: b.business_id, sede: SEDES[b.business_id] ?? `Sede ${b.business_id}`, month: b.month, archivo: b.file_name, cargadoEl: b.cargado };
}

/** Las últimas cargas de cada sede y mes (3 meses), verificadas. */
export async function getVerificacionKelly(): Promise<{ ok: true; items: VerificacionSedeMes[] } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  try {
    // El mes sale del nombre de la pestaña ("Ing&Gtos SEP26"), como en el
    // importador: la fecha de inicio puede caer en otro mes si el archivo
    // trae filas sueltas de antes.
    const todos = (await sql`
      SELECT id::text, business_id, sheet_name, file_name,
             to_char(imported_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS cargado,
             excel_ingresos::text, excel_egresos::text, notes
      FROM import_batches
      WHERE sheet_name ILIKE '%Ing&Gtos%' AND status = 'completed'
        AND imported_at >= NOW() - interval '6 months'
      ORDER BY imported_at DESC
    `) as (Omit<Parameters<typeof verificarSedeMes>[0], "month"> & { sheet_name: string })[];
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const [hy, hm] = hoy.split("-").map(Number);
    const d = new Date(Date.UTC(hy, hm - 1 - 2, 1));
    const desdeMes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const vistos = new Set<string>();
    const lotes: Parameters<typeof verificarSedeMes>[0][] = [];
    for (const l of todos) {
      const month = sheetMonthKey(l.sheet_name.split(" + ")[0]);
      if (!month || month < desdeMes || month > hoy.slice(0, 7)) continue;
      const k = `${l.business_id}|${month}`;
      if (vistos.has(k)) continue; // la más reciente de ese mes ya entró
      vistos.add(k);
      lotes.push({ ...l, month });
    }
    const items = await Promise.all(lotes.map(verificarSedeMes));
    items.sort((a, b) => b.month.localeCompare(a.month) || [2, 3, 1].indexOf(a.businessId) - [2, 3, 1].indexOf(b.businessId));
    return { ok: true, items };
  } catch (e) {
    console.error("[getVerificacionKelly] failed:", e);
    return { ok: false, error: "No se pudo verificar el Excel." };
  }
}

/** La verificación de UNA carga, para mostrarla apenas termina de importarse. */
export async function getVerificacionDeLote(batchId: string): Promise<{ ok: true; item: VerificacionSedeMes } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  try {
    const [l] = (await sql`
      SELECT id::text, business_id, sheet_name, file_name,
             to_char(imported_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS cargado,
             excel_ingresos::text, excel_egresos::text, notes
      FROM import_batches WHERE id = ${batchId}::uuid
    `) as (Omit<Parameters<typeof verificarSedeMes>[0], "month"> & { sheet_name: string })[];
    const month = l ? sheetMonthKey(String(l.sheet_name).split(" + ")[0]) : null;
    if (!l || !month) return { ok: false, error: "No se encontró la carga o no es una pestaña Ing&Gtos." };
    return { ok: true, item: await verificarSedeMes({ ...l, month }) };
  } catch (e) {
    console.error("[getVerificacionDeLote] failed:", e);
    return { ok: false, error: "No se pudo verificar la carga." };
  }
}
