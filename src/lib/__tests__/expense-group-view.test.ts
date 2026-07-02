/**
 * Tests de la lógica pura de grupos visuales de egresos.
 * Garantía central: plegar NO cambia ningún monto — la suma de las filas
 * del feed (sueltos + totales de grupo) es idéntica a la suma de los
 * egresos individuales.
 */
import { describe, it, expect } from "vitest";
import { foldExpenseGroups, canGroupSelection } from "../expense-group-view";

type E = {
  id: string;
  amount: number;
  bcpVerifiedAt: string | null;
  group_id?: string | null;
  group_label?: string | null;
  date?: string;
};

const mk = (id: string, amount: number, group?: string, verified = false): E => ({
  id,
  amount,
  bcpVerifiedAt: verified ? "2026-07-01T10:00:00Z" : null,
  group_id: group ?? null,
  group_label: group ? `Grupo ${group}` : null,
});

describe("foldExpenseGroups", () => {
  it("sin grupos: cada egreso es una fila suelta, en el mismo orden", () => {
    const rows = foldExpenseGroups([mk("a", 10), mk("b", 20)]);
    expect(rows.map((r) => r.kind)).toEqual(["single", "single"]);
  });

  it("agrupa por group_id en la posición del primer miembro y suma exacto", () => {
    const rows = foldExpenseGroups([
      mk("a", 299, "g1"),
      mk("b", 50),
      mk("c", 155.5, "g1"),
      mk("d", 112.3, "g1"),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["group", "single"]);
    const g = rows[0].kind === "group" ? rows[0].group : null;
    expect(g!.members.map((m) => m.id)).toEqual(["a", "c", "d"]);
    expect(g!.total).toBe(566.8);
    expect(g!.label).toBe("Grupo g1");
  });

  it("la suma del feed plegado = suma de los egresos individuales (nada cambia)", () => {
    // 26 gastos con céntimos (como la reposición real de S/1,051.65).
    const expenses = Array.from({ length: 26 }, (_, i) =>
      mk(`e${i}`, Math.round((Math.sin(i + 1) ** 2) * 9000 + 33) / 100, i % 2 === 0 ? "g1" : undefined),
    );
    const individual = Math.round(expenses.reduce((s, e) => s + e.amount * 100, 0)) / 100;
    const rows = foldExpenseGroups(expenses);
    const folded =
      Math.round(
        rows.reduce(
          (s, r) => s + (r.kind === "single" ? r.expense.amount : r.group.total) * 100,
          0,
        ),
      ) / 100;
    expect(folded).toBeCloseTo(individual, 2);
  });

  it("allVerified/someVerified reflejan el estado de los miembros", () => {
    const all = foldExpenseGroups([mk("a", 1, "g", true), mk("b", 2, "g", true)]);
    const some = foldExpenseGroups([mk("a", 1, "g", true), mk("b", 2, "g")]);
    const none = foldExpenseGroups([mk("a", 1, "g"), mk("b", 2, "g")]);
    expect(all[0].kind === "group" && all[0].group.allVerified).toBe(true);
    expect(some[0].kind === "group" && some[0].group.allVerified).toBe(false);
    expect(some[0].kind === "group" && some[0].group.someVerified).toBe(true);
    expect(none[0].kind === "group" && none[0].group.someVerified).toBe(false);
  });

  it("dos grupos distintos no se mezclan", () => {
    const rows = foldExpenseGroups([
      mk("a", 1, "g1"),
      mk("b", 2, "g2"),
      mk("c", 3, "g1"),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind === "group" && rows[0].group.total).toBe(4);
    expect(rows[1].kind === "group" && rows[1].group.total).toBe(2);
  });
});

describe("canGroupSelection", () => {
  const sel = (id: string, date: string, group?: string) => ({ id, date, group_id: group ?? null });

  it("acepta 2+ egresos del mismo día sin grupo previo", () => {
    expect(canGroupSelection([sel("a", "2026-07-01"), sel("b", "2026-07-01")])).toEqual({ ok: true });
  });

  it("rechaza selección de un solo egreso", () => {
    const r = canGroupSelection([sel("a", "2026-07-01")]);
    expect(r.ok).toBe(false);
  });

  it("rechaza egresos de días distintos (el banco cobra por día)", () => {
    const r = canGroupSelection([sel("a", "2026-07-01"), sel("b", "2026-07-02")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/mismo día/);
  });

  it("rechaza si alguno ya pertenece a un grupo", () => {
    const r = canGroupSelection([sel("a", "2026-07-01", "g1"), sel("b", "2026-07-01")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ya pertenece/);
  });
});
