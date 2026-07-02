/**
 * EIRS — Executive Intelligence Reporting System · EL CONTRATO.
 *
 * Tres capas estrictamente separadas (principio aprobado por Jahnn):
 *
 *   ReportFacts        → números crudos del mes + históricos (recolector)
 *   ReportIntelligence → estructura pura: KPIs, hallazgos, riesgos,
 *                        oportunidades, proyecciones, decisiones.
 *                        SIN PROSA. Cada elemento lleva su fuente.
 *   ReportNarrative    → prosa ejecutiva construida SOLO desde la
 *                        inteligencia (la firma de las funciones lo fuerza).
 *
 *   ReportStory = meta + intelligence + narrative → lo único que ven los
 *   renderers del Board Meeting Package (PDF/PPT/Excel/…).
 *
 * Unidades de negocio GENÉRICAS: nada de IDs quemados — capacidades
 * detectadas por datos (una unidad "tiene CxC" si existen; no "si es Atelier").
 */

// ─────────────────────────────────────────────────────────────────
// Unidades de negocio y alcance
// ─────────────────────────────────────────────────────────────────

export type BusinessUnitRef = {
  id: number;
  code: string;
  name: string;
};

/** Capacidades de datos de la unidad (detectadas, no asumidas). */
export type UnitCapabilities = {
  receivables: boolean;   // cuentas por cobrar a otras unidades
  partnerLoans: boolean;  // préstamos del socio
  budgets: boolean;       // presupuesto con semáforo configurado
  byteSales: boolean;     // fuente byte_sales_daily disponible en el mes
};

export type ReportScope =
  | { kind: "unit"; unit: BusinessUnitRef }
  | { kind: "group"; units: BusinessUnitRef[] };

// ─────────────────────────────────────────────────────────────────
// CAPA 1 · HECHOS (solo números; por unidad)
// ─────────────────────────────────────────────────────────────────

export type MonthlyBasics = {
  month: string;        // YYYY-MM
  sales: number;
  opExpenses: number;   // gasto operativo (porción unidad, sin categorías fuera del EBITDA)
  grossExpenses: number;
  ebitda: number;       // sales − opExpenses
  liquidityEnd: number | null; // banco+caja al cierre (null si sin registro)
};

export type CategoryMonth = {
  category: string;
  amount: number;        // mes del reporte
  avg3m: number;         // promedio de los 3 meses previos
  costGroup: string | null; // 'fijo' | 'variable' | null
  topMovements: { concept: string; amount: number; date: string }[];
};

export type BudgetFact = {
  category: string;
  budgetSoles: number;
  spent: number;
  color: "green" | "yellow" | "red";
};

export type UnitFacts = {
  unit: BusinessUnitRef;
  capabilities: UnitCapabilities;
  month: string;
  daysInMonth: number;
  current: MonthlyBasics;              // el mes del reporte
  history: MonthlyBasics[];            // 3 meses previos (más antiguo primero)
  categories: CategoryMonth[];         // gasto operativo por categoría
  budget: BudgetFact[];                // solo categorías con semáforo
  liquidity: {
    bankEnd: number;
    cashEnd: number;
    startOfMonth: number | null;       // liquidez al cierre del mes anterior
    avgDailyExpense: number;           // gasto operativo diario del mes
  };
  receivables: {
    totalPending: number;
    overdueAmount: number;
    oldestDays: number;
    byDebtor: { name: string; pending: number; oldestDays: number }[];
  } | null;
  partnerLoanPending: number | null;
  reconciliation: {
    lastCheckDate: string | null;
    lastCheckDiff: number | null;
    hasDiscrepancy: boolean;
  };
  annex: {
    topExpenses: { date: string; category: string; concept: string; amount: number }[];
    expensesByCategory: { category: string; amount: number; share: number }[];
    movementCounts: { incomes: number; expenses: number };
  };
};

export type ReportFacts = {
  scope: ReportScope;
  month: string;
  monthLabel: string;
  generatedAt: string;
  units: UnitFacts[];   // 1 para unidad; N para grupo
};

// ─────────────────────────────────────────────────────────────────
// CAPA 2 · INTELIGENCIA (estructura pura, sin prosa)
// ─────────────────────────────────────────────────────────────────

export type Trend = "sube" | "baja" | "estable";
export type Traffic = "verde" | "ambar" | "rojo";

export type KPI = {
  id: string;
  label: string;
  value: number;
  unitSuffix: "S/" | "%" | "días" | "pts";
  prev: number | null;        // mes anterior
  deltaPct: number | null;
  trend: Trend;
  traffic: Traffic;
  /** Dato que explica el semáforo (para el comentario narrativo). */
  driver: string | null;
};

/** Hallazgo estructurado: la unidad mínima de inteligencia. */
export type Finding = {
  id: string;
  kind: "logro" | "problema" | "riesgo" | "oportunidad" | "sorpresa" | "vigilar";
  impact: number;             // soles (>=0, para priorizar)
  metric: string;             // qué se midió ("Insumos vs promedio 3m")
  valueNow: number;
  valueRef: number | null;    // referencia (promedio, presupuesto, mes previo)
  /** Unidad de valueNow/valueRef para la narrativa (default: soles). */
  valueUnit?: "S/" | "días" | "%";
  source: string;             // de qué datos/regla salió (auditoría)
};

export type Risk = Finding & {
  kind: "riesgo";
  severity: "alta" | "media" | "baja";
  consequenceSoles: number | null; // consecuencia estimada si no se actúa
  mitigationId: string;            // id de mitigación del catálogo narrativo
};

export type Opportunity = Finding & {
  kind: "oportunidad";
  priority: 1 | 2 | 3;
  ease: "fácil" | "media" | "difícil";
  timeframe: "inmediato" | "este mes" | "trimestre";
};

export type Projection = {
  scenario: "conservador" | "esperado" | "optimista";
  liquidityEndNextMonth: number;
  monthlyNetFlow: number;      // supuesto de flujo usado
  basis: string;               // de dónde salió el supuesto (auditoría)
};

export type ProjectionSet = {
  scenarios: Projection[];     // los 3
  confidence: "alta" | "media" | "baja";
  confidenceBasis: string;
};

export type Decision = {
  id: string;
  action: string;              // imperativo corto ("Cobrar CxC vencidas")
  impact: number;              // soles esperados
  owner: string;               // responsable sugerido
  timeframe: string;
  sourceFindingId: string;     // trazabilidad al hallazgo que la origina
};

/** Pregunta que el directorio debe RESOLVER en la reunión (no informarse). */
export type BoardQuestion = {
  id: string;
  question: string;            // formulada para votarse/decidirse
  context: string;             // el dato que la origina (una línea)
  sourceFindingId: string;
};

export type UnitIntelligence = {
  unit: BusinessUnitRef;
  healthScore: { total: number; level: string; components: { label: string; score: number; weight: number; formula: string }[] };
  kpis: KPI[];
  /** Series de 4 meses (3 históricos + actual) para tendencias y gráficos. */
  series: {
    months: string[];
    sales: number[];
    ebitda: number[];
    margin: number[];           // %
    liquidity: (number | null)[];
  };
  /** Resumen de presupuesto (números; la prosa vive en la narrativa). */
  budgetSummary: {
    greens: number;
    yellows: number;
    reds: number;
    excessSoles: number;        // suma de (gastado − presupuesto) en rojas
    /** Rojas cuyo gasto ≈ su promedio de 3m → el exceso es la norma, no un pico. */
    structuralReds: string[];
    punctualReds: string[];
  } | null;
  strengths: Finding[];        // ordenadas por impacto
  problems: Finding[];
  risks: Risk[];
  opportunities: Opportunity[];
  surprises: Finding[];
  watchlist: Finding[];
  projections: ProjectionSet;
  decisions: Decision[];       // ≤5, ordenadas por impacto
  /** Las 3 preguntas que el directorio debe resolver este mes. */
  boardQuestions: BoardQuestion[];
};

export type ReportIntelligence = {
  units: UnitIntelligence[];
  /** Scope grupo: inteligencia del consolidado (suma de unidades). La
   *  narrativa del grupo se construye desde aquí. null en scope unidad. */
  consolidated: UnitIntelligence | null;
  /** Solo en scope grupo: comparativa entre unidades. */
  groupComparison: {
    byUnit: { unit: BusinessUnitRef; sales: number; ebitda: number; margin: number; liquidity: number }[];
    bestMarginUnitId: number | null;
    worstMarginUnitId: number | null;
  } | null;
};

// ─────────────────────────────────────────────────────────────────
// CAPA 3 · NARRATIVA (prosa; SOLO puede derivar de la inteligencia)
// ─────────────────────────────────────────────────────────────────

export type Paragraph = {
  text: string;
  tone: "positivo" | "neutro" | "atencion" | "riesgo";
  /** ids de los hallazgos/KPIs de los que deriva (trazabilidad). */
  derivedFrom: string[];
};

export type NarrativeSectionId =
  | "executive-summary"
  | "month-analysis"
  | "strengths"
  | "risks"
  | "profitability"
  | "budget"
  | "opportunities"
  | "projections"
  | "action-plan";

export type ReportNarrative = {
  cover: { statusLine: string };
  executiveSummary: {
    closing: Paragraph;          // cómo terminó el mes
    achievement: Paragraph | null;
    problem: Paragraph | null;
    risk: Paragraph | null;
    opportunity: Paragraph | null;
    keyDecisions: Paragraph[];   // ≤3
  };
  sections: Record<NarrativeSectionId, Paragraph[]>;
  /** Cierre para el directorio: qué esperar si actuamos + las 3 preguntas. */
  boardClose: {
    expectedOutcome: Paragraph;  // qué esperamos que ocurra si ejecutamos el plan
    questions: Paragraph[];      // las 3 preguntas a resolver
  };
  /** Comentario de una línea por KPI del scorecard (id → texto). */
  kpiComments: Record<string, string>;
  /** Mitigación por riesgo (mitigationId → texto). */
  mitigations: Record<string, string>;
};

// ─────────────────────────────────────────────────────────────────
// EL STORY y el Board Meeting Package
// ─────────────────────────────────────────────────────────────────

export type ReportStory = {
  meta: {
    scopeKind: "unit" | "group";
    title: string;              // "Yayi's Atelier" | "Grupo Yayi's"
    month: string;
    monthLabel: string;
    generatedAt: string;
    confidential: true;
  };
  facts: ReportFacts;           // anexos y tablas salen de aquí
  intelligence: ReportIntelligence;
  narrative: ReportNarrative;
};

/** Manifiesto del Board Meeting Package: los artefactos derivables del Story. */
export type BoardArtifactKind = "pdf" | "pptx" | "xlsx";

export type BoardPackageManifest = {
  story: ReportStory;
  artifacts: { kind: BoardArtifactKind; filename: string }[];
};
