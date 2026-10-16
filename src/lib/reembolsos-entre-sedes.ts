/**
 * Reconoce cuándo un ingreso NO es una venta sino plata que vuelve de
 * otra sede del grupo.
 *
 * ─── Por qué importa ───
 *
 * Atelier paga la luz, el agua, el gas y el alquiler del local que
 * comparte con Fonavi, y después le cobra su parte. Cuando Fonavi le
 * devuelve esa plata, entra al banco de Atelier como cualquier otro
 * ingreso — pero no es una venta: es recuperar un costo que Atelier
 * adelantó.
 *
 * Si no se marca, el reporte de "Ingresos en cuentas" de Atelier queda
 * inflado. Entre mayo y agosto de 2026 se acumularon S/3,979 así, y ese
 * es justamente el número que Jahnn le muestra a Kelly en la reunión
 * semanal.
 *
 * ─── Cómo se reconoce ───
 *
 * Kelly escribe entre paréntesis QUIÉN PAGA, no de qué se trata. Eso es
 * lo que decide:
 *
 *   "REEMBOLSO POR COMPRA EN SODIMAC (EXPERIENCIAS GASTRONOMICAS YAYIS)"
 *      → paga una empresa del grupo. Sodimac solo dice de qué era la
 *        compra. ES un reembolso entre sedes.
 *
 *   "REEMBOLSO POR EXCESO D COBRO EN COMPRA (ONDA ORGANICA)"
 *      → paga un proveedor. NO es entre sedes: es una devolución
 *        comercial, otra cosa.
 *
 * Por eso la regla mira la EMPRESA, nunca el motivo. Buscar "Sodimac" o
 * "Metro" para decidir sería exactamente el error contrario.
 *
 * También se aceptan las notas que escribía Jahnn a mano antes de que
 * Kelly cargara todo ("Reembolso Fonavi — Agua 1er piso"), donde la sede
 * va en el texto y no entre paréntesis.
 *
 * ─── Sin la palabra «reembolso» (16-oct-2026) ───
 *
 *   "ALQUILER OCTUBRE 2026 (EXPERIENCIAS GASTRONOMICAS YAYIS SRL)" S/1,000
 *      → la parte de Fonavi del alquiler, pagada por adelantado. No dice
 *        «reembolso» y Kelly la puso en OTROS: el importador la contó como
 *        ingreso de Atelier (conciliación de setiembre con Jahnn).
 *
 * Si paga una empresa del grupo y el concepto es un costo que se comparte
 * (alquiler, luz, agua, gas, internet), también es plata que vuelve. Solo
 * esos costos: un pago de Fonavi por productos de Atelier SÍ es venta.
 */

/** Las razones sociales del grupo. Si una de estas paga, es entre sedes. */
const EMPRESAS_DEL_GRUPO = [
  "EXPERIENCIAS GASTRONOMICAS",
  "PRODUCTOS SALUDABLES",
  // Centro. Kelly a veces escribe «SERVCIOS» (Fonavi, oct-2026).
  "SERVICIOS GASTRONOMICOS",
  "SERVCIOS GASTRONOMICOS",
];

/** Costos del local que se reparten entre sedes. Palabra completa: «GAS» no es «GASTRONOMICAS». */
const COSTO_COMPARTIDO = /\b(ALQUILER|LUZ|AGUA|GAS|INTERNET)\b/;

/** Los nombres con que Jahnn se refiere a cada sede en sus notas. */
const SEDES = ["FONAVI", "CENTRO", "ATELIER"];

/** Palabras que indican que la plata está VOLVIENDO, no entrando por venta. */
const VUELVE = ["REEMBOLSO", "REEMBOLZO", "DEVOLUCION", "DEVOLUCIÓN", "REINTEGRO"];

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export type OrigenReembolso = "grupo" | "tercero" | "no-es-reembolso";

export type EvaluacionReembolso = {
  origen: OrigenReembolso;
  /** Quién devolvió, cuando se pudo identificar. */
  quien: string | null;
  motivo: string;
};

/**
 * ¿Este ingreso es plata que vuelve de otra sede?
 *
 * Solo `origen: "grupo"` se marca como reembolso entre sedes. Un
 * "tercero" es una devolución de proveedor: tampoco es venta, pero no se
 * toca acá — se deja a la vista en vez de esconderla bajo una etiqueta
 * que significa otra cosa.
 */
export function evaluarReembolso(nota: string | null | undefined): EvaluacionReembolso {
  const texto = normalizar(String(nota ?? ""));
  if (!texto.trim()) {
    return { origen: "no-es-reembolso", quien: null, motivo: "Sin descripción." };
  }

  const vuelve = VUELVE.some((p) => texto.includes(normalizar(p)));
  const empresaSinPalabra = !vuelve && COSTO_COMPARTIDO.test(texto) ? EMPRESAS_DEL_GRUPO.find((e) => texto.includes(e)) : undefined;
  if (empresaSinPalabra) {
    return { origen: "grupo", quien: empresaSinPalabra, motivo: `Lo paga ${empresaSinPalabra}, que es del grupo, por un costo compartido.` };
  }
  if (!vuelve) {
    return { origen: "no-es-reembolso", quien: null, motivo: "No dice que sea una devolución." };
  }

  const empresa = EMPRESAS_DEL_GRUPO.find((e) => texto.includes(e));
  if (empresa) {
    return {
      origen: "grupo",
      quien: empresa,
      motivo: `Lo devuelve ${empresa}, que es del grupo.`,
    };
  }

  const sede = SEDES.find((s) => texto.includes(s));
  if (sede) {
    return {
      origen: "grupo",
      quien: sede,
      motivo: `La nota dice que lo devuelve ${sede}.`,
    };
  }

  return {
    origen: "tercero",
    quien: null,
    motivo: "Es una devolución, pero no de otra sede — parece de un proveedor.",
  };
}

/** true si hay que marcarlo como reembolso entre sedes. */
export function esReembolsoEntreSedes(nota: string | null | undefined): boolean {
  return evaluarReembolso(nota).origen === "grupo";
}
