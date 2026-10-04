/**
 * Qué fechas cubren los reportes de productos de Byte que hay cargados (puro).
 *
 * Pedido de Jahnn (4-oct-2026): "que el sistema en la sección de productos me
 * diga desde qué fecha a qué fecha tiene esta información". Junta los períodos
 * de cada reporte (mayor rotación, menor rotación), los une sin importar quién
 * los subió y dice el primer día, el último y los huecos del medio.
 */

export type Rango = { desde: string; hasta: string };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

const dia = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;
const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const ultimoDiaDelMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type Cobertura = {
  /** Primer y último día con dato; null si no hay nada. */
  desde: string | null;
  hasta: string | null;
  /** Días del medio que ningún reporte cubre. */
  huecos: Rango[];
};

export function coberturaDeRangos(rangos: Rango[]): Cobertura {
  const orden = rangos.filter((r) => r.desde && r.hasta && r.desde <= r.hasta).map((r) => ({ a: dia(r.desde), b: dia(r.hasta) })).sort((x, y) => x.a - y.a);
  if (orden.length === 0) return { desde: null, hasta: null, huecos: [] };
  const juntos: { a: number; b: number }[] = [];
  for (const r of orden) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && r.a <= ultimo.b + 1) ultimo.b = Math.max(ultimo.b, r.b);
    else juntos.push({ ...r });
  }
  const huecos: Rango[] = [];
  for (let i = 1; i < juntos.length; i++) huecos.push({ desde: iso(juntos[i - 1].b + 1), hasta: iso(juntos[i].a - 1) });
  return { desde: iso(juntos[0].a), hasta: iso(juntos[juntos.length - 1].b), huecos };
}

/** "1 abr". */
export const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

/** Un hueco en palabras: "julio" (mes entero), "30–31 ago", "28 ago – 3 set". */
export function textoHueco(h: Rango): string {
  const [y1, m1, d1] = h.desde.split("-").map(Number);
  const [y2, m2, d2] = h.hasta.split("-").map(Number);
  if (h.desde === h.hasta) return fechaCorta(h.desde);
  if (y1 === y2 && m1 === m2) {
    if (d1 === 1 && d2 === ultimoDiaDelMes(y2, m2)) return MESES_LARGOS[m1 - 1];
    return `${d1}–${d2} ${MESES[m1 - 1]}`;
  }
  return `${fechaCorta(h.desde)} – ${fechaCorta(h.hasta)}`;
}

/** Días desde `f` hasta `hoy`. */
export const diasHasta = (f: string, hoy: string) => Math.round(dia(hoy) - dia(f));
