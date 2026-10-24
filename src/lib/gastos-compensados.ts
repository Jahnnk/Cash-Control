/**
 * Gastos no ejecutados o «a rendir» que vuelven el mismo mes · MOTOR (lógica pura).
 *
 * Auditoría de setiembre 2026 (24-oct-2026): Centro le dio plata a Rosario Reyes para un gasto que no se hizo
 * (S/10.90 el 25/09 y S/33.20 el 29/09) y ella la devolvió (25/09 y 30/09). El Excel registra las dos patas:
 * el gasto (Grupo OTROS → POR ACLARAR, contado como gasto fijo) y la devolución (un ingreso que caía en «otros
 * ingresos»). La plata nunca se gastó: las seis cifras deben verlo como CERO, no como S/44.10 de gasto y S/44.10
 * de ingreso. En lo que entró y salió de la cuenta (total de ingresos y de egresos) siguen las dos filas: el
 * dinero sí se movió.
 *
 * La pareja se exige, no se filtra por texto: un «A RENDIR» sin su devolución sí es plata que salió.
 *   · mismo monto (al céntimo) y mismo mes; la devolución el mismo día o después;
 *   · la misma persona (el nombre entre paréntesis al final, que pone el importador);
 *   · y el ingreso dice «GASTO NO EJECUTADO» / «A RENDIR», o repite el concepto del gasto
 *     (con o sin «DEVOLUCIÓN POR» delante).
 * Solo cuentan ingresos de la operación (no ventas, no reembolsos entre sedes, no préstamos): esos ya tienen su
 * propia regla. Cada ingreso compensa un solo gasto. No se toca ningún registro: la regla vive en la lectura.
 */

export type GastoCompensable = { id: string; fecha: string; monto: number; concepto: string | null };
export type IngresoCompensable = { id: string; fecha: string; monto: number; nota: string | null };
export type Compensacion = { gastoId: string; ingresoId: string; monto: number; persona: string; fecha: string; concepto: string };

const norm = (t: string | null | undefined) =>
  String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/** La persona: lo que está entre paréntesis al final (el importador pone ahí al proveedor). */
export function personaDe(texto: string | null | undefined): string {
  const m = /\(([^()]*)\)\s*(?:\[[^\]]*\]\s*)*$/.exec(norm(texto));
  return m ? m[1].trim() : "";
}

/** El concepto sin la persona, sin etiquetas y sin «DEVOLUCIÓN POR» delante. */
function base(texto: string | null | undefined): string {
  return norm(texto)
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^()]*\)\s*$/, "")
    .replace(/^DEVOLUCION(ES)?\s+(POR|DE)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cómo escribe Kelly que la plata de un gasto no se usó. */
const MARCA_NO_EJECUTADO = /\bGASTOS? NO EJECUTAD|\bA RENDIR\b/;

export function compensarGastosNoEjecutados(gastos: GastoCompensable[], ingresos: IngresoCompensable[]): Compensacion[] {
  const usados = new Set<string>();
  const out: Compensacion[] = [];
  const ordenados = [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const candidatos = [...ingresos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  for (const g of ordenados) {
    const persona = personaDe(g.concepto);
    if (!persona) continue;
    const bg = base(g.concepto);
    const par = candidatos.find((i) =>
      !usados.has(i.id)
      && Math.abs(i.monto - g.monto) < 0.005
      && i.fecha.slice(0, 7) === g.fecha.slice(0, 7)
      && i.fecha >= g.fecha
      && personaDe(i.nota) === persona
      && (MARCA_NO_EJECUTADO.test(norm(i.nota)) || (bg !== "" && base(i.nota) === bg)));
    if (!par) continue;
    usados.add(par.id);
    out.push({ gastoId: g.id, ingresoId: par.id, monto: Math.round(g.monto * 100) / 100, persona, fecha: g.fecha, concepto: String(g.concepto ?? "") });
  }
  return out;
}
