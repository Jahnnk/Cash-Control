/**
 * Qué reportes de rotación de Byte hay cargados, y qué hará un archivo nuevo
 * antes de subirlo · MOTOR (puro).
 *
 * Pedido de Jahnn (22-sep-2026): "yo tengo 3 archivos, uno de agosto, otro de
 * julio y otro de junio… ¿y si descargo lo que va de setiembre? Puede mejorar
 * organizando mejor el sistema de importación". El cargador anterior era "un
 * archivo, un mes" y no decía qué había ni qué iba a pasar. Ahora:
 *
 *   · Una GRILLA sede × mes con qué días están cubiertos y quién los subió.
 *   · Antes de importar, cada archivo dice qué va a hacer: "nuevo", "reemplaza
 *     tu carga anterior" o "la sede ya subió esos días: se comparan".
 *
 * La regla de fondo es la de `rotacion_efectiva` (migración 22-sep-2026): una
 * carga solo reemplaza períodos de SU origen, y para los números manda la de
 * dirección sobre la de la sede.
 */

export type OrigenCarga = "sede" | "direccion";

export type PeriodoCargado = {
  businessId: number;
  month: string;
  origen: OrigenCarga;
  desde: string;
  hasta: string;
  ventas: number;
  cargadoEl: string | null;
};

export type EstadoCelda = "completo" | "en-curso" | "parcial" | "vacio";

export type CeldaCobertura = {
  month: string;
  estado: EstadoCelda;
  diasCubiertos: number;
  diasMes: number;
  /** Lo que cuenta para los números (dirección gana donde se pisan). */
  ventas: number;
  /** Quién puso los datos que cuentan. */
  quien: "direccion" | "sede" | "ambos" | null;
  /** Días del mes que no tiene nadie, en palabras ("30 y 31 ago"). */
  faltan: string | null;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

function diasDelMes(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function dia(iso: string): number {
  return Number(iso.slice(8, 10));
}

function seCruzan(a: { desde: string; hasta: string }, b: { desde: string; hasta: string }): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

/** Los períodos que cuentan: todos los de dirección y los de la sede que no pisan a ninguno de dirección. */
export function periodosEfectivos(periodos: PeriodoCargado[]): PeriodoCargado[] {
  const dir = periodos.filter((p) => p.origen === "direccion");
  return [...dir, ...periodos.filter((p) => p.origen === "sede" && !dir.some((d) => seCruzan(d, p)))];
}

function rangosEnPalabras(dias: number[], month: string): string | null {
  if (dias.length === 0) return null;
  const tramos: [number, number][] = [];
  for (const d of dias) {
    const t = tramos[tramos.length - 1];
    if (t && d === t[1] + 1) t[1] = d; else tramos.push([d, d]);
  }
  const m = MESES[Number(month.slice(5, 7)) - 1];
  return tramos.map(([a, b]) => (a === b ? `${a}` : b === a + 1 ? `${a} y ${b}` : `${a} al ${b}`)).join(", ") + ` ${m}`;
}

/**
 * El estado de una sede en un mes. `hoy` define el mes en curso: ahí "al día"
 * es cubrir desde el 1 hasta hace 2 días o menos (el reporte se baja al día
 * siguiente y el sábado).
 */
export function celdaCobertura(periodos: PeriodoCargado[], month: string, hoy: string): CeldaCobertura {
  const total = diasDelMes(month);
  const efectivos = periodosEfectivos(periodos.filter((p) => p.month === month));
  const cubiertos = new Set<number>();
  for (const p of efectivos) for (let d = dia(p.desde); d <= dia(p.hasta); d++) cubiertos.add(d);

  const enCurso = hoy.slice(0, 7) === month;
  const hastaHoy = enCurso ? Math.max(0, dia(hoy) - 2) : total;
  const faltanDias: number[] = [];
  for (let d = 1; d <= (enCurso ? dia(hoy) - 1 : total); d++) if (!cubiertos.has(d)) faltanDias.push(d);

  const origenes = new Set(periodos.filter((p) => p.month === month).map((p) => p.origen));
  const quien = origenes.size === 0 ? null : origenes.size === 2 ? "ambos" : [...origenes][0];
  const ventas = Math.round(efectivos.reduce((t, p) => t + p.ventas, 0) * 100) / 100;

  let estado: EstadoCelda;
  if (cubiertos.size === 0) estado = "vacio";
  else if (enCurso) estado = [...Array(hastaHoy).keys()].every((i) => cubiertos.has(i + 1)) ? "en-curso" : "parcial";
  else estado = cubiertos.size >= total ? "completo" : "parcial";

  return {
    month, estado, diasCubiertos: cubiertos.size, diasMes: total, ventas, quien,
    faltan: estado === "completo" || estado === "vacio" ? null : rangosEnPalabras(faltanDias, month),
  };
}

export type ArchivoACargar = { businessId: number; month: string; desde: string; hasta: string; total: number };

export type QueHara = {
  tipo: "nuevo" | "reemplaza" | "compara" | "reemplaza-y-compara";
  texto: string;
};

const fecha = (iso: string) => `${dia(iso)} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const soles = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Qué pasa si dirección sube este archivo, dicho antes de guardarlo. */
export function queHaraLaCarga(archivo: ArchivoACargar, periodos: PeriodoCargado[]): QueHara {
  const mismos = periodos.filter((p) => p.businessId === archivo.businessId && p.month === archivo.month && seCruzan(p, archivo));
  const propios = mismos.filter((p) => p.origen === "direccion");
  const deSede = mismos.filter((p) => p.origen === "sede");
  const partes: string[] = [];
  if (propios.length > 0) {
    partes.push(`Reemplaza tu carga anterior (${propios.map((p) => `${fecha(p.desde)} → ${fecha(p.hasta)}, ${soles(p.ventas)}`).join("; ")}).`);
  }
  if (deSede.length > 0) {
    const ventasSede = deSede.reduce((t, p) => t + p.ventas, 0);
    const rangoSede = `${fecha(deSede.map((p) => p.desde).sort()[0])} → ${fecha(deSede.map((p) => p.hasta).sort().pop()!)}`;
    const dif = Math.round((archivo.total - ventasSede) * 100) / 100;
    partes.push(
      `La sede subió ${soles(ventasSede)} para ${rangoSede}: queda como segunda fuente y manda la tuya` +
      (Math.abs(dif) >= 1 ? ` (tu archivo trae ${soles(Math.abs(dif))} ${dif > 0 ? "más" : "menos"}).` : " (coinciden)."),
    );
  }
  if (partes.length === 0) return { tipo: "nuevo", texto: "Nuevo: no había datos de esos días." };
  return {
    tipo: propios.length > 0 && deSede.length > 0 ? "reemplaza-y-compara" : propios.length > 0 ? "reemplaza" : "compara",
    texto: partes.join(" "),
  };
}

/** La sede que sugiere el nombre del archivo ("Fonavi_Agosto-Platos…"). Siempre se confirma. */
export function sedeDelNombre(nombre: string): number | null {
  const t = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const hay = [["FONAVI", 2], ["CENTRO", 3], ["ATELIER", 1]].filter(([k]) => t.includes(k as string));
  return hay.length === 1 ? (hay[0][1] as number) : null;
}
