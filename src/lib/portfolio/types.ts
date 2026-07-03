/**
 * PIC — Product Intelligence Center · EL CONTRATO (Fase 1).
 *
 * Mismo patrón del EIRS, aplicado al portafolio de productos:
 *
 *   PortfolioFacts        → números crudos del mes por producto (colector)
 *   PortfolioIntelligence → métricas base + clasificaciones + SEÑALES +
 *                           UN Veredicto Estratégico por producto +
 *                           Health Score + recomendaciones. SIN PROSA.
 *   PortfolioNarrative    → prosa de Director Comercial construida SOLO
 *                           desde la inteligencia.
 *
 *   PortfolioStory = meta + facts + intelligence + narrative → lo único
 *   que ven el dashboard y los futuros renderers (PDF/PPT/Excel).
 *
 * Principio anti-contradicción (aprobado): las metodologías NO tienen voz
 * propia — emiten señales; la síntesis produce UN veredicto por producto
 * y todo lo demás (narrativa, renderers) habla solo a través de él.
 */

// ─────────────────────────────────────────────────────────────────
// CAPA 1 · HECHOS (por producto, un mes)
// ─────────────────────────────────────────────────────────────────

export type ProductFacts = {
  /** id del catálogo o null (venta sin match — se analiza igual su venta). */
  productId: string | null;
  /** Clave estable para la UI (productId o el nombre crudo). */
  key: string;
  name: string;
  category: string | null;
  units: number;
  revenue: number;
  /** Precio promedio real cobrado (revenue/units). */
  avgPrice: number;
  /** Costo unitario del snapshot del mes (null = sin costo conocido). */
  unitCogs: number | null;
  listPrice: number | null;
  targetMarginPct: number | null;
  /** true = el costo viene de un snapshot POSTERIOR al mes (aproximación
   *  honesta: no existe historial de costos antes de jul-2026). */
  costApproximated: boolean;
  /** Historia mensual del producto (meses cargados ≤ mes del reporte, asc). */
  history: { month: string; units: number; revenue: number }[];
};

export type PortfolioFacts = {
  scope: { businessId: number; businessName: string };
  month: string;      // YYYY-MM
  monthLabel: string;
  generatedAt: string;
  products: ProductFacts[];
  /** Meses con ventas cargadas (para saber qué metodologías se activan). */
  historyMonths: string[];
};

// ─────────────────────────────────────────────────────────────────
// CAPA 2 · INTELIGENCIA (estructura pura, sin prosa)
// ─────────────────────────────────────────────────────────────────

export type SignalKind = "fortaleza" | "riesgo" | "oportunidad" | "tendencia" | "urgente" | "hipotesis" | "vigilar";
export type Confidence = "alta" | "media" | "baja";

/** Señal: la unidad mínima de inteligencia. Emitida por UNA metodología. */
export type Signal = {
  id: string;
  methodology: "metricas" | "menu-engineering" | "abc" | "concentracion" | "precio" | "calidad-datos";
  productKey: string | null;   // null = señal de portafolio
  kind: SignalKind;
  /** Impacto estimado en S/ al mes (≥0, para priorizar). */
  impact: number;
  metric: string;              // qué se midió
  valueNow: number;
  valueRef: number | null;
  valueUnit: "S/" | "%" | "und" | "pts";
  source: string;              // regla y datos de origen (auditoría)
  confidence: Confidence;
};

export type MenuEngQuadrant = "star" | "plow_horse" | "puzzle" | "dog";
export type AbcClass = "A" | "B" | "C";
export type Trend = "sube" | "baja" | "estable";
/** BCG INTERNA (no de mercado): crecimiento de la demanda del producto ×
 *  peso en el portafolio (clase A del Pareto). Etiquetada así siempre. */
export type BcgQuadrant = "estrella" | "vaca" | "interrogante" | "perro";

export type Verdict =
  | "impulsar"          // margen alto, rotación baja → visibilidad/marketing/combos
  | "proteger"          // estrella: no tocar precio, cuidar visibilidad y calidad
  | "ajustar_precio"    // popular con margen bajo el objetivo
  | "revisar"           // revisión estratégica (nunca "eliminar")
  | "experimentar"      // vende plata con mal margen relativo → reposicionar
  | "observar";         // sin señal fuerte o sin costo (dato incompleto)

/** Análisis completo de un producto: métricas + clasificaciones + veredicto. */
export type ProductIntel = {
  key: string;
  productId: string | null;
  name: string;
  category: string | null;
  units: number;
  revenue: number;
  avgPrice: number;
  revenueShare: number;        // % de la venta del portafolio
  hasCost: boolean;
  unitCogs: number | null;
  unitContribution: number | null;   // avgPrice − unitCogs
  contribution: number | null;       // utilidad de contribución del mes
  marginPct: number | null;          // contribution / revenue
  targetMarginPct: number | null;
  // Clasificaciones (evidencia, no recomendaciones)
  abcClass: AbcClass;
  menuEng: MenuEngQuadrant | null;   // null = sin costo (no clasificable)
  menuEngReason: string | null;
  /** Crecimiento del mes vs promedio de los 3 previos (%). null = sin historia. */
  growthPct: number | null;
  trend: Trend | null;
  bcg: BcgQuadrant | null;           // null = historia insuficiente
  bcgReason: string | null;
  /** true = apareció por primera vez después del primer mes cargado. */
  isNew: boolean;
  // Síntesis
  verdict: Verdict;
  verdictReason: string;             // por qué, con números
  drivers: string[];                 // ids de las señales que lo originan
};

export type HealthComponent = {
  id: string;
  label: string;
  /** null = sin datos suficientes (se muestra gris y NO puntúa). */
  score: number | null;
  weight: number;              // peso nominal del diseño
  formula: string;             // auditable, con los números reales
  unavailableReason: string | null;
};

export type PortfolioHealth = {
  /** 0-100 re-ponderado sobre los componentes medibles. */
  total: number;
  level: "saludable" | "estable" | "fragil" | "critico";
  components: HealthComponent[];
  /** Cobertura de costos: % de la venta con costo conocido (honestidad). */
  costCoveragePct: number;
};

export type Recommendation = {
  id: string;
  action: string;              // imperativo corto
  why: string;                 // con números
  expectedBenefit: number;     // S/ / mes estimado
  inactionCost: string;
  priority: number;            // 1 = máxima
  timeframe: string;
  confidence: Confidence;
  sourceSignalIds: string[];
};

export type BoardDecision = { id: string; decision: string; impact: number; sourceRecommendationId: string };
export type BoardQuestionPIC = { id: string; question: string; context: string };

export type DataQuality = {
  costCoveragePct: number;           // % de la VENTA con costo
  productsWithCost: number;
  productsTotal: number;
  /** Top ventas sin costo (renombre o receta faltante) — tarea concreta. */
  topUncosted: { name: string; revenue: number }[];
  uncostedRevenue: number;
  /** true = los costos de este mes son un snapshot POSTERIOR (historia
   *  pre-jul-2026: no hay historial de costos y se dice). */
  costsAreApproximated: boolean;
};

export type PortfolioIntelligence = {
  products: ProductIntel[];          // orden: revenue desc
  signals: Signal[];                 // orden: impact desc
  health: PortfolioHealth;
  recommendations: Recommendation[]; // ≤5, por impacto
  concentration: {
    top1Share: number;
    top3Share: number;
    topCategory: { name: string; share: number } | null;
    severity: "alta" | "media" | "baja";
  };
  abcSummary: { aCount: number; bCount: number; cCount: number; aRevenueShare: number };
  menuEngSummary: { stars: number; plowHorses: number; puzzles: number; dogs: number; healthyContributionShare: number | null };
  /** BCG interna — null hasta tener ≥3 meses de historia. */
  bcgSummary: { estrellas: number; vacas: number; interrogantes: number; perros: number } | null;
  dataQuality: DataQuality;
  boardDecisions: BoardDecision[];   // ≤3
  boardQuestions: BoardQuestionPIC[]; // ≤3
  /** Metodologías que NO corrieron y por qué (honestidad estructural). */
  inactiveMethodologies: { id: string; reason: string }[];
};

// ─────────────────────────────────────────────────────────────────
// CAPA 3 · NARRATIVA (prosa; SOLO deriva de la inteligencia)
// ─────────────────────────────────────────────────────────────────

export type PicParagraph = {
  text: string;
  tone: "positivo" | "neutro" | "atencion" | "riesgo";
  derivedFrom: string[];       // ids de señales/recomendaciones (trazabilidad)
};

export type PortfolioNarrative = {
  /** Cómo está el portafolio, en una línea (header del dashboard). */
  headline: string;
  executiveSummary: PicParagraph[];   // el resumen del Director Comercial
  dataCaveat: PicParagraph | null;    // honestidad sobre cobertura de costos
  verdictIntro: Record<Verdict, string>; // qué significa cada grupo, una línea
  boardClose: {
    expectedOutcome: PicParagraph;
    inactionRisk: PicParagraph;
  };
};

// ─────────────────────────────────────────────────────────────────
// EL STORY
// ─────────────────────────────────────────────────────────────────

export type PortfolioStory = {
  meta: {
    title: string;             // nombre de la unidad
    month: string;
    monthLabel: string;
    generatedAt: string;
    confidential: true;
  };
  facts: PortfolioFacts;
  intelligence: PortfolioIntelligence;
  narrative: PortfolioNarrative;
};
