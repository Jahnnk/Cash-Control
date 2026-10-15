/**
 * El sueldo de los socios dentro de la planilla (Profit First, 15-oct-2026).
 *
 * El método de Profit First pide que el sueldo de los dueños no se camufle en los
 * costos fijos: se paga de la utilidad. Hoy está dentro de PLANILLA de dos formas, y
 * el sistema las reconoce SIN tocar ningún dato (por el concepto, auditable):
 *
 *   · «SUELDO <mes> (JAHNN KARLO ROJAS)» / «(JUANI TERRONES)» — S/500 c/u en Fonavi y en Centro.
 *   · «PRESTAMOS VEHICULAR» — el débito del día 22 que en la práctica es la planilla de
 *     Jahnn y Juani por Atelier (decisión de Jahnn, 17-sep-2026).
 *
 * Las «UTILIDADES A SOCIOS» (adelanto de utilidades de Centro) ya están fuera de los costos.
 */

const SOCIOS = ["JAHNN KARLO ROJAS", "JUANI TERRONES"];

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** ¿Esta fila de gasto es sueldo de un socio? Solo dentro de PLANILLA: el resto de lo que gestionan los socios (suscripciones, compras) es gasto del negocio. */
export function esSueldoDeSocio(categoria: string, concepto: string | null | undefined): boolean {
  if (categoria !== "PLANILLA" || !concepto) return false;
  const t = sinTildes(concepto);
  if (/PRESTAMOS?\s+VEHICULAR/.test(t)) return true;
  return SOCIOS.some((s) => t.includes(`(${s})`));
}
