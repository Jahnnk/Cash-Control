import { pgTable, uuid, text, numeric, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'familia' | 'b2b'
  paymentPattern: text("payment_pattern"), // 'interdiario' | '7dias' | '15dias' | '30dias' | 'variable'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Daily record from Byte + Bank
export const dailyRecords = pgTable("daily_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull().unique(),
  // Byte fields
  byteCash: numeric("byte_cash", { precision: 10, scale: 2 }).default("0"),
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
});

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(),
  category: text("category").notNull(),
  concept: text("concept").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").default("transferencia").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Keep these for backward compat but daily_records is the main source
export const sales = pgTable("sales", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0").notNull(),
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  isCollected: boolean("is_collected").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  date: date("date").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  saleId: uuid("sale_id").references(() => sales.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auditoría de ediciones/eliminaciones de movimientos (ingresos BCP y egresos)
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  action: text("action").notNull(),               // 'edit' | 'delete'
  recordId: uuid("record_id").notNull(),
  recordType: text("record_type").notNull(),      // 'income_item' | 'expense'
  beforeData: jsonb("before_data").notNull(),
  afterData: jsonb("after_data"),
  userNote: text("user_note"),
  dateAffected: date("date_affected").notNull(),
});

export const bankBalance = pgTable("bank_balance", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull().unique(),
  openingBalance: numeric("opening_balance", { precision: 10, scale: 2 }),
  closingBalance: numeric("closing_balance", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
