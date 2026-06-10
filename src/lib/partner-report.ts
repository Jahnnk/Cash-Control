/**
 * Modelo del "Reporte para socia" de Fonavi: gastos compartidos del mes
 * (con la parte de cada negocio), reembolsos recibidos y constancias
 * adjuntas por transacción. Lógica pura — la action arma los datos y el
 * cliente genera el PDF embebiendo las imágenes.
 */

export type ReportAttachment = {
  filename: string;
  contentType: string;
  /** URL firmada temporal (~10 min) — usar inmediatamente al generar. */
  signedUrl: string;
};

export type PartnerSharedExpense = {
  date: string;
  category: string;
  concept: string;
  amountTotal: number;
  atelierPart: number;
  fonaviPart: number;
  /** Estado del por cobrar asociado: pending | partial | collected | sin registro */
  receivableStatus: string;
  collected: number;
  attachments: ReportAttachment[];
};

export type PartnerReimbursement = {
  date: string;
  amount: number;
  method: string;
  note: string;
  attachments: ReportAttachment[];
};

export type PartnerReportData = {
  monthLabel: string;
  generatedAt: string;
  sharedExpenses: PartnerSharedExpense[];
  reimbursements: PartnerReimbursement[];
  totals: {
    fonaviPartMonth: number;     // lo que Fonavi debe por los compartidos del mes
    reimbursedMonth: number;     // lo que Fonavi devolvió en el mes
    pendingNow: number;          // saldo por cobrar TOTAL al momento de generar
  };
};

/**
 * Filtro por estado del reporte:
 *  - todos:      mes completo (compartidos + reembolsos), como siempre
 *  - pendientes: solo lo que Fonavi todavía debe (por cobrar no saldados,
 *                incluye cobros parciales por el resto); sin reembolsos
 *  - pagados:    solo lo saldado (compartidos cobrados) + los reembolsos
 *                del mes, con sus constancias
 */
export type PartnerReportFilter = "todos" | "pendientes" | "pagados";

export const PARTNER_FILTER_LABELS: Record<PartnerReportFilter, string> = {
  todos: "Mes completo",
  pendientes: "Pendientes de pago",
  pagados: "Pagados / reembolsados",
};

export function applyPartnerFilter(
  data: PartnerReportData,
  filter: PartnerReportFilter,
): PartnerReportData {
  if (filter === "todos") return data;
  if (filter === "pendientes") {
    const shared = data.sharedExpenses.filter((e) => e.receivableStatus !== "collected");
    return {
      ...data,
      sharedExpenses: shared,
      reimbursements: [],
      totals: computePartnerTotals(shared, [], data.totals.pendingNow),
    };
  }
  // pagados
  const shared = data.sharedExpenses.filter((e) => e.receivableStatus === "collected");
  return {
    ...data,
    sharedExpenses: shared,
    reimbursements: data.reimbursements,
    totals: computePartnerTotals(shared, data.reimbursements, data.totals.pendingNow),
  };
}

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function monthLabelEs(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_ES[(m ?? 1) - 1]} ${y}`;
}

export function monthRangeOf(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** Totales del mes a partir de las filas (una sola fuente de verdad). */
export function computePartnerTotals(
  sharedExpenses: Pick<PartnerSharedExpense, "fonaviPart">[],
  reimbursements: Pick<PartnerReimbursement, "amount">[],
  pendingNow: number,
): PartnerReportData["totals"] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    fonaviPartMonth: r2(sharedExpenses.reduce((s, e) => s + e.fonaviPart, 0)),
    reimbursedMonth: r2(reimbursements.reduce((s, r) => s + r.amount, 0)),
    pendingNow: r2(pendingNow),
  };
}

/** Agrupa adjuntos por record_id (de la query en lote). */
export function groupAttachments<T extends { record_id: string }>(
  rows: (T & ReportAttachment)[],
): Map<string, ReportAttachment[]> {
  const map = new Map<string, ReportAttachment[]>();
  for (const r of rows) {
    const list = map.get(r.record_id) ?? [];
    list.push({ filename: r.filename, contentType: r.contentType, signedUrl: r.signedUrl });
    map.set(r.record_id, list);
  }
  return map;
}
