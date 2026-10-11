/**
 * Los TRES reportes de Byte que se suben cada sábado.
 *
 * Pedido de Jahnn (18-ago-2026): "quiero que el sistema cada sábado
 * avise a los administradores en su panel que tienen que subir los
 * archivos semanales".
 *
 * ─── Eran cuatro hasta el 31-ago-2026 ───
 *
 * "Cambios de Precio" salió de la rutina porque desapareció el problema
 * que vigilaba: Jahnn le quitó a los asesores de venta y a caja la
 * opción de cambiar precios, y ahora solo un administrador puede
 * hacerlo. Un reporte que vigila a quien ya no puede hacer la acción no
 * controla nada; solo entrena a ignorar avisos.
 *
 * Es el mismo camino que ya recorrió "Pedidos Anulados" en jul-2026.
 * Nada se borra: el parser sigue leyendo el archivo si alguien lo sube,
 * la alerta de concentración por usuario sigue viva en el motor de
 * incentivos, y las subidas históricas se siguen reconociendo. Lo único
 * que cambia es que ya no se PIDE cada sábado.
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

/**
 * `cambios_precio` sigue existiendo aunque ya no se pida cada sábado:
 * hay subidas históricas en `import_batches` que hay que poder
 * clasificar, y el archivo se sigue aceptando si un administrador lo
 * sube por su cuenta.
 */
export type ClaveReporte =
  | "ventas_mes" | "rotacion" | "cortesias" | "cambios_precio" | "ventas_trabajador"
  // Solo Atelier (10-oct-2026): sus dos archivos de cobros. El «Reporte de
  // Ventas» además trae la venta de cada día y los clientes, así que Luis ya
  // no sube «Ventas de <MES>» ni «Ventas por Cliente».
  | "reporte_ventas" | "consolidado";

export const REPORTES_SEMANALES: {
  clave: ClaveReporte;
  nombre: string;
  /** Para qué sirve. El admin cumple mejor cuando entiende el para qué. */
  porQue: string;
}[] = [
  // Desde el 10-oct-2026 la venta del mes de Byte la sube SOLO la sede
  // (auditoría de fricción: antes también la subía Jahnn, el mismo archivo
  // dos veces). Hasta entonces iba por un botón aparte que la rutina no
  // vigilaba, y Fonavi llevaba sin subirla desde el 19-set sin que nadie lo
  // notara. Su "subida" no se lee de import_batches sino de byte_ventas_daily
  // (ver `cargaDeVentas`).
  {
    clave: "ventas_mes",
    nombre: "Ventas del mes",
    porQue: "la venta oficial de cada día",
  },
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
    clave: "ventas_trabajador",
    nombre: "Ventas por Trabajador",
    porQue: "el ranking de mejor vendedor",
  },
];

/**
 * Qué reportes le tocan a CADA sede.
 *
 * Atelier no es una cafetería, es el centro de PRODUCCIÓN, y tres de
 * los cuatro archivos no existen en su operación (decisión de Jahnn,
 * 24-ago-2026):
 *
 *   · Cortesías — no atiende público, no regala nada en mostrador.
 *   · Ventas por Trabajador — su único "vendedor" es Luis, el propio
 *     administrador. Un ranking de una persona no es un ranking.
 *
 * Los dos existen para sostener el bono por ticket promedio, y ese bono
 * hoy solo corre en Fonavi y Centro. Pedirle a Luis que suba archivos
 * vacíos no controla nada: enseña a ignorar los avisos.
 *
 * Si mañana Atelier entra al bono, se le agregan las claves acá y todo
 * lo demás sigue funcionando igual.
 */
export const REPORTES_POR_SEDE: Record<number, ClaveReporte[]> = {
  1: ["reporte_ventas", "consolidado", "rotacion"],   // Atelier — producción
};

/** Los de Atelier que no existen en las cafeterías (no van en la lista por defecto). */
const SOLO_ATELIER: typeof REPORTES_SEMANALES = [
  { clave: "reporte_ventas", nombre: "Reporte de Ventas", porQue: "la venta de cada día, los clientes y los cobros" },
  { clave: "consolidado", nombre: "Consolidado de Facturas", porQue: "el RUC de cada cliente y las facturas anuladas" },
];

/**
 * Las subidas de los reportes de cobros de Atelier (tabla invoice_imports,
 * `tipo_reporte` 'ventas' o 'facturas', con la fecha de Lima de la subida).
 */
export function cargasDeCobros(filas: { tipo: string; fecha: string | null }[]): CargaRegistrada[] {
  const out: CargaRegistrada[] = [];
  for (const f of filas) {
    if (!f.fecha) continue;
    if (f.tipo === "ventas") out.push({ clave: "reporte_ventas", fecha: f.fecha });
    else if (f.tipo === "facturas") out.push({ clave: "consolidado", fecha: f.fecha });
  }
  return out;
}

/**
 * La subida de "Ventas del mes" como carga de la rutina. El import de ese
 * reporte no deja fila en import_batches: se toma la última vez que entró
 * un reporte oficial a byte_ventas_daily (source = 'import', fecha de Lima).
 */
export function cargaDeVentas(ultimaSubida: string | null | undefined): CargaRegistrada[] {
  return ultimaSubida ? [{ clave: "ventas_mes", fecha: ultimaSubida }] : [];
}

/** Los reportes que aplican a una sede, en el orden en que se le piden. Por defecto, los cuatro de las cafeterías. */
export function reportesDeLaSede(businessId?: number) {
  const claves = businessId != null ? REPORTES_POR_SEDE[businessId] : undefined;
  if (!claves) return REPORTES_SEMANALES;
  const catalogo = [...REPORTES_SEMANALES, ...SOLO_ATELIER];
  return claves.map((k) => catalogo.find((r) => r.clave === k)!).filter(Boolean);
}

/**
 * De qué reporte es una subida, leyendo la nota que dejó el import.
 * Devuelve null para las subidas que no son de esta rutina (el Excel de
 * Kelly, por ejemplo).
 */
export function claveDesdeNota(nota: string | null | undefined): ClaveReporte | null {
  const n = String(nota ?? "");
  // El de rotación se sube por dos caminos y cada uno deja su propia
  // nota: "PIC · rotación semanal desde Panel de Sede" (el admin) y
  // "PIC · ventas por producto (Byte rotación)" (dirección, desde
  // Productos). Cuentan los dos: la pregunta es si el reporte entró,
  // no por qué puerta. OJO: "(Byte rentabilidad)" es OTRO reporte y
  // no debe colarse.
  if (/^PIC ·/i.test(n) && /rotaci[oó]n/i.test(n) && !/rentabilidad/i.test(n)) {
    return "rotacion";
  }
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
  /** Para pedirle a cada sede solo lo que su operación produce. */
  businessId?: number,
): EstadoSemanal {
  const sabado = sabadoDeLaSemana(hoy);
  const [y, m, d] = hoy.split("-").map(Number);
  const esSabado = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6;

  const reportes: EstadoReporte[] = reportesDeLaSede(businessId).map((r) => {
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

/** "Cortesías y Ventas por Trabajador" — para nombrarlos en una frase. */
export function nombrarFaltantes(faltan: EstadoReporte[]): string {
  const n = faltan.map((f) => f.nombre);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}`;
}
