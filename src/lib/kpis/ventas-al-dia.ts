/**
 * «Ventas al día» · lógica PURA (19-oct-2026).
 *
 * El Excel de finanzas llega ~1 vez por semana y el reporte de Byte de Jahnn, los lunes. Para saber cómo va el mes
 * entre una carga y otra, la fuente diaria es lo que anotan los administradores en su Panel de Sede (el cierre de
 * Byte de cada día). Esta vista suma lo anotado en el mes por sede, dice hasta qué día llega y lo contrasta con el
 * reporte de Byte en los mismos días. NO reemplaza a Byte (la cifra oficial de ventas sigue siendo la de Byte):
 * sirve para tener el «cómo vamos» al día y para ver pronto si algún administrador anota distinto.
 */

import { TOLERANCIA_PANEL_BYTE, TOLERANCIA_REPARTO_PCT } from "./listo-reunion";

export type VentaDia = { fecha: string; total: number };

export type SedeVentasEntrada = {
  businessId: number;
  sede: string;
  /** Días de la semana (0 = domingo) en que se espera venta. */
  diasEsperados: number[];
  /** Días en que la sede no opera (feriado, cierre): no se reclaman. */
  diasPausados: string[];
  /** Lo que anotó el administrador, día por día (solo días con venta > 0). */
  admin: VentaDia[];
  /** El reporte de Byte subido por dirección, día por día. */
  byte: VentaDia[];
  /** Último día que cubre el reporte de Byte subido (los días hasta ahí sin fila = sin venta). */
  byteHasta: string | null;
};

export type DiaComparado = {
  fecha: string;
  admin: number | null;
  /** null = el reporte de Byte todavía no llega a ese día. */
  byte: number | null;
  dif: number | null;
};

export type SedeVentasAlDia = {
  businessId: number;
  sede: string;
  /** Suma de lo anotado en el mes. */
  anotado: number;
  /** Último día con venta anotada. */
  hasta: string | null;
  diasConDato: number;
  /** Lo que dice Byte en los mismos días que el administrador anotó (solo días que Byte ya cubre). */
  byteMismosDias: number;
  diferencia: number;
  /** cuadra = coincide; revisar = hay días que no coinciden y no se compensan; sin-dato = nada anotado. */
  estado: "cuadra" | "revisar" | "sin-dato";
  byteHasta: string | null;
  /** Días esperados hasta ayer que no tienen venta anotada. */
  faltan: string[];
  /** Días seguidos en que Byte repartió distinto (caja sin abrir) pero que juntos coinciden. */
  repartoDistinto: string[][];
  /** Días que no coinciden y no se explican: hay que revisarlos. */
  sueltos: string[];
  dias: DiaComparado[];
};

export type VentasAlDia = {
  mes: string;
  hoy: string;
  sedes: SedeVentasAlDia[];
  grupo: { anotado: number; byteMismosDias: number; diferencia: number };
};

const mover = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const diaSemana = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const r2 = (n: number) => Math.round(n * 100) / 100;
const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

function evaluarSede(s: SedeVentasEntrada, mes: string, hoy: string): SedeVentasAlDia {
  const admin = new Map(s.admin.filter((x) => x.total > 0 && x.fecha.startsWith(mes)).map((x) => [x.fecha, x.total]));
  const byte = new Map(s.byte.filter((x) => x.fecha.startsWith(mes)).map((x) => [x.fecha, x.total]));
  const fechasConAdmin = [...admin.keys()].sort();
  const hasta = fechasConAdmin.at(-1) ?? null;

  // Cada día con anotación, contra Byte (solo si el reporte de Byte ya llega a ese día).
  const dias: DiaComparado[] = fechasConAdmin.map((f) => {
    const a = admin.get(f)!;
    const cubierto = s.byteHasta !== null && f <= s.byteHasta;
    const b = cubierto ? byte.get(f) ?? 0 : null;
    return { fecha: f, admin: a, byte: b, dif: b === null ? null : r2(a - b) };
  });
  // Los días en que Byte tiene venta y el administrador no anotó nada también cuentan como diferencia.
  for (const [f, b] of byte) if (!admin.has(f) && b > 0) dias.push({ fecha: f, admin: null, byte: b, dif: r2(0 - b) });
  dias.sort((x, y) => (x.fecha < y.fecha ? -1 : 1));

  const comparables = dias.filter((d) => d.byte !== null);
  const anotado = r2([...admin.values()].reduce((t, x) => t + x, 0));
  const byteMismosDias = r2(comparables.filter((d) => d.admin !== null).reduce((t, d) => t + (d.byte ?? 0), 0));
  const diferencia = r2(comparables.filter((d) => d.admin !== null).reduce((t, d) => t + (d.dif ?? 0), 0));

  // Días que difieren; los seguidos que juntos casi coinciden son Byte repartiendo distinto (caja sin abrir).
  // (Los días en que Byte vendió y el administrador no anotó nada van a «faltan», no a «diferencias».)
  const difieren = comparables.filter((d) => d.admin !== null && Math.abs(d.dif ?? 0) >= TOLERANCIA_PANEL_BYTE);
  const grupos: DiaComparado[][] = [];
  for (const d of difieren) {
    const ult = grupos.at(-1);
    if (ult && mover(ult[ult.length - 1].fecha, 1) === d.fecha) ult.push(d); else grupos.push([d]);
  }
  const repartoDistinto: string[][] = [];
  const sueltos: string[] = [];
  for (const g of grupos) {
    const sumDif = g.reduce((t, d) => t + (d.dif ?? 0), 0);
    const sumByte = g.reduce((t, d) => t + (d.byte ?? 0), 0);
    if (g.length >= 2 && Math.abs(sumDif) <= Math.max(TOLERANCIA_PANEL_BYTE, TOLERANCIA_REPARTO_PCT * sumByte)) repartoDistinto.push(g.map((d) => d.fecha));
    else sueltos.push(...g.map((d) => d.fecha));
  }

  // Días esperados hasta ayer (o fin de mes) sin venta anotada.
  const tope = [mover(hoy, -1), finDeMes(mes)].sort()[0];
  const pausados = new Set(s.diasPausados);
  const faltan: string[] = [];
  for (let f = `${mes}-01`; f <= tope; f = mover(f, 1)) {
    if (admin.has(f) || pausados.has(f)) continue;
    // Byte ya cubre el día y no tiene venta: no hubo venta que anotar (Atelier vende a empresas en días sueltos).
    const byteCubre = s.byteHasta !== null && f <= s.byteHasta;
    if (byteCubre && !byte.has(f)) continue;
    // Se espera venta ese día de la semana, o Byte dice que sí hubo venta (aunque sea un día libre).
    if (s.diasEsperados.includes(diaSemana(f)) || byte.has(f)) faltan.push(f);
  }

  return {
    businessId: s.businessId, sede: s.sede, anotado, hasta, diasConDato: admin.size, byteMismosDias, diferencia,
    estado: admin.size === 0 ? "sin-dato" : sueltos.length === 0 ? "cuadra" : "revisar",
    byteHasta: s.byteHasta, faltan, repartoDistinto, sueltos, dias,
  };
}

export function ventasAlDia(input: { mes: string; hoy: string; sedes: SedeVentasEntrada[] }): VentasAlDia {
  const sedes = input.sedes.map((s) => evaluarSede(s, input.mes, input.hoy));
  return {
    mes: input.mes, hoy: input.hoy, sedes,
    grupo: {
      anotado: r2(sedes.reduce((t, s) => t + s.anotado, 0)),
      byteMismosDias: r2(sedes.reduce((t, s) => t + s.byteMismosDias, 0)),
      diferencia: r2(sedes.reduce((t, s) => t + s.diferencia, 0)),
    },
  };
}

/**
 * Lo que el cierre del bono necesita saber de una sede: Byte es lo que cuenta, así que cualquier día que el administrador
 * anotó distinto, que no anotó teniendo venta en Byte, o que el reporte de Byte aún no cubre, bloquea el cierre.
 */
export type EntradaVentasVsByte = {
  /** Días que no coinciden y no se explican por caja sin abrir. */
  noCoinciden: { fecha: string; anotado: number | null; byte: number }[];
  /** Días en que se espera venta (o Byte la tiene) y el administrador no anotó nada. */
  sinAnotar: string[];
  /** Días anotados que el reporte de Byte subido todavía no cubre. */
  sinByte: string[];
  byteHasta: string | null;
};

export function entradaVentasVsByte(s: SedeVentasAlDia): EntradaVentasVsByte {
  const dia = (f: string) => s.dias.find((d) => d.fecha === f);
  return {
    noCoinciden: s.sueltos.map((f) => ({ fecha: f, anotado: dia(f)?.admin ?? null, byte: dia(f)?.byte ?? 0 })),
    sinAnotar: s.faltan,
    sinByte: s.dias.filter((d) => d.byte === null && d.admin !== null).map((d) => d.fecha),
    byteHasta: s.byteHasta,
  };
}
