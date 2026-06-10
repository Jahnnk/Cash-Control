import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  date,
  timestamp,
  jsonb,
  integer,
  serial,
  varchar,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ═════════════════════════════════════════════════════════════════
// MULTI-TENANT FOUNDATION (Ola 5)
// ═════════════════════════════════════════════════════════════════

/**
 * Tabla raíz del modelo multi-tenant.
 * Yayi's tiene 3 negocios independientes: Atelier (centro de producción
 * + B2B), Fonavi y Centro (cafeterías). Cada negocio tiene su propia
 * cuenta BCP, movimientos, categorías y presupuesto.
 */
export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  // Configuración inicial post-reset: cuando system_start_date está
  // seteado, los cálculos de saldo usan los saldos iniciales más los
  // movimientos no-archivados desde esa fecha. Si es NULL, comportamiento
  // legacy (Atelier).
  systemStartDate: date("system_start_date"),
  initialBcpBalance: numeric("initial_bcp_balance", { precision: 12, scale: 2 }).default("0").notNull(),
  initialCashBalance: numeric("initial_cash_balance", { precision: 12, scale: 2 }).default("0").notNull(),
  initialBalanceDate: date("initial_balance_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ═════════════════════════════════════════════════════════════════
// TABLAS MULTI-TENANT (con business_id obligatorio)
// ═════════════════════════════════════════════════════════════════

/**
 * Daily record from Byte + Bank.
 * UNIQUE(business_id, date) — un registro por (negocio, día).
 */
export const dailyRecords = pgTable(
  "daily_records",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    date: date("date").notNull(),
    // Byte fields
    byteCash: numeric("byte_cash", { precision: 10, scale: 2 }).default("0"),
    byteCashPhysical: numeric("byte_cash_physical", { precision: 10, scale: 2 }).default("0"),
    byteDigital: numeric("byte_digital", { precision: 10, scale: 2 }).default("0"),
    byteCashSale: numeric("byte_cash_sale", { precision: 10, scale: 2 }).default("0"),
    byteCashSaleMethod: text("byte_cash_sale_method"),
    byteCreditDay: numeric("byte_credit_day", { precision: 10, scale: 2 }).default("0"),
    byteCreditCollected: numeric("byte_credit_collected", { precision: 10, scale: 2 }).default("0"),
    byteCreditBalance: numeric("byte_credit_balance", { precision: 10, scale: 2 }).default("0"),
    byteDiscounts: numeric("byte_discounts", { precision: 10, scale: 2 }).default("0"),
    byteTotal: numeric("byte_total", { precision: 10, scale: 2 }).default("0"),
    // Bank fields
    bankIncome: numeric("bank_income", { precision: 10, scale: 2 }).default("0"),
    bankExpense: numeric("bank_expense", { precision: 10, scale: 2 }).default("0"),
    bankBalanceReal: numeric("bank_balance_real", { precision: 10, scale: 2 }),
    notes: text("notes"),
    // Soft-delete para reset por negocio.
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    businessDateUnique: unique("daily_records_business_date_unique").on(t.businessId, t.date),
    businessIdx: index("idx_daily_records_business_id").on(t.businessId),
  })
);

/**
 * Egresos del día (multi-tenant).
 * Los campos isShared / shared_rule_id / atelier_amount / fonavi_amount
 * solo aplican a Atelier (gastos compartidos con Fonavi); en Fonavi y
 * Centro siempre quedan en false / NULL.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    date: date("date").notNull(),
    category: text("category").notNull(),
    concept: text("concept").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").default("transferencia").notNull(),
    notes: text("notes"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Gastos compartidos con Fonavi (solo Atelier)
    isShared: boolean("is_shared").default(false).notNull(),
    sharedRuleId: uuid("shared_rule_id"),
    atelierAmount: numeric("atelier_amount", { precision: 10, scale: 2 }),
    fonaviAmount: numeric("fonavi_amount", { precision: 10, scale: 2 }),
    // Parte de Centro en compartidos a 3 locales (NULL = no participa)
    centroAmount: numeric("centro_amount", { precision: 10, scale: 2 }),
    // Auto-mirror Atelier→Fonavi (CAMBIO 7.5):
    // En el gasto-espejo de Fonavi, estas FKs apuntan al padre Atelier
    // y a la receivable. NULL en gastos normales o en el lado Atelier.
    linkedAtelierExpenseId: uuid("linked_atelier_expense_id"),
    linkedReceivableId: uuid("linked_receivable_id"),
    // Préstamos del socio (Jahnn → Atelier). Filtra estos egresos fuera
    // de reportes operativos para que no contaminen ingresos/EBITDA.
    isSpecialLoan: boolean("is_special_loan").default(false).notNull(),
    // Transferencia interna entre cuentas del mismo negocio (Efectivo↔BCP).
    // Igual que isSpecialLoan, se excluye de reportes operativos pero
    // SÍ afecta saldos reales (cada pata mueve su cuenta).
    isInternalTransfer: boolean("is_internal_transfer").default(false).notNull(),
    transferPairId: uuid("transfer_pair_id"),
    // Soft-delete para reset por negocio.
    archived: boolean("archived").default(false).notNull(),
    // Trazabilidad de importación masiva desde Excel.
    importedFromExcel: boolean("imported_from_excel").default(false).notNull(),
    importBatchId: uuid("import_batch_id"),
    // Marca de verificación contra movimientos de la app BCP del banco.
    // NULL = pendiente de cuadrar; timestamp = cuadrado en esa fecha.
    // Solo metadata visual: NO afecta saldos ni reportes financieros.
    bcpVerifiedAt: timestamp("bcp_verified_at"),
  },
  (t) => ({
    businessIdx: index("idx_expenses_business_id").on(t.businessId),
  })
);

/**
 * Ventas Byte por día (Control de VTAS de Kelly).
 * Una fila por business_id + date. Total es columna generada.
 */
export const byteSalesDaily = pgTable(
  "byte_sales_daily",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    date: date("date").notNull(),
    efectivo: numeric("efectivo", { precision: 12, scale: 2 }).default("0").notNull(),
    yapePlin: numeric("yape_plin", { precision: 12, scale: 2 }).default("0").notNull(),
    pos: numeric("pos", { precision: 12, scale: 2 }).default("0").notNull(),
    // Total reportado por POS del día (suma lado QuipuPOS col E + crédito).
    // Nullable porque solo se persiste cuando el parser captura ambos lados.
    // Cuando es null en UI, se hace fallback a (efectivo + yape + pos) =
    // lado Cuentas sin crédito (comportamiento pre-Prompt 24).
    totalPosExcel: numeric("total_pos_excel", { precision: 12, scale: 2 }),
    importedFromExcel: boolean("imported_from_excel").default(false).notNull(),
    importBatchId: uuid("import_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    businessDateUnique: unique("byte_sales_daily_business_date_unique").on(t.businessId, t.date),
  })
);

/** Propinas pendientes de pagar a colaboradores. */
export const tipsPending = pgTable("tips_pending", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  source: text("source").default("excel").notNull(),         // 'excel' | 'manual'
  sourceConcept: text("source_concept"),                     // Yape | POS | Ventas al Crédito
  noteText: text("note_text"),
  collaboratorName: text("collaborator_name"),
  status: text("status").default("pending").notNull(),       // pending | paid | cancelled
  paidAt: date("paid_at"),
  paidInPayrollId: uuid("paid_in_payroll_id"),
  importedFromExcel: boolean("imported_from_excel").default(false).notNull(),
  importBatchId: uuid("import_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Alertas de redondeo (diferencias QuipuPOS vs Cuentas no-propina). */
export const roundingAlerts = pgTable("rounding_alerts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  date: date("date").notNull(),
  paymentMethod: text("payment_method").notNull(),           // yape_plin | pos
  amountQuipupos: numeric("amount_quipupos", { precision: 12, scale: 2 }),
  amountCuentas: numeric("amount_cuentas", { precision: 12, scale: 2 }),
  difference: numeric("difference", { precision: 12, scale: 2 }).notNull(),
  noteText: text("note_text"),
  status: text("status").default("pending").notNull(),       // pending | reviewed | resolved
  resolvedNote: text("resolved_note"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  importedFromExcel: boolean("imported_from_excel").default(false).notNull(),
  importBatchId: uuid("import_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Registro de cada importación masiva desde Excel. Auditoría +
 * habilita rollback futuro (filtrar por import_batch_id).
 */
export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  importedBy: text("imported_by"),
  fileName: text("file_name"),
  sheetName: text("sheet_name"),
  dateRangeStart: date("date_range_start"),
  dateRangeEnd: date("date_range_end"),
  movementsCount: integer("movements_count"),
  ingresosCount: integer("ingresos_count"),
  egresosCount: integer("egresos_count"),
  initialCashApplied: numeric("initial_cash_applied", { precision: 12, scale: 2 }),
  initialBcpApplied: numeric("initial_bcp_applied", { precision: 12, scale: 2 }),
  archivedCount: integer("archived_count"),
  status: text("status").default("completed").notNull(),
  rollbackAvailable: boolean("rollback_available").default(true),
  notes: text("notes"),
  // JSONB con los ParseWarning estructurados emitidos por excel-importer.ts
  // (defensas tolerantes Prompt 18). Se llena al confirmar el import.
  warningsJson: jsonb("warnings_json"),
});

/**
 * Ingresos individuales registrados al banco (multi-tenant).
 * client_id solo se usa en Atelier (cobranza B2B); en Fonavi/Centro queda NULL.
 */
export const bankIncomeItems = pgTable(
  "bank_income_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    date: date("date").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    clientId: uuid("client_id"),
    note: text("note"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isFonaviReimbursement: boolean("is_fonavi_reimbursement").default(false).notNull(),
    receivableId: uuid("receivable_id"),
    // Devoluciones de préstamos del socio (Atelier → Jahnn). Igual que
    // los egresos isSpecialLoan, se excluyen de ingresos del mes/EBITDA.
    isSpecialLoan: boolean("is_special_loan").default(false).notNull(),
    // Método con el que se recibió el ingreso. Si es 'efectivo' NO afecta
    // el saldo BCP (mismo patrón que expenses.payment_method).
    paymentMethod: text("payment_method").default("transferencia").notNull(),
    // Transferencia interna Efectivo↔BCP — pata "ingreso" del par.
    isInternalTransfer: boolean("is_internal_transfer").default(false).notNull(),
    transferPairId: uuid("transfer_pair_id"),
    // Venta del Byte (POS-cafetería B2C) — diferenciada de ingresos
    // manuales para reportes específicos. SÍ cuenta como ingreso operativo.
    isByteSale: boolean("is_byte_sale").default(false).notNull(),
    // Soft-delete para reset por negocio. archived=true se filtra de
    // todos los cálculos operativos pero la fila persiste para auditoría.
    archived: boolean("archived").default(false).notNull(),
    // Devolución (gasto registrado como ingreso por compensación).
    isRefund: boolean("is_refund").default(false).notNull(),
    // Ingreso NO operativo (venta de activos, préstamos recibidos, aportes
    // de socios…). NULL = operativo. Los no-operativos SÍ afectan saldos
    // (banco/caja según payment_method) pero NO cuentan en ventas/EBITDA
    // — espejo de expense_categories.exclude_from_ebitda para egresos.
    nonOperativeCategory: text("non_operative_category"),
    // Trazabilidad de importación masiva desde Excel.
    importedFromExcel: boolean("imported_from_excel").default(false).notNull(),
    importBatchId: uuid("import_batch_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Marca de verificación contra movimientos de la app BCP del banco.
    // NULL = pendiente de cuadrar; timestamp = cuadrado en esa fecha.
    // Solo metadata visual: NO afecta saldos ni reportes financieros.
    bcpVerifiedAt: timestamp("bcp_verified_at"),
  },
  (t) => ({
    businessIdx: index("idx_bank_income_items_business_id").on(t.businessId),
  })
);

/**
 * Categorías de egresos (multi-tenant).
 * UNIQUE(business_id, name) — cada negocio puede tener su set de categorías.
 */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    excludeFromEbitda: boolean("exclude_from_ebitda").default(false).notNull(),
    // Grupo de costo para análisis de gestión: 'fijo' | 'variable' | NULL =
    // sin clasificar. El grupo No-operativo NO vive aquí: lo define
    // exclude_from_ebitda (exclusión canónica del EBITDA).
    costGroup: text("cost_group"),
    // True solo para "Préstamos del socio" en Atelier. Se filtra de
    // reportes operativos (ingresos/EBITDA/categorías/presupuesto/grupo).
    isSpecialLoan: boolean("is_special_loan").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    businessNameUnique: unique("expense_categories_business_name_unique").on(t.businessId, t.name),
    businessIdx: index("idx_expense_categories_business_id").on(t.businessId),
  })
);

/**
 * Configuración de presupuesto por categoría (multi-tenant).
 * UNIQUE(business_id, category_name) — un presupuesto por (negocio, categoría).
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    categoryName: text("category_name").notNull(),
    budgetPercentage: numeric("budget_percentage", { precision: 5, scale: 2 }),
    costType: text("cost_type").notNull(),
    hasTrafficLight: boolean("has_traffic_light").default(false).notNull(),
    thresholdGreen: integer("threshold_green").default(80).notNull(),
    thresholdYellow: integer("threshold_yellow").default(95).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    businessCategoryUnique: unique("budgets_business_category_unique").on(t.businessId, t.categoryName),
    businessIdx: index("idx_budgets_business_id").on(t.businessId),
  })
);

/**
 * Adjuntos (constancias de pago) por movimiento — multi-tenant.
 * `url` guarda el PATHNAME del archivo en el Blob PRIVADO de Vercel
 * (yayis-adjuntos): no hay URLs públicas permanentes; la lectura usa
 * URLs firmadas temporales (ver src/lib/blob-storage.ts).
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    recordType: text("record_type").notNull(), // 'expense' | 'income'
    recordId: uuid("record_id").notNull(),
    url: text("url").notNull(), // pathname en el Blob privado
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    recordIdx: index("idx_attachments_record").on(t.recordType, t.recordId),
    businessIdx: index("idx_attachments_business").on(t.businessId),
  })
);

/**
 * Auditoría de ediciones/eliminaciones (multi-tenant).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    action: text("action").notNull(),
    recordId: uuid("record_id").notNull(),
    recordType: text("record_type").notNull(),
    beforeData: jsonb("before_data").notNull(),
    afterData: jsonb("after_data"),
    userNote: text("user_note"),
    dateAffected: date("date_affected").notNull(),
  },
  (t) => ({
    businessIdx: index("idx_audit_log_business_id").on(t.businessId),
  })
);

// ═════════════════════════════════════════════════════════════════
// TABLAS EXCLUSIVAS DE ATELIER (sin business_id)
// ═════════════════════════════════════════════════════════════════
//
// Estas tablas modelan funcionalidad que solo existe en Atelier:
// - clients: clientes B2B (Fonavi/Centro venden a consumidor final)
// - shared_expense_rules: reglas de gastos compartidos Atelier↔Fonavi
// - fonavi_receivables: cuentas por cobrar a Fonavi
// - fonavi_reimbursement_allocations: asignación de reembolsos
//
// En Ola 7 las queries deben usar estas tablas SOLO cuando el negocio
// activo sea 'atelier'. En Fonavi/Centro las funcionalidades asociadas
// (sección "Por cobrar Fonavi", reglas compartidas, etc.) se ocultan.

/** Tabla exclusiva Atelier — no requiere business_id. */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  paymentPattern: text("payment_pattern"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Tabla exclusiva Atelier — no requiere business_id. */
export const sharedExpenseRules = pgTable("shared_expense_rules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: uuid("category_id").notNull(),
  concept: text("concept").notNull(),
  atelierPercentage: numeric("atelier_percentage", { precision: 5, scale: 2 }).notNull(),
  fonaviPercentage: numeric("fonavi_percentage", { precision: 5, scale: 2 }).notNull(),
  // Reparto a 3 locales (0/NULL = Centro no participa)
  centroPercentage: numeric("centro_percentage", { precision: 5, scale: 2 }).default("0").notNull(),
  centroFixed: numeric("centro_fixed", { precision: 10, scale: 2 }),
  // Modo de reparto (migración previa): 'percentage' | 'fixed'
  splitMode: text("split_mode").default("percentage").notNull(),
  atelierFixed: numeric("atelier_fixed", { precision: 10, scale: 2 }),
  fonaviFixed: numeric("fonavi_fixed", { precision: 10, scale: 2 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Tabla exclusiva Atelier — no requiere business_id. */
export const fonaviReceivables = pgTable("fonavi_receivables", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseId: uuid("expense_id").notNull(),
  amountDue: numeric("amount_due", { precision: 10, scale: 2 }).notNull(),
  amountCollected: numeric("amount_collected", { precision: 10, scale: 2 }).default("0").notNull(),
  status: text("status").default("pending").notNull(),
  // Local deudor: 2 = Fonavi (histórico/default), 3 = Centro. El nombre de
  // la tabla quedó legacy: hoy guarda los por-cobrar de AMBAS cafeterías.
  debtorBusinessId: integer("debtor_business_id").default(2).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  collectedAt: timestamp("collected_at"),
});

/** Tabla exclusiva Atelier — no requiere business_id. */
export const fonaviReimbursementAllocations = pgTable("fonavi_reimbursement_allocations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  incomeItemId: uuid("income_item_id").notNull(),
  receivableId: uuid("receivable_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Conciliación bancaria — Fase 1.
 * Registro periódico del saldo BCP real (lo que Jahnn ve en la app del
 * banco) vs el saldo calculado por el sistema en ese mismo momento.
 * UNIQUE(business_id, check_date) → upsert por día por negocio. La
 * diferencia se persiste como foto inmutable para auditoría histórica.
 * Aplica inicialmente solo a Atelier (Fase 1); Centro/Fonavi son fases
 * posteriores. created_by hardcoded 'jahnn' en esta fase (sin
 * multiusuario). Ver Prompt Fase 1 de conciliación.
 */
export const bankRealChecks = pgTable(
  "bank_real_checks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().references(() => businesses.id),
    checkDate: date("check_date").notNull(),
    realBalance: numeric("real_balance", { precision: 12, scale: 2 }).notNull(),
    systemBalanceAtCheck: numeric("system_balance_at_check", { precision: 12, scale: 2 }).notNull(),
    difference: numeric("difference", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: varchar("created_by", { length: 100 }).notNull(),
    // Estado de investigación (Prompt Conciliación Fase 2)
    //  - 'pending':  diferencia aún no investigada o investigación abierta
    //  - 'resolved': Jahnn encontró/registró el movimiento faltante
    //  - 'accepted': Jahnn decidió aceptar la diferencia (no investigar más)
    // Default 'pending' aplica también a filas previas a la migración.
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    statusUpdatedAt: timestamp("status_updated_at"),
  },
  (t) => ({
    businessDateUnique: unique("bank_real_checks_business_date_unique").on(t.businessId, t.checkDate),
  })
);
