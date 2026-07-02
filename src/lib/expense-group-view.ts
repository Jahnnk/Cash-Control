/**
 * Lógica pura de la vista de grupos visuales de egresos.
 *
 * Un grupo une egresos del mismo día que en el banco son UN solo cargo.
 * Esta lib decide cómo se pliega la lista para mostrarla: NO toca montos
 * ni saldos (los totales del día siguen sumando cada gasto individual).
 */

export type GroupableExpense = {
  id: string;
  amount: number;
  bcpVerifiedAt: string | null;
  group_id?: string | null;
  group_label?: string | null;
};

export type ExpenseGroupView<T extends GroupableExpense> = {
  groupId: string;
  label: string;
  members: T[];
  total: number;
  allVerified: boolean;
  someVerified: boolean;
};

/** Fila del feed: o un gasto suelto, o un grupo plegado. */
export type ExpenseFeedRow<T extends GroupableExpense> =
  | { kind: "single"; expense: T }
  | { kind: "group"; group: ExpenseGroupView<T> };

/**
 * Pliega la lista de egresos de un día en filas de feed. El grupo aparece
 * en la posición de su primer miembro (respeta el orden de llegada) y sus
 * miembros conservan ese mismo orden dentro del grupo.
 */
export function foldExpenseGroups<T extends GroupableExpense>(
  expenses: T[],
): ExpenseFeedRow<T>[] {
  const rows: ExpenseFeedRow<T>[] = [];
  const byGroup = new Map<string, ExpenseGroupView<T>>();
  for (const e of expenses) {
    if (!e.group_id) {
      rows.push({ kind: "single", expense: e });
      continue;
    }
    let g = byGroup.get(e.group_id);
    if (!g) {
      g = {
        groupId: e.group_id,
        label: e.group_label || "Grupo de egresos",
        members: [],
        total: 0,
        allVerified: true,
        someVerified: false,
      };
      byGroup.set(e.group_id, g);
      rows.push({ kind: "group", group: g });
    }
    g.members.push(e);
    g.total = Math.round((g.total + e.amount) * 100) / 100;
    if (e.bcpVerifiedAt) g.someVerified = true;
    else g.allVerified = false;
  }
  return rows;
}

/**
 * ¿La selección puede agruparse? Reglas: 2+ egresos, todos del mismo día,
 * ninguno ya agrupado. Devuelve el motivo si no se puede (para el tooltip).
 */
export function canGroupSelection(
  selected: { id: string; date: string; group_id?: string | null }[],
): { ok: true } | { ok: false; reason: string } {
  if (selected.length < 2) {
    return { ok: false, reason: "Selecciona al menos 2 egresos para agrupar." };
  }
  if (new Set(selected.map((e) => e.date)).size > 1) {
    return { ok: false, reason: "Solo se pueden agrupar egresos del mismo día." };
  }
  if (selected.some((e) => e.group_id)) {
    return { ok: false, reason: "Alguno de los egresos ya pertenece a un grupo." };
  }
  return { ok: true };
}
