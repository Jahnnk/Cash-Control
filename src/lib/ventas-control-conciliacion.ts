/**
 * Conciliación diaria de ventas: Byte contra el registro de Kelly · MOTOR (puro).
 *
 * Una sola regla para las tres sedes (pedidos de Jahnn, 14-sep-2026):
 *
 *   · TOTAL VENDIDO sale de Byte: el reporte "Ventas de <MES>" que sube
 *     cada sede (tabla byte_ventas_daily). Es la venta oficial y la que
 *     Jahnn compara contra la pantalla de Byte. Si ese día no hay carga
 *     de Byte, se usa la copia que hizo Kelly en su Excel.
 *   · El DESGLOSE es el registro de Kelly, y cambia por sede:
 *       Atelier       → crédito y contado (pestaña CONTROL VENTAS).
 *       Fonavi/Centro → efectivo, Yape, POS y crédito (Control de VTAS).
 *   · TOTAL = suma del desglose; VARIACIÓN = total vendido − total.
 *
 * Por qué Byte manda en el total: Fonavi, 01-set-2026, Byte vendió
 * S/1,396.70 y el reporte mostraba S/1,370.70 — sumaba solo lo cobrado
 * en cuentas y dejaba afuera los S/26 de crédito. Otros días la
 * diferencia era real (un voucher de POS que faltaba): mezclar las dos
 * cosas en un solo número escondía cuál era cuál.
 *
 * DÍA SUBIDO ANTES DEL CIERRE: la sede sube el reporte de Byte cuando
 * puede, a veces con el local abierto. Fonavi subió el 13-set a las
 * 8:28 p. m. y ese día quedó en S/400.10 cuando cerró en S/1,000.60 (lo
 * mismo el 30-ago: S/102.10 contra S/899.60). Un día cuya carga se hizo
 * ese mismo día es PARCIAL: si Kelly ya copió el total, manda el de ella;
 * si no, se muestra marcado como parcial.
 *
 * Una variación distinta de cero es plata sin explicar. Los días DESPUÉS
 * del último que Kelly trabajó no tienen variación (null): no se acusa un
 * día que nadie revisó. Un día ANTERIOR que ella dejó vacío sí se revisó:
 * si Byte tiene venta, es variación.
 */

export type MetodoCuenta = { clave: string; etiqueta: string };

export const METODOS_ATELIER: MetodoCuenta[] = [
  { clave: "credito", etiqueta: "Vta. crédito" },
  { clave: "contado", etiqueta: "Vta. contado" },
];

export const METODOS_CAFETERIA: MetodoCuenta[] = [
  { clave: "efectivo", etiqueta: "Efectivo" },
  { clave: "yape", etiqueta: "Yape/Plin" },
  { clave: "pos", etiqueta: "POS" },
  { clave: "credito", etiqueta: "Crédito" },
];

export type FilaByte = {
  date: string; pedidos: number; descuentos: number; total: number;
  /** Se subió el mismo día, antes del cierre: puede estar incompleto. */
  parcial?: boolean;
};

export type FilaCuentas = {
  date: string;
  /** El total de Byte que Kelly copió en su Excel (0 si no lo copió). */
  copiaTotalByte: number;
  montos: Record<string, number>;
  notas: string[];
  pedidos?: number;
  descuentos?: number;
};

export type DiaConciliado = {
  date: string;
  pedidos: number | null;
  descuentos: number | null;
  totalVendido: number;
  /** De dónde salió el total vendido. */
  fuente: "byte" | "kelly";
  /** Byte se subió antes del cierre y no hay copia de Kelly que lo complete. */
  parcial: boolean;
  /** null = Kelly todavía no trabajó ese día. */
  montos: Record<string, number> | null;
  total: number | null;
  variacion: number | null;
  notas: string[];
  /** Kelly copió un total de Byte distinto al de la carga oficial. */
  copiaDistinta: { byte: number; kelly: number } | null;
};

export type ConciliacionVentasMes = {
  metodos: MetodoCuenta[];
  dias: DiaConciliado[];
  totalVendido: number;
  /** Último día con venta de Byte cargada. */
  byteHasta: string | null;
  /** Último día que Kelly trabajó. */
  kellyHasta: string | null;
  /** Totales de los días que Kelly ya trabajó (lo que se puede conciliar). */
  conciliado: { totalVendido: number; montos: Record<string, number>; total: number; variacion: number };
  diasConVariacion: number;
  diasCopiaDistinta: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Una diferencia menor a un céntimo es redondeo, no plata perdida. */
const TOLERANCIA = 0.01;

/**
 * Último día que Kelly trabajó. Si copió totales de Byte, manda la copia:
 * un día con un Yape suelto anotado pero sin el total copiado todavía no
 * está trabajado (Fonavi, 12-set-2026: S/99.40 de Yape y nada más).
 */
function ultimoDiaDeKelly(cuentas: FilaCuentas[]): string | null {
  const conCopia = cuentas.filter((c) => c.copiaTotalByte > 0);
  const base = conCopia.length > 0 ? conCopia : cuentas.filter((c) => Object.values(c.montos).some((v) => v !== 0));
  return base.map((c) => c.date).sort().pop() ?? null;
}

export function conciliarVentasDelMes(byte: FilaByte[], cuentas: FilaCuentas[], metodos: MetodoCuenta[]): ConciliacionVentasMes {
  const porByte = new Map(byte.map((b) => [b.date, b]));
  const porCuentas = new Map(cuentas.map((c) => [c.date, c]));
  const kellyHasta = ultimoDiaDeKelly(cuentas);
  const fechas = [...new Set([...porByte.keys(), ...porCuentas.keys()])].sort();
  const vacio = () => Object.fromEntries(metodos.map((m) => [m.clave, 0])) as Record<string, number>;

  const dias: DiaConciliado[] = fechas
    .map((date): DiaConciliado | null => {
      const c = porCuentas.get(date);
      const cargado = porByte.get(date);
      // Carga parcial con copia completa de Kelly: se usa la de Kelly.
      const b = cargado?.parcial && c && c.copiaTotalByte > 0 ? undefined : cargado;
      const trabajado = kellyHasta !== null && date <= kellyHasta;
      const totalVendido = r2(b ? b.total : c?.copiaTotalByte ?? 0);
      // Un día sin Byte y sin nada que conciliar no aporta una fila.
      if (!b && totalVendido === 0 && !(trabajado && c && Object.values(c.montos).some((v) => v !== 0))) return null;
      const montos = trabajado
        ? Object.fromEntries(metodos.map((m) => [m.clave, r2(c?.montos[m.clave] ?? 0)]))
        : null;
      const total = montos ? r2(Object.values(montos).reduce((t, v) => t + v, 0)) : null;
      const copiaDistinta =
        b && c && c.copiaTotalByte > 0 && Math.abs(b.total - c.copiaTotalByte) >= TOLERANCIA
          ? { byte: r2(b.total), kelly: r2(c.copiaTotalByte) }
          : null;
      return {
        date,
        pedidos: b ? b.pedidos : c?.pedidos ?? null,
        descuentos: b ? r2(b.descuentos) : c?.descuentos !== undefined ? r2(c.descuentos) : null,
        totalVendido,
        fuente: b ? "byte" : "kelly",
        parcial: b?.parcial === true,
        montos,
        total,
        variacion: total === null ? null : r2(totalVendido - total),
        notas: c?.notas ?? [],
        copiaDistinta,
      };
    })
    .filter((d): d is DiaConciliado => d !== null);

  const trabajados = dias.filter((d) => d.total !== null);
  const suma = (xs: DiaConciliado[], f: (d: DiaConciliado) => number) => r2(xs.reduce((t, d) => t + f(d), 0));
  const montosConciliados = vacio();
  for (const m of metodos) montosConciliados[m.clave] = suma(trabajados, (d) => d.montos![m.clave]);

  return {
    metodos,
    dias,
    totalVendido: suma(dias, (d) => d.totalVendido),
    byteHasta: byte.filter((b) => b.total > 0 && !b.parcial).map((b) => b.date).sort().pop() ?? null,
    kellyHasta,
    conciliado: {
      totalVendido: suma(trabajados, (d) => d.totalVendido),
      montos: montosConciliados,
      total: suma(trabajados, (d) => d.total!),
      variacion: suma(trabajados, (d) => d.variacion!),
    },
    diasConVariacion: trabajados.filter((d) => Math.abs(d.variacion!) >= TOLERANCIA).length,
    diasCopiaDistinta: dias.filter((d) => d.copiaDistinta).length,
  };
}

/** Las notas de Kelly sin el estado ("OK", "REVISAR") que calcula su fórmula. */
export function limpiarNotaKelly(nota: string | null | undefined): string | null {
  const t = (nota ?? "")
    .split("·")
    .map((x) => x.trim())
    .filter((x) => x && !/^(ok|revisar)$/i.test(x))
    .join(" · ");
  return t || null;
}
