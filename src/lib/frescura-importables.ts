/**
 * «Datos cargados»: hasta qué fecha llega cada cosa que Jahnn sube (puro).
 *
 * Pedido de Jahnn (15-oct-2026): finanzas no siempre manda sus reportes a tiempo y
 * necesita ver por lo menos Byte (ventas, mayor y menor rotación), que sube él una vez
 * por semana; dos botones en el dashboard (Byte y Excel de Kelly) y que el sistema diga
 * a qué fecha tiene cada información. Misma regla que la banda de frescura: el grupo
 * vale por su PEOR sede (mostrar la mejor sería la mentira cómoda).
 */

export type TonoFecha = "al-dia" | "atrasado" | "muy-atrasado" | "sin-datos";

/** Días de rezago a partir de los cuales una fecha deja de ser «al día» (Byte se sube cada semana). */
export const DIAS_AL_DIA = 8;
export const DIAS_MUY_ATRASADO = 15;

const dia = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;

export function diasDeRezago(hasta: string | null, hoy: string): number | null {
  return hasta ? Math.max(0, Math.round(dia(hoy) - dia(hasta))) : null;
}

export function tonoDeFecha(hasta: string | null, hoy: string): TonoFecha {
  const d = diasDeRezago(hasta, hoy);
  if (d === null) return "sin-datos";
  return d <= DIAS_AL_DIA ? "al-dia" : d <= DIAS_MUY_ATRASADO ? "atrasado" : "muy-atrasado";
}

/** La fecha del grupo: la de la sede más atrasada. Si a alguna sede le falta, el grupo no tiene el dato. */
export function fechaDelGrupo(fechas: (string | null)[]): string | null {
  if (fechas.length === 0 || fechas.some((f) => f === null)) return null;
  return (fechas as string[]).reduce((m, f) => (f < m ? f : m));
}

/** Qué sedes arrastran al grupo (las de la fecha más atrasada, o las que no tienen nada). */
export function sedesQueArrastran(sedes: { nombre: string; hasta: string | null }[]): string[] {
  const sin = sedes.filter((s) => s.hasta === null).map((s) => s.nombre);
  if (sin.length) return sin;
  const peor = fechaDelGrupo(sedes.map((s) => s.hasta));
  return sedes.filter((s) => s.hasta === peor).map((s) => s.nombre);
}

const sumar = (iso: string, n: number) => new Date((dia(iso) + n) * 86_400_000).toISOString().slice(0, 10);
const diaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/**
 * Los días de la semana en que esta sede NO abre (0 = domingo): los que no tuvieron NI UNA venta en sus últimas 8 semanas.
 * Pedido de Jahnn (26-oct-2026): Atelier no vende los domingos y el dashboard lo mostraba como atraso («Ventas al 24/10»
 * con todo subido al 25/10). Solo se mira entre la primera y la última venta de la ventana, y se exigen 5 domingos
 * (o lunes, etc.) para decidir: una semana sin subir no cierra un día por error.
 */
export function diasDeCierre(fechasConVenta: string[], hoy: string, semanas = 8): Set<number> {
  const desde = sumar(hoy, -7 * semanas);
  const ayer = sumar(hoy, -1);
  const con = new Set(fechasConVenta.filter((f) => f >= desde && f <= ayer));
  if (con.size === 0) return new Set();
  const ordenadas = [...con].sort();
  const primera = ordenadas[0], ultima = ordenadas[ordenadas.length - 1];
  const cerrados = new Set<number>();
  for (let d = 0; d < 7; d++) {
    let veces = 0, conVenta = 0;
    for (let f = primera; f <= ultima; f = sumar(f, 1)) {
      if (diaSemana(f) !== d) continue;
      veces++;
      if (con.has(f)) conVenta++;
    }
    if (veces >= 5 && conVenta === 0) cerrados.add(d);
  }
  return cerrados;
}

/**
 * Hasta qué día tiene cubierta la venta una sede: su último día con venta, y los días de cierre que le siguen hasta
 * ayer (el sábado 24 con venta y el domingo 25 cerrado = cubierta al 25). Hoy nunca cuenta: Byte todavía no lo cerró.
 */
export function ventaCubiertaHasta(fechasConVenta: string[], hoy: string): string | null {
  if (fechasConVenta.length === 0) return null;
  let hasta = fechasConVenta.reduce((m, f) => (f > m ? f : m));
  const cerrados = diasDeCierre(fechasConVenta, hoy);
  const ayer = sumar(hoy, -1);
  for (let d = sumar(hasta, 1); d <= ayer && cerrados.has(diaSemana(d)); d = sumar(d, 1)) hasta = d;
  return hasta;
}

/** «13/10». */
export const ddmm = (f: string | null) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}` : "—");
