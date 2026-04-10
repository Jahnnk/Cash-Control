export const EXPENSE_CATEGORIES = [
  "Insumos",
  "Deliverys",
  "Planilla",
  "Alquiler",
  "SUNAT",
  "Ss Bancarios",
  "Préstamos",
  "Limpieza",
  "Mantenimientos",
  "Oficina",
  "Fletes",
  "Vueltos y Devoluciones",
  "Otros",
] as const;

export const PAYMENT_PATTERNS = [
  { value: "interdiario", label: "Interdiario" },
  { value: "7dias", label: "7 días" },
  { value: "15dias", label: "15 días" },
  { value: "30dias", label: "30 días" },
  { value: "variable", label: "Variable" },
] as const;

export const CLIENT_TYPES = [
  { value: "familia", label: "Familia" },
  { value: "b2b", label: "B2B" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
