"use server";

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import {
  monthLabelEs,
  monthRangeOf,
  computePartnerTotals,
  type PartnerReportData,
  type ReportAttachment,
} from "@/lib/partner-report";

const sql = neon(process.env.DATABASE_URL!);
const ATELIER_ID = 1;

const DEBTOR_NAMES: Record<number, string> = { 2: "Fonavi", 3: "Centro" };

/**
 * Datos del "Reporte para socia" (solo Atelier), por LOCAL deudor:
 * gastos compartidos del mes donde ese local participa + reembolsos
 * recibidos de ese local + constancias adjuntas.
 *
 * Las constancias van como URL del PROXY same-origin
 * (/api/attachments/[id]) en vez de URL firmada del Blob: el host del
 * Blob no permite CORS y el PDF necesita LEER la imagen (fetch+canvas),
 * no solo mostrarla.
 */
export async function getPartnerReport(
  month: string,
  debtor: 2 | 3 = 2,
): Promise<PartnerReportData> {
  const bId = await activeBusinessId();
  if (bId !== ATELIER_ID) {
    throw new Error("El reporte para la socia se genera desde Atelier");
  }
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mes inválido");
  if (debtor !== 2 && debtor !== 3) throw new Error("Local inválido");
  const { start, end } = monthRangeOf(month);

  // 1. Gastos compartidos del mes donde ESTE local participa + su por cobrar
  const expRows = (await sql`
    SELECT e.id::text, e.date::text, e.category, e.concept,
           e.amount::float AS amount_total,
           e.atelier_amount::float AS atelier_part,
           (CASE WHEN ${debtor} = 2 THEN e.fonavi_amount ELSE e.centro_amount END)::float AS partner_part,
           COALESCE(fr.status, 'sin registro') AS receivable_status,
           COALESCE(fr.amount_collected, 0)::float AS collected
    FROM expenses e
    LEFT JOIN fonavi_receivables fr ON fr.expense_id = e.id AND fr.debtor_business_id = ${debtor}
    WHERE e.business_id = ${ATELIER_ID} AND e.is_shared = true AND e.archived = false
      AND e.date >= ${start} AND e.date <= ${end}
      AND (CASE WHEN ${debtor} = 2 THEN e.fonavi_amount ELSE e.centro_amount END) > 0
    ORDER BY e.date ASC
  `) as Record<string, unknown>[];

  // 2. Reembolsos recibidos de ESTE local en el mes (vía sus allocations)
  const reimbRows = (await sql`
    SELECT bi.id::text, bi.date::text, bi.amount::float, bi.payment_method, bi.note
    FROM bank_income_items bi
    WHERE bi.business_id = ${ATELIER_ID} AND bi.is_fonavi_reimbursement = true AND bi.archived = false
      AND bi.date >= ${start} AND bi.date <= ${end}
      AND EXISTS (
        SELECT 1 FROM fonavi_reimbursement_allocations a
        JOIN fonavi_receivables fr ON fr.id = a.receivable_id
        WHERE a.income_item_id = bi.id AND fr.debtor_business_id = ${debtor}
      )
    ORDER BY bi.date ASC
  `) as Record<string, unknown>[];

  // 3. Constancias (en lote), referenciadas vía el proxy same-origin
  const expIds = expRows.map((r) => r.id as string);
  const incIds = reimbRows.map((r) => r.id as string);

  async function fetchAttachments(recordType: "expense" | "income", ids: string[]) {
    if (ids.length === 0) return new Map<string, ReportAttachment[]>();
    const rows = (await sql`
      SELECT id::text AS attachment_id, record_id::text, filename, content_type
      FROM attachments
      WHERE business_id = ${ATELIER_ID} AND record_type = ${recordType}
        AND record_id = ANY(${ids}::uuid[])
      ORDER BY created_at ASC
    `) as { attachment_id: string; record_id: string; filename: string; content_type: string }[];
    const map = new Map<string, ReportAttachment[]>();
    for (const r of rows) {
      const list = map.get(r.record_id) ?? [];
      list.push({
        filename: r.filename,
        contentType: r.content_type,
        // Proxy same-origin (sesión + negocio verificados en el route handler)
        signedUrl: `/api/attachments/${r.attachment_id}`,
      });
      map.set(r.record_id, list);
    }
    return map;
  }

  const [expAtt, incAtt] = await Promise.all([
    fetchAttachments("expense", expIds),
    fetchAttachments("income", incIds),
  ]);

  // 4. Saldo por cobrar total de ESTE local al momento de generar
  const pendingRows = (await sql`
    SELECT COALESCE(SUM(amount_due - amount_collected), 0)::float AS total
    FROM fonavi_receivables WHERE status != 'collected' AND debtor_business_id = ${debtor}
  `) as { total: number }[];

  const sharedExpenses = expRows.map((r) => ({
    date: r.date as string,
    category: r.category as string,
    concept: r.concept as string,
    amountTotal: Number(r.amount_total),
    atelierPart: r.atelier_part != null ? Number(r.atelier_part) : Number(r.amount_total),
    fonaviPart: r.partner_part != null ? Number(r.partner_part) : 0,
    receivableStatus: r.receivable_status as string,
    collected: Number(r.collected),
    attachments: expAtt.get(r.id as string) ?? [],
  }));

  const reimbursements = reimbRows.map((r) => ({
    date: r.date as string,
    amount: Number(r.amount),
    method: (r.payment_method as string) || "transferencia",
    note: (r.note as string) || "",
    attachments: incAtt.get(r.id as string) ?? [],
  }));

  return {
    monthLabel: monthLabelEs(month),
    generatedAt: new Date().toLocaleDateString("es-PE", { timeZone: "America/Lima" }),
    debtorName: DEBTOR_NAMES[debtor],
    sharedExpenses,
    reimbursements,
    totals: computePartnerTotals(sharedExpenses, reimbursements, pendingRows[0].total),
  };
}

/** Alias legacy (compatibilidad): reporte de Fonavi. */
export async function getFonaviPartnerReport(month: string): Promise<PartnerReportData> {
  return getPartnerReport(month, 2);
}
