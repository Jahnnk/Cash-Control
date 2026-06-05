/**
 * Cálculo canónico ÚNICO del desglose de egresos para el Estado de Resultados
 * y su comparativo "mes anterior". Antes había dos rutas paralelas (el reporte
 * directo lo computaba en JS y el comparativo con un JOIN SQL sin scope de
 * negocio que multiplicaba los egresos financieros ×N negocios). Esta función
 * pura es la única fuente de verdad: el mismo conjunto de filas + el mismo
 * predicado de "categoría financiera" producen siempre el mismo resultado,
 * para cualquier rango de fechas.
 *
 * Definición (regla del reporte directo, que es la correcta):
 *  - Cada fila aporta su PORCIÓN-Atelier: is_shared ? atelier_amount : amount.
 *  - "financial" = porción-Atelier de las categorías marcadas
 *    exclude_from_ebitda (clasificación business-scoped via el predicado).
 *  - "operative" = atelierTotal − financial (lo que entra al EBITDA).
 *  - "gross" = SUMA de los montos COMPLETOS (lo que Atelier desembolsó,
 *    incluida la parte que le reembolsa Fonavi en gastos compartidos).
 *  - "fonaviShared" = gross − atelierTotal = porción de Fonavi en compartidos
 *    (la línea de reconciliación: gross − fonaviShared − financial = operative).
 *
 * Las filas que se pasan ya deben venir filtradas (is_special_loan=false,
 * is_internal_transfer=false, archived=false, payment_method≠'pendiente_atelier').
 * Cada fila se cuenta UNA sola vez (no hay JOIN que la multiplique).
 */

export type ExpenseLike = {
  amount: number;
  isShared: boolean;
  /** Porción imputada a Atelier en gastos compartidos (= amount si no es shared). */
  atelierAmount: number;
  category: string;
};

export type ExpenseSplit = {
  gross: number;          // desembolso total (montos completos)
  atelierTotal: number;   // porción-Atelier de todo
  financial: number;      // porción-Atelier de categorías excluidas del EBITDA
  operative: number;      // atelierTotal − financial (base EBITDA)
  fonaviShared: number;   // gross − atelierTotal (porción Fonavi de compartidos)
  count: number;
};

export function splitExpenses(
  expenses: ExpenseLike[],
  isExcludedCategory: (category: string) => boolean,
): ExpenseSplit {
  let gross = 0;
  let atelierTotal = 0;
  let financial = 0;
  for (const e of expenses) {
    const atelier = e.isShared ? e.atelierAmount : e.amount;
    gross += e.amount;
    atelierTotal += atelier;
    if (isExcludedCategory(e.category)) financial += atelier;
  }
  return {
    gross,
    atelierTotal,
    financial,
    operative: atelierTotal - financial,
    fonaviShared: gross - atelierTotal,
    count: expenses.length,
  };
}
