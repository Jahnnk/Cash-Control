/**
 * Los CUATRO reportes de Byte que se suben cada sábado.
 *
 * Pedido de Jahnn (18-ago-2026): "quiero que el sistema cada sábado
 * avise a los administradores en su panel que tienen que subir los 4
 * archivos semanales".
 *
 * ─── Por qué hacía falta mirar los cuatro, y no uno ───
 *
 * El aviso ya nombraba los cuatro, pero el ESTADO (verde/ámbar) miraba
 * solo el de rotación: subiendo ese, la tarjeta se ponía verde aunque
 * faltaran los otros tres. Mirando las subidas reales de agosto:
 *
 *   Fonavi, sábado 15  →  rotación ✓  ventas por trabajador ✓
 *                         cortesías ✗  cambios de precio ✗
 *   Centro, sábado 15  →  rotación ✓  cortesías ✓  ventas ✓
 *                         cambios de precio ✗
 *
 * Y "Cambios de Precio" NO SE HA SUBIDO NUNCA, en ninguna sede, desde
 * que existe el registro. Un aviso que se apaga con un archivo de
 * cuatro no es un control: es una luz verde falsa.
 *
 * ─── El truco: "subido" se lee de las SUBIDAS, no de los datos ───
 *
 * Cortesías y Cambios de Precio pueden venir legítimamente VACÍOS — una
 * semana sin ninguna cortesía es una semana normal. Si se midiera por
 * "¿hay filas?", una semana limpia se vería igual que un archivo que
 * nadie subió.
 *
 * Por eso se mira `import_batches`, que guarda una fila por cada
 * archivo procesado aunque traiga cero registros. Así "no hubo
 * cortesías" y "no subiste el archivo" dejan de confundirse.
 */

export type ClaveReporte = "rotacion" | "cortesias" | "cambios_precio" | "ventas_trabajador";

export const REPORTES_SEMANALES: {
  clave: ClaveReporte;
  nombre: string;
  /** Para qué sirve. El admin cumple mejor cuando entiende el para qué. */
  porQue: string;
}[] = [
  {
    clave: "rotacion",
    nombre: "Platos con Mayor Rotación",
    porQue: "qué se vende y qué no, plato por plato",
  },
  {
    clave: "cortesias",
    nombre: "Cortesías",
    porQue: "separa lo regalado de la venta real",
  },
  {
    clave: "cambios_precio",
    nombre: "Cambios de Precio",
    porQue: "un precio bajado a mano no puede contar como upselling",
  },
  {
    clave: "ventas_trabajador",
    nombre: "Ventas por Trabajador",
    porQue: "el ranking de mejor vendedor",
  },
];

/**
 * De qué reporte es una subida, leyendo la nota que dejó el import.
 * Devuelve null para las subidas que no son de esta rutina (el Excel de
 * Kelly, por ejemplo).
 */
export function claveDesdeNota(nota: string | null | undefined): ClaveReporte | null {
  const n = String(nota ?? "");
  if (/^PIC · rotación/i.test(n)) return "rotacion";
  if (/^Incentivos · cortesias/i.test(n)) return "cortesias";
  if (/^Incentivos · cambios_precio/i.test(n)) return "cambios_precio";
  if (/^Incentivos · ventas por trabajador/i.test(n)) return "ventas_trabajador";
  return null;
}

export type CargaRegistrada = {
  clave: ClaveReporte;
  /** Fecha de la subida en hora de Lima (YYYY-MM-DD). */
  fecha: string;
};

export type EstadoReporte = {
  clave: ClaveReporte;
  nombre: string;
  porQue: string;
  /** Si se subió DESPUÉS del último sábado (o el sábado mismo). */
  subidoEstaSemana: boolean;
  /** Última vez que se subió, alguna vez. null = nunca. */
  ultimaCarga: string | null;
};

export type EstadoSemanal = {
  reportes: EstadoReporte[];
  faltan: EstadoReporte[];
  completo: boolean;
  /** El sábado de esta semana: desde ahí cuenta la subida. */
  sabado: string;
  esSabado: boolean;
  /** Los que NO se han subido NUNCA — más grave que "falta esta semana". */
  nuncaSubidos: EstadoReporte[];
};

/** Sábado más reciente (hoy mismo si hoy es sábado). */
export function sabadoDeLaSemana(hoy: string): string {
  const [y, m, d] = hoy.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  const retro = (f.getUTCDay() - 6 + 7) % 7;
  return new Date(Date.UTC(y, m - 1, d - retro)).toISOString().slice(0, 10);
}

export function evaluarReportesSemanales(
  cargas: CargaRegistrada[],
  hoy: string,
): EstadoSemanal {
  const sabado = sabadoDeLaSemana(hoy);
  const [y, m, d] = hoy.split("-").map(Number);
  const esSabado = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;

  const reportes: EstadoReporte[] = REPORTES_SEMANALES.map((r) => {
    const suyas = cargas.filter((c) => c.clave === r.clave).map((c) => c.fecha).sort();
    const ultima = suyas.length > 0 ? suyas[suyas.length - 1] : null;
    return {
      ...r,
      subidoEstaSemana: ultima !== null && ultima >= sabado,
      ultimaCarga: ultima,
    };
  });

  const faltan = reportes.filter((r) => !r.subidoEstaSemana);
  return {
    reportes,
    faltan,
    completo: faltan.length === 0,
    sabado,
    esSabado,
    nuncaSubidos: reportes.filter((r) => r.ultimaCarga === null),
  };
}

/** "Cortesías y Cambios de Precio" — para nombrarlos en una frase. */
export function nombrarFaltantes(faltan: EstadoReporte[]): string {
  const n = faltan.map((f) => f.nombre);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}
