/**
 * Los reportes de rotación como PERÍODOS que se acumulan.
 *
 * Pedido de Jahnn (18-ago-2026): "lo ideal es que cada administrador
 * suba el reporte por semana… pero ¿qué pasa si por el apuro Raúl sube
 * el reporte de todo el mes? El sistema deberá identificar el mes, los
 * días y semanas y subirlo todo de manera correcta y ordenada".
 *
 * ─── El límite que impone Byte ───
 *
 * El reporte trae UNA FILA POR PLATO con el total del rango; no tiene
 * fecha por fila. O sea: se puede saber qué trajo la semana del 15 al
 * 21, pero es IMPOSIBLE repartir eso entre el lunes y el martes. La
 * semana es lo más fino que existe, y no por decisión nuestra.
 *
 * ─── La regla ───
 *
 * Cada carga es un período (inicio, fin). El mes es la SUMA de sus
 * períodos. Y para que nunca se cuente dos veces:
 *
 *     una carga nueva REEMPLAZA a las que pisa.
 *
 * Con esa sola regla salen bien los tres casos:
 *
 *   · Semanas sueltas (1-7, 8-14, 15-21): no se pisan → se suman.
 *   · El mes entero (1-31) sobre esas semanas: las pisa a todas → las
 *     reemplaza y queda él solo. Sin doble conteo.
 *   · Volver a subir la misma semana: se pisa a sí misma → se actualiza.
 *
 * ─── Y lo que se muestra ───
 *
 * La COBERTURA: qué días del mes están cubiertos y cuáles no. Es lo
 * que hace esto auditable — el administrador y Jahnn ven "agosto
 * cubierto del 1 al 21" en vez de confiar a ciegas en un total.
 */

export type Periodo = { inicio: string; fin: string };

const dias = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

const aIso = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Suma (o resta) días a una fecha ISO. */
export function sumarDias(iso: string, n: number): string {
  return aIso(dias(iso) + n);
}

/** ¿Estos dos rangos comparten aunque sea un día? */
export function seSolapan(a: Periodo, b: Periodo): boolean {
  return a.inicio <= b.fin && b.inicio <= a.fin;
}

/**
 * De los períodos guardados, cuáles pisa el nuevo (y hay que reemplazar).
 * El resto se queda: son territorio que el nuevo no toca.
 */
export function periodosQueReemplaza<T extends Periodo>(existentes: T[], nuevo: Periodo): T[] {
  return existentes.filter((p) => seSolapan(p, nuevo));
}

/**
 * La semana que toca subir un sábado dado: los 7 días que terminan el
 * día anterior. El sábado 22 se sube la semana del 15 al 21, tal como
 * lo planteó Jahnn.
 */
export function semanaQueToca(sabado: string): Periodo {
  return { inicio: sumarDias(sabado, -7), fin: sumarDias(sabado, -1) };
}

/** Primer y último día de un mes "2026-08". */
export function limitesDelMes(mes: string): Periodo {
  const [y, m] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { inicio: `${mes}-01`, fin: `${mes}-${String(fin).padStart(2, "0")}` };
}

export type Cobertura = {
  /** Días del mes con datos. */
  diasCubiertos: number;
  /** Días que ya pasaron y deberían tener datos. */
  diasEsperados: number;
  /** Tramos sin cubrir, para poder pedirlos por su nombre. */
  huecos: Periodo[];
  completa: boolean;
};

/**
 * Qué parte del mes está cubierta, mirando solo hasta `hasta` (hoy):
 * reclamar el 30 de agosto un día 18 sería una alarma falsa.
 */
export function coberturaDelMes(periodos: Periodo[], mes: string, hasta: string): Cobertura {
  const { inicio, fin } = limitesDelMes(mes);
  const tope = hasta < fin ? hasta : fin;
  if (tope < inicio) {
    return { diasCubiertos: 0, diasEsperados: 0, huecos: [], completa: true };
  }

  const d0 = dias(inicio);
  const dN = dias(tope);
  const cubierto = new Set<number>();
  for (const p of periodos) {
    const a = Math.max(dias(p.inicio), d0);
    const b = Math.min(dias(p.fin), dN);
    for (let d = a; d <= b; d++) cubierto.add(d);
  }

  const huecos: Periodo[] = [];
  let arranque: number | null = null;
  for (let d = d0; d <= dN; d++) {
    if (!cubierto.has(d)) {
      if (arranque === null) arranque = d;
    } else if (arranque !== null) {
      huecos.push({ inicio: aIso(arranque), fin: aIso(d - 1) });
      arranque = null;
    }
  }
  if (arranque !== null) huecos.push({ inicio: aIso(arranque), fin: aIso(dN) });

  const esperados = dN - d0 + 1;
  return {
    diasCubiertos: cubierto.size,
    diasEsperados: esperados,
    huecos,
    completa: cubierto.size === esperados,
  };
}

/** "del 15 al 21 de agosto" — para pedirlo con palabras, no con fechas ISO. */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

export function describirPeriodo(p: Periodo): string {
  const [, m1, d1] = p.inicio.split("-").map(Number);
  const [, m2, d2] = p.fin.split("-").map(Number);
  if (p.inicio === p.fin) return `el ${d1} de ${MESES[m1 - 1]}`;
  if (m1 === m2) return `del ${d1} al ${d2} de ${MESES[m1 - 1]}`;
  return `del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]}`;
}

/** Frase de los huecos: "faltan del 8 al 14 de agosto y el 20 de agosto". */
export function describirHuecos(huecos: Periodo[]): string {
  if (huecos.length === 0) return "";
  const t = huecos.map(describirPeriodo);
  if (t.length === 1) return t[0];
  return `${t.slice(0, -1).join(", ")} y ${t[t.length - 1]}`;
}

/**
 * ¿El rango cae entero dentro de un mes? Si cruza el fin de mes no se
 * puede repartir (el reporte no trae días), así que hay que pedir dos
 * archivos. Devuelve el corte sugerido para explicarlo.
 */
export function cruzaDeMes(p: Periodo): { cruza: false } | { cruza: true; corte: [Periodo, Periodo] } {
  const mes1 = p.inicio.slice(0, 7);
  const mes2 = p.fin.slice(0, 7);
  if (mes1 === mes2) return { cruza: false };
  const finMes1 = limitesDelMes(mes1).fin;
  return {
    cruza: true,
    corte: [
      { inicio: p.inicio, fin: finMes1 },
      { inicio: sumarDias(finMes1, 1), fin: p.fin },
    ],
  };
}
