/**
 * Pagos hechos por error y devueltos · MOTOR (lógica pura).
 *
 * ─── El caso que lo originó ───
 *
 * Fonavi, agosto 2026: Kelly registró S/3,777 como "PAGO MAL EJECUTADO"
 * a Atelier (categoría OTROS, variable). Atelier devolvió cada monto el
 * mismo día o al siguiente, y la devolución entró al banco como ingreso.
 * El gasto se contaba entero; la devolución no, porque las ventas salen
 * de Byte y no del banco. Resultado: el % de variables de agosto saltó a
 * 72% y el punto de equilibrio de Fonavi subió S/2,300 por plata que
 * nunca salió de verdad.
 *
 * ─── Por qué se empareja y no se filtra por texto ───
 *
 * Un gasto que DICE "mal ejecutado" pero cuya devolución no llegó sí es
 * plata que salió: hasta que vuelva, cuenta. Por eso se exige la pareja:
 * el gasto con esa marca Y un ingreso por el MISMO monto, dentro de
 * `DIAS_MAX` días después, cuya nota diga devolución o reembolso. Cada
 * ingreso sirve para un solo gasto.
 *
 * No se tocan los registros: el Excel de Kelly se re-importa entero y
 * cualquier marca manual se perdería en la siguiente subida. La regla
 * vive en la lectura.
 */

export type GastoCandidato = { id: string; date: string; amount: number; concept: string | null };
export type IngresoCandidato = { id: string; date: string; amount: number; note: string | null };

/** Cómo escribe Kelly un pago que salió por error. */
export const MARCA_PAGO_ERRADO = /mal\s+ejecutad|pago\s+doble/i;
/** Cómo escribe Kelly que la plata volvió. */
const MARCA_DEVOLUCION = /devol|reembols/i;
/** Centro, julio 2026: el gasto del 5 se devolvió el 17. */
export const DIAS_MAX = 15;

const dias = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Ids de los gastos que fueron devueltos y no deben contar como costo. */
export function gastosDevueltos(gastos: GastoCandidato[], ingresos: IngresoCandidato[]): Set<string> {
  const devueltos = new Set<string>();
  const usados = new Set<string>();
  const candidatos = gastos
    .filter((g) => MARCA_PAGO_ERRADO.test(g.concept ?? ""))
    .sort((a, b) => a.date.localeCompare(b.date));
  const devoluciones = ingresos
    .filter((i) => MARCA_DEVOLUCION.test(i.note ?? ""))
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const g of candidatos) {
    const par = devoluciones.find((i) => {
      if (usados.has(i.id)) return false;
      if (Math.abs(i.amount - g.amount) >= 0.01) return false;
      const d = dias(g.date, i.date);
      return d >= 0 && d <= DIAS_MAX;
    });
    if (par) {
      usados.add(par.id);
      devueltos.add(g.id);
    }
  }
  return devueltos;
}
