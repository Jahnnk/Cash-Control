/**
 * Conciliar la fecha de una fila con el mes de la hoja.
 *
 * Pedido de Jahnn (17-ago-2026): "Kelly se confunde con las fechas…
 * como copia y pega la pestaña del mes anterior no se fija en las fechas
 * correctas… ¿puedes hacer que el sistema se dé cuenta de esto?".
 *
 * El caso real, en "Control de VTAS-AGO" de Centro y de Atelier: los
 * primeros días van bien (1/8, 2/8… 6/8) y a partir del séptimo se le
 * escapa el mes — 7/7, 8/7, 9/7 y así hasta el final. 25 de 31 fechas.
 *
 * ─── Lo que delata el mes correcto: el día de la semana ───
 *
 * Kelly escribe al lado el nombre del día, y ESE sí lo corrige. La fila
 * que dice "7/7/2026 · Viernes" no puede ser julio: el 7 de julio de
 * 2026 fue martes. El 7 de AGOSTO sí fue viernes. En los 25 casos pasa
 * lo mismo, así que no es casualidad ni interpretación: es una prueba.
 *
 * Y el dato confirma que son días de agosto de verdad, no una copia de
 * julio: esa fila vale S/2,287.60, mientras que el 7 de julio real (en
 * la hoja de julio) vale S/1,212.65. Son ventas distintas.
 *
 * ─── Por qué NO se corrige a ciegas ───
 *
 * Sin el día de la semana no hay prueba, solo una suposición. Y meter
 * ventas en el mes equivocado es peor que perderlas: descuadra el mes
 * cerrado, el comparativo y el deck de la reunión. Así que sin
 * corroboración se mantiene lo de antes (descartar) pero AVISANDO — que
 * era el problema real: hasta ahora se descartaba en silencio.
 */

const DIAS_SEMANA = [
  "domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado",
];

/** Quita tildes y mayúsculas para comparar "Miércoles" con "miercoles". */
function normalizarDia(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .trim();
}

/** Día de la semana (0=domingo) de una fecha ISO, sin líos de zona horaria. */
function diaSemanaDe(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** ¿Existe ese día en ese mes? (31 de abril no existe.) */
function fechaValida(year: number, month: number, day: number): boolean {
  const f = new Date(Date.UTC(year, month - 1, day));
  return f.getUTCFullYear() === year && f.getUTCMonth() === month - 1 && f.getUTCDate() === day;
}

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export type ResultadoFecha =
  /** La fecha ya estaba en el mes de la hoja. */
  | { estado: "ok"; fecha: string }
  /** Estaba en otro mes pero el día de la semana probó cuál era el bueno. */
  | { estado: "corregida"; fecha: string; original: string; motivo: string }
  /** Está fuera del mes y no hay con qué probar que sea un error. */
  | { estado: "descartada"; original: string; motivo: string };

export function conciliarFechaConHoja(input: {
  /** Fecha ya parseada de la celda, en YYYY-MM-DD. */
  fecha: string;
  /** Texto de la columna "Día" ("Viernes"). Sin esto no se corrige nada. */
  diaSemana?: unknown;
  /** Mes y año que dice el nombre de la hoja. */
  mesHoja: { year: number; month: number };
}): ResultadoFecha {
  const { fecha, mesHoja } = input;
  const [fy, fm, fd] = fecha.split("-").map(Number);

  if (fy === mesHoja.year && fm === mesHoja.month) return { estado: "ok", fecha };

  const etiqueta = normalizarDia(input.diaSemana);

  // Candidata: el mismo día, pero en el mes de la hoja.
  if (!fechaValida(mesHoja.year, mesHoja.month, fd)) {
    return {
      estado: "descartada",
      original: fecha,
      motivo: `el día ${fd} no existe en el mes de la hoja`,
    };
  }
  const candidata = iso(mesHoja.year, mesHoja.month, fd);

  if (!etiqueta) {
    return {
      estado: "descartada",
      original: fecha,
      motivo: "está fuera del mes de la hoja y no hay día de la semana para comprobarlo",
    };
  }

  const cuadraCandidata = DIAS_SEMANA[diaSemanaDe(candidata)] === etiqueta;
  const cuadraEscrita = DIAS_SEMANA[diaSemanaDe(fecha)] === etiqueta;

  // El día de la semana coincide con el mes de la hoja: es un mes mal
  // tecleado, y hay prueba.
  if (cuadraCandidata && !cuadraEscrita) {
    return {
      estado: "corregida",
      fecha: candidata,
      original: fecha,
      motivo: `dice ${capitalizar(etiqueta)}, que corresponde al ${fd} del mes de la hoja, no al ${fecha}`,
    };
  }

  // La fecha escrita es coherente consigo misma: es de otro mes DE
  // VERDAD (un arrastre, un total, una validación). Se descarta como
  // siempre — pero ahora se sabe por qué.
  if (cuadraEscrita) {
    return {
      estado: "descartada",
      original: fecha,
      motivo: "la fecha y su día de la semana concuerdan entre sí: es de otro mes de verdad",
    };
  }

  return {
    estado: "descartada",
    original: fecha,
    motivo: "está fuera del mes de la hoja y el día de la semana no concuerda con ninguna opción",
  };
}

function capitalizar(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Resumen para avisarle a Jahnn de un vistazo. */
export function resumenCorrecciones(
  correcciones: { original: string; fecha: string }[],
): string {
  if (correcciones.length === 0) return "";
  const mesDe = (f: string) => f.slice(0, 7);
  const desde = [...new Set(correcciones.map((c) => mesDe(c.original)))].join(", ");
  const hacia = [...new Set(correcciones.map((c) => mesDe(c.fecha)))].join(", ");
  const ejemplo = correcciones[0];
  return (
    `Se corrigieron ${correcciones.length} ${correcciones.length === 1 ? "fecha" : "fechas"} ` +
    `de ${desde} a ${hacia} (ej. ${ejemplo.original} → ${ejemplo.fecha}). ` +
    `El día de la semana que escribió Kelly confirma el mes de la hoja.`
  );
}
