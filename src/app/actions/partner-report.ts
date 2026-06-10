"use server";

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { getSignedReadUrl } from "@/lib/blob-storage";
import {
  monthLabelEs,
  monthRangeOf,
  computePartnerTotals,
  type PartnerReportData,
  type ReportAttachment,
} from "@/lib/partner-report";

const sql = neon(process.env.DATABASE_URL!);
const ATELIER_ID = 1;

/**
 * Datos del "Reporte para socia" de Fonavi (solo Atelier): gastos
 * compartidos del mes + reembolsos recibidos + constancias con URL
 * firmada (Blob privado). El PDF se arma en el cliente.
 */
export async function getFonaviPartnerReport(month: string): Promise<PartnerReportData> {
  const bId = await activeBusinessId();
  if (bId !== ATELIER_ID) {
    throw new Error("El reporte para la socia se genera desde Atelier");
  }
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mes inválido");
  const { start, end } = monthRangeOf(month);

  // 1. Gastos compartidos del mes (lado Atelier) + estado del por cobrar
  const expRows = (await sql`
    SELECT e.id::text, e.date::text, e.category, e.concept,
           e.amount::float AS amount_total,
           e.atelier_amount::float AS atelier_part,
           e.fonavi_amount::float AS fonavi_part,
           COALESCE(fr.status, 'sin registro') AS receivable_status,
           COALESCE(fr.amount_collected, 0)::float AS collected
    FROM expenses e
    LEFT JOIN fonavi_receivables fr ON fr.expense_id = e.id AND fr.debtor_business_id = 2
    WHERE e.business_id = ${ATELIER_ID} AND e.is_shared = true AND e.archived = false
      AND e.date >= ${start} AND e.date <= ${end}
    ORDER BY e.date ASC
  `) as Record<string, unknown>[];

  // 2. Reembolsos de Fonavi recibidos en el mes
  const reimbRows = (await sql`
    SELECT id::text, date::text, amount::float, payment_method, note
    FROM bank_income_items
    WHERE business_id = ${ATELIER_ID} AND is_fonavi_reimbursement = true AND archived = false
      AND date >= ${start} AND date <= ${end}
    ORDER BY date ASC
  `) as Record<string, unknown>[];

  // 3. Constancias de ambos grupos (queries en lote) con URL firmada
  const expIds = expRows.map((r) => r.id as string);
  const incIds = reimbRows.map((r) => r.id as string);

  async function fetchAttachments(recordType: "expense" | "income", ids: string[]) {
    if (ids.length === 0) return new Map<string, ReportAttachment[]>();
    const rows = (await sql`
      SELECT record_id::text, url AS pathname, filename, content_type
      FROM attachments
      WHERE business_id = ${ATELIER_ID} AND record_type = ${recordType}
        AND record_id = ANY(${ids}::uuid[])
      ORDER BY created_at ASC
    `) as { record_id: string; pathname: string; filename: string; content_type: string }[];
    const map = new Map<string, ReportAttachment[]>();
    for (const r of rows) {
      const list = map.get(r.record_id) ?? [];
      list.push({
        filename: r.filename,
        contentType: r.content_type,
        signedUrl: await getSignedReadUrl(r.pathname),
      });
      map.set(r.record_id, list);
    }
    return map;
  }

  const [expAtt, incAtt] = await Promise.all([
    fetchAttachments("expense", expIds),
    fetchAttachments("income", incIds),
  ]);

  // 4. Saldo por cobrar total al momento de generar
  const pendingRows = (await sql`
    SELECT COALESCE(SUM(amount_due - amount_collected), 0)::float AS total
    FROM fonavi_receivables WHERE status != 'collected' AND debtor_business_id = 2
  `) as { total: number }[];

  const sharedExpenses = expRows.map((r) => ({
    date: r.date as string,
    category: r.category as string,
    concept: r.concept as string,
    amountTotal: Number(r.amount_total),
    atelierPart: r.atelier_part != null ? Number(r.atelier_part) : Number(r.amount_total),
    fonaviPart: r.fonavi_part != null ? Number(r.fonavi_part) : 0,
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
    sharedExpenses,
    reimbursements,
    totals: computePartnerTotals(sharedExpenses, reimbursements, pendingRows[0].total),
  };
}
