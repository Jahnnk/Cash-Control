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
    businessId: integer("business_id").notNull().default(1).references(() => businesses.id),
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
    businessId: integer("business_id").notNull().default(1).references(() => businesses.id),
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
  },
  (t) => ({
    businessIdx: index("idx_expenses_business_id").on(t.businessId),
  })
);

/**
 * Ingresos individuales registrados al banco (multi-tenant).
 * client_id solo se usa en Atelier (cobranza B2B); en Fonavi/Centro queda NULL.
 */
export const bankIncomeItems = pgTable(
  "bank_income_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().default(1).references(() => businesses.id),
    date: date("date").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    clientId: uuid("client_id"),
    note: text("note"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isFonaviReimbursement: boolean("is_fonavi_reimbursement").default(false).notNull(),
    receivableId: uuid("receivable_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
    businessId: integer("business_id").notNull().default(1).references(() => businesses.id),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    excludeFromEbitda: boolean("exclude_from_ebitda").default(false).notNull(),
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
    businessId: integer("business_id").notNull().default(1).references(() => businesses.id),
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
 * Auditoría de ediciones/eliminaciones (multi-tenant).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    businessId: integer("business_id").notNull().default(1).references(() => businesses.id),
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
