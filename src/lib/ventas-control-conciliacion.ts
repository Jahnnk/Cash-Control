/**
 * Conciliación diaria de ventas: Byte contra el registro de Kelly · MOTOR (puro).
 *
 * Tres fuentes, cada una con lo suyo:
 *   · Byte (reporte "Ventas de <MES>" que sube Luis en el panel de
 *     Atelier, tabla byte_ventas_daily): pedidos, descuentos y TOTAL
 *     VENDIDO. Es la venta oficial y suele estar más al día.
 *   · Excel de Kelly (pestaña CONTROL VENTAS): cuánto de eso fue a CRÉDITO
 *     y cuánto al CONTADO. También copia el total de Byte; si su copia no
 *     coincide con la de Luis, se avisa.
 *   · El sistema recalcula TOTAL = crédito + contado y VARIACIÓN = total
 *     vendido − total, igual que las fórmulas de Kelly.
 *
 * Una variación distinta de cero es plata sin explicar: una venta que
 * Byte registró y nadie clasificó (variación positiva), o un contado que
 * Kelly anotó y Byte no tiene (negativa). Setiembre 2026, al día 11:
 * +603.39 el 07, −412.80 el 02, −27.20 el 08 y −48.00 el 10 → S/115.39.
 *
 * Los días DESPUÉS del último que Kelly llenó no tienen variación (null):
 * no se puede decir que falta plata en un día que nadie revisó. Pero un
 * día ANTERIOR que ella dejó en cero sí se revisó: si Byte tiene venta ese
 * día, es variación (agosto 2026: S/1 cargado a mano el 06, que Kelly no
 * tiene).
 */

export type FilaByte = { date: string; pedidos: number; descuentos: number; total: number };
export type FilaKelly = {
  date: string; pedidos: number; descuentos: number; totalVendido: number;
  ventaCredito: number; ventaContado: number; nota: string | null;
};

export type DiaConciliado = {
  date: string;
  pedidos: number;
  descuentos: number;
  totalVendido: number;
  /** De dónde salió el total vendido. */
  fuente: "byte" | "kelly";
  ventaCredito: number | null;
  ventaContado: number | null;
  total: number | null;
  variacion: number | null;
  nota: string | null;
  /** Kelly copió un total de Byte distinto al que subió Luis. */
  copiaDistinta: { byte: number; kelly: number } | null;
};

export type ConciliacionVentasMes = {
  dias: DiaConciliado[];
  totalVendido: number;
  /** Último día con venta de Byte cargada. */
  byteHasta: string | null;
  /** Último día que Kelly clasificó. */
  kellyHasta: string | null;
  /** Totales de los días que Kelly ya clasificó (lo que se puede conciliar). */
  conciliado: { totalVendido: number; ventaCredito: number; ventaContado: number; total: number; variacion: number };
  diasConVariacion: number;
  diasCopiaDistinta: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Una diferencia menor a un céntimo es redondeo, no plata perdida. */
const TOLERANCIA = 0.01;

export function conciliarVentasDelMes(byte: FilaByte[], kelly: FilaKelly[]): ConciliacionVentasMes {
  const porByte = new Map(byte.map((b) => [b.date, b]));
  const porKelly = new Map(kelly.map((k) => [k.date, k]));
  const fechas = [...new Set([...porByte.keys(), ...porKelly.keys()])].sort();
  const conDato = (xs: { date: string; v: number }[]) => xs.filter((x) => x.v > 0).map((x) => x.date).sort().pop() ?? null;
  const kellyHasta = conDato(kelly.map((k) => ({ date: k.date, v: k.ventaCredito + k.ventaContado + k.totalVendido })));

  const dias: DiaConciliado[] = fechas.map((date) => {
    const b = porByte.get(date);
    const revisadoPorKelly = kellyHasta !== null && date <= kellyHasta;
    const k = porKelly.get(date) ?? (revisadoPorKelly && b
      ? { date, pedidos: 0, descuentos: 0, totalVendido: 0, ventaCredito: 0, ventaContado: 0, nota: null }
      : undefined);
    const totalVendido = r2(b ? b.total : k!.totalVendido);
    const total = k ? r2(k.ventaCredito + k.ventaContado) : null;
    const copiaDistinta =
      b && porKelly.has(date) && Math.abs(b.total - k!.totalVendido) >= TOLERANCIA ? { byte: r2(b.total), kelly: r2(k!.totalVendido) } : null;
    return {
      date,
      pedidos: b ? b.pedidos : k!.pedidos,
      descuentos: r2(b ? b.descuentos : k!.descuentos),
      totalVendido,
      fuente: b ? "byte" : "kelly",
      ventaCredito: k ? r2(k.ventaCredito) : null,
      ventaContado: k ? r2(k.ventaContado) : null,
      total,
      variacion: total === null ? null : r2(totalVendido - total),
      nota: k?.nota ?? null,
      copiaDistinta,
    };
  });

  const deKelly = dias.filter((d) => d.total !== null);
  const suma = (xs: DiaConciliado[], f: (d: DiaConciliado) => number) => r2(xs.reduce((t, d) => t + f(d), 0));

  return {
    dias,
    totalVendido: suma(dias, (d) => d.totalVendido),
    byteHasta: conDato(byte.map((b) => ({ date: b.date, v: b.total + b.pedidos }))),
    kellyHasta,
    conciliado: {
      totalVendido: suma(deKelly, (d) => d.totalVendido),
      ventaCredito: suma(deKelly, (d) => d.ventaCredito ?? 0),
      ventaContado: suma(deKelly, (d) => d.ventaContado ?? 0),
      total: suma(deKelly, (d) => d.total ?? 0),
      variacion: suma(deKelly, (d) => d.variacion ?? 0),
    },
    diasConVariacion: deKelly.filter((d) => Math.abs(d.variacion ?? 0) >= TOLERANCIA).length,
    diasCopiaDistinta: dias.filter((d) => d.copiaDistinta).length,
  };
}
