/** Textos de meses para la ficha de un producto (pedido de Jahnn, 12-nov-2026) · lógica pura. */

const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** «2026-10» → «Octubre 2026». */
export const mesLargo = (m: string) => `${MESES_LARGOS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Los meses que suman la venta y las unidades de la tarjeta: «total de octubre 2026» o «total de agosto a octubre 2026 (3 meses)». */
export function textoTramo(meses: string[]): string {
  if (meses.length === 0) return "sin meses con datos";
  const [a, b] = [meses[0], meses[meses.length - 1]];
  if (meses.length === 1) return `total de ${mesLargo(a).toLowerCase()}`;
  const desde = a.slice(0, 4) === b.slice(0, 4) ? MESES_LARGOS[Number(a.slice(5, 7)) - 1].toLowerCase() : mesLargo(a).toLowerCase();
  return `total de ${desde} a ${mesLargo(b).toLowerCase()} (${meses.length} meses)`;
}
