/**
 * Leer el saldo REAL del banco del Excel de Kelly.
 *
 * Pedido de Jahnn (17-ago-2026): "no necesariamente el importe del banco
 * va a estar siempre en el mismo número de celda… el sistema deberá ser
 * capaz siempre de darme los valores correctos según el Excel".
 *
 * Tenía razón y el problema es peor que la fila: la columna
 * "Banco Crédito Cta. Cte" tiene VARIAS lecturas, y casi todas son
 * residuos de meses anteriores que Kelly no limpió. En agosto:
 *
 *   Atelier  1 lectura   → 14,345.74
 *   Fonavi   6 lecturas  → 15,594.02, 19,267.45, 20,518.16, 14,429.87,
 *                          13,931.43, 9,020.80
 *   Centro   5 lecturas  →  3,452.83, 12,772.91, 16,855.29, 9,867.37,
 *                           1,112.68
 *
 * Agarrar "la última" da 9,020.80 en Fonavi cuando la buena es 15,594.02.
 * Agarrar "la primera" falla en Centro (3,452.83 es de un corte del 4-ago).
 *
 * ─── Cómo se reconoce la buena ───
 *
 * Kelly pone la lectura del banco AL LADO del saldo que le da su propio
 * libro, para ver la diferencia. La lectura viva es entonces la que está
 * en la fila donde su libro ya llegó al SALDO FINAL — el mismo que tiene
 * la última fila con movimiento. Las de más abajo quedaron de otros
 * meses, cuando el saldo del libro era otro.
 *
 * O sea: se busca por el SALDO que la acompaña, no por su posición. Así
 * da igual en qué fila esté (S113 en Fonavi, S103 en Atelier, S128 en
 * Centro) y da igual cuántos residuos haya debajo.
 *
 * Todo por encabezado, nunca por posición de columna: es la convención
 * del repo y ya costó un bug (el `!ref` cambia si la columna A viene
 * vacía — ver AGENTS.md).
 */

/** Normaliza un encabezado: sin tildes, sin signos, en minúsculas. */
export function normalizarEncabezado(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ENCABEZADOS = {
  fecha: ["fecha"],
  tipo: ["ing gsto", "ing gasto"],
  saldoCtaCte: ["saldo cta cte"],
  bancoReal: ["banco credito cta cte", "banco credito cta cte "],
} as const;

export type SaldoBancoExcel = {
  /** La lectura del banco, tal cual la escribió Kelly. */
  valor: number;
  /** Fila del Excel (1-based) de donde salió — para poder auditarla. */
  fila: number;
  /** El saldo que da SU libro en esa misma fila. */
  saldoLibro: number;
  /**
   * saldoLibro − valor. Es la misma diferencia que Kelly calcula en su
   * columna "Debe Ser 0"; si no es cero, a ella también le falta cuadrar
   * algo, y conviene que Jahnn lo vea en vez de que el sistema lo tape.
   */
  diferencia: number;
  /** Cuántas lecturas había en la columna (las demás son residuos). */
  lecturasEncontradas: number;
};

export type LecturaSaldo =
  | { ok: true; saldo: SaldoBancoExcel }
  | { ok: false; motivo: string };

/**
 * Busca el saldo real del banco en una hoja "Ing&Gtos" ya convertida a
 * matriz de filas (`sheet_to_json` con `header: 1`).
 */
export function leerSaldoBancoExcel(filas: unknown[][]): LecturaSaldo {
  // 1. La fila de encabezados es la que tiene "Fecha". No se asume que
  //    sea la 3: si Kelly agrega una fila arriba, esto sigue andando.
  const filaEnc = filas.findIndex((f) =>
    (f ?? []).some((c) => ENCABEZADOS.fecha.includes(normalizarEncabezado(c) as never)),
  );
  if (filaEnc === -1) {
    return { ok: false, motivo: "No encontré la fila de encabezados (ninguna columna dice 'Fecha')." };
  }

  const enc = filas[filaEnc] ?? [];
  const col = (alts: readonly string[]) =>
    enc.findIndex((c) => alts.includes(normalizarEncabezado(c) as never));

  const cBanco = col(ENCABEZADOS.bancoReal);
  const cSaldo = col(ENCABEZADOS.saldoCtaCte);
  const cTipo = col(ENCABEZADOS.tipo);

  if (cBanco === -1) {
    return { ok: false, motivo: "La hoja no tiene la columna 'Banco Crédito Cta. Cte'." };
  }
  if (cSaldo === -1) {
    return { ok: false, motivo: "La hoja no tiene la columna 'SALDO CTA. CTE.'." };
  }
  if (cTipo === -1) {
    return { ok: false, motivo: "La hoja no tiene la columna 'Ing. / Gsto.'." };
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // 2. El saldo FINAL del libro: el que queda en la última fila que es un
  //    movimiento de verdad (tipo I o G). Más abajo puede haber filas de
  //    relleno con saldos de otros meses.
  let saldoFinal: number | null = null;
  for (let i = filaEnc + 1; i < filas.length; i++) {
    const t = normalizarEncabezado((filas[i] ?? [])[cTipo]);
    if (t !== "i" && t !== "g") continue;
    const s = num((filas[i] ?? [])[cSaldo]);
    if (s !== null) saldoFinal = s;
  }
  if (saldoFinal === null) {
    return { ok: false, motivo: "No pude determinar el saldo final del libro (no hay movimientos con saldo)." };
  }

  // 3. Entre las lecturas del banco, la que acompaña a ese saldo final.
  //    La PRIMERA: las de más abajo son residuos de meses anteriores.
  let elegida: SaldoBancoExcel | null = null;
  let lecturas = 0;
  for (let i = filaEnc + 1; i < filas.length; i++) {
    const v = num((filas[i] ?? [])[cBanco]);
    if (v === null) continue;
    lecturas++;
    if (elegida) continue;
    const s = num((filas[i] ?? [])[cSaldo]);
    if (s === null || Math.abs(s - saldoFinal) > 0.005) continue;
    elegida = {
      valor: Math.round(v * 100) / 100,
      fila: i + 1,
      saldoLibro: Math.round(s * 100) / 100,
      diferencia: Math.round((s - v) * 100) / 100,
      lecturasEncontradas: 0,
    };
  }

  if (!elegida) {
    return {
      ok: false,
      motivo:
        lecturas === 0
          ? "La columna 'Banco Crédito Cta. Cte' está vacía: Kelly no anotó el saldo del banco."
          : "Ninguna lectura del banco está a la altura del saldo final del libro — parecen todas de meses anteriores.",
    };
  }

  return { ok: true, saldo: { ...elegida, lecturasEncontradas: lecturas } };
}
