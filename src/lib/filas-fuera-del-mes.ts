/**
 * Filas del Excel cuya FECHA no pertenece al mes de su pestaña.
 *
 * Detectado el 26-ago-2026 revisando el Excel de Atelier contra el
 * sistema. En la pestaña "Ing&Gtos AGO26" había tres filas con fecha del
 * 12 de JULIO: un ingreso de S/55.00 y dos gastos (12 sacos de harina
 * pastelera S/1,537.80 y su ITF de S/0.05).
 *
 * ─── Por qué es peor que un simple error de tipeo ───
 *
 * Son DOS problemas a la vez, y el segundo es el grave:
 *
 * 1. La celda de totales de la hoja las suma, así que el Excel de Kelly
 *    dice que agosto tuvo S/47,697.34 de ingresos cuando agosto de
 *    verdad tuvo S/47,642.34. El reporte del mes queda mal.
 *
 * 2. SE DUPLICAN EN CADA IMPORTACIÓN. Al importar la hoja de agosto, el
 *    sistema borra lo que ya había importado DE AGOSTO (el mes que dice
 *    el nombre de la pestaña) y vuelve a insertar todo el archivo. La
 *    fila con fecha de julio se inserta… y nunca se borra, porque cae
 *    fuera del rango de limpieza. Cada re-importación deja otra copia.
 *
 *    Cuando se detectó, la harina de Atelier ya estaba CUATRO veces:
 *    S/4,613.40 de más en los egresos de julio. Y julio es uno de los
 *    meses que alimenta la referencia del punto de equilibrio.
 *
 * ─── Por qué se BLOQUEA en vez de corregir sola ───
 *
 * Decisión de Jahnn (26-ago-2026). Importarlas a su mes correcto
 * arreglaría la duplicación pero dejaría el Excel de Kelly con el error
 * adentro: su reporte del mes seguiría descuadrado y el mes anterior,
 * ya cerrado y revisado, cambiaría por detrás.
 *
 * La otra razón es que el sistema no puede saber cuál es la fecha buena.
 * En la pestaña de VENTAS sí se puede (Kelly escribe el día de la
 * semana al lado y eso delata el mes — ver fecha-mes-hoja.ts), pero
 * aquí no hay nada que corrobore: "12/07" tanto puede ser un 12 de
 * julio real pagado tarde como un 12 de agosto mal tecleado. Adivinar
 * mueve dinero de mes sin prueba.
 *
 * Así que se avisa ANTES de importar, con las filas señaladas, y se
 * corrige en el Excel — donde está el error.
 */

export type FilaFueraDelMes = {
  /** Fila del Excel (1-indexed), para encontrarla en la pantalla. */
  excelRow: number;
  fecha: string;
  tipo: "income" | "expense";
  categoria: string;
  monto: number;
  nota: string;
};

export type RevisionFechas = {
  /** El mes que declara el nombre de la pestaña (YYYY-MM). */
  mesHoja: string;
  filas: FilaFueraDelMes[];
  /** Cuánto dinero está mal ubicado, por si hay muchas filas. */
  totalIngresos: number;
  totalEgresos: number;
};

type MovimientoMinimo = {
  excelRow: number;
  date: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  note: string;
};

/**
 * Las filas cuya fecha cae fuera del mes de la pestaña.
 *
 * @param mesHoja mes deducido del nombre de la pestaña ("2026-08"), o
 *                null si no se pudo deducir — en ese caso no se valida
 *                nada: sin un mes de referencia no hay con qué comparar.
 */
export function revisarFechasDelMes(
  movimientos: MovimientoMinimo[],
  mesHoja: string | null,
): RevisionFechas | null {
  if (!mesHoja || !/^\d{4}-\d{2}$/.test(mesHoja)) return null;

  const filas: FilaFueraDelMes[] = [];
  let totalIngresos = 0;
  let totalEgresos = 0;

  for (const m of movimientos) {
    if (!m.date || m.date.slice(0, 7) === mesHoja) continue;
    filas.push({
      excelRow: m.excelRow,
      fecha: m.date,
      tipo: m.type,
      categoria: m.category,
      monto: m.amount,
      nota: m.note,
    });
    if (m.type === "income") totalIngresos += m.amount;
    else totalEgresos += m.amount;
  }

  if (filas.length === 0) return null;

  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.excelRow - b.excelRow);
  return {
    mesHoja,
    filas,
    totalIngresos: Math.round(totalIngresos * 100) / 100,
    totalEgresos: Math.round(totalEgresos * 100) / 100,
  };
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

/** "agosto 2026" a partir de "2026-08". */
export function nombreMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1] ?? mes} ${y}`;
}

/**
 * El mensaje que ve Jahnn. Dice el problema, el efecto en plata y qué
 * hacer — en ese orden, porque lo que necesita saber primero es si
 * puede confiar en el número, no cómo se llama el error.
 */
export function mensajeFechasFueraDelMes(r: RevisionFechas): string {
  const n = r.filas.length;
  const meses = [...new Set(r.filas.map((f) => f.fecha.slice(0, 7)))]
    .sort()
    .map(nombreMes);

  const plata: string[] = [];
  if (r.totalIngresos > 0) plata.push(`S/${r.totalIngresos.toFixed(2)} de ingresos`);
  if (r.totalEgresos > 0) plata.push(`S/${r.totalEgresos.toFixed(2)} de egresos`);

  return (
    `La pestaña de ${nombreMes(r.mesHoja)} tiene ${n} fila${n === 1 ? "" : "s"} ` +
    `con fecha de ${meses.join(" y ")}` +
    (plata.length > 0 ? ` (${plata.join(" y ")})` : "") + ". " +
    `Eso descuadra el total del mes en el Excel y, si se importa, esas filas ` +
    `se duplican cada vez que se vuelva a subir el archivo. ` +
    `Corrige las fechas en el Excel y vuelve a intentarlo.`
  );
}
