/**
 * Qué meses del Excel de Kelly están cargados, sede por sede · MOTOR (puro).
 *
 * Pedido de Jahnn (22-sep-2026), después de ver la grilla de los reportes de
 * Byte en Productos: "quiero que hagas lo mismo cuando suba los Excel de
 * Kelly… actualmente lo hago desde el dashboard, pero está un poco escondido y
 * desordenado".
 *
 * Cada casilla (sede × mes) responde: ¿está completo?, ¿hasta qué día llega?,
 * ¿cuánto se vendió y cuánto se gastó?, ¿cuándo se subió?
 *
 * Cuándo un mes está COMPLETO: el Excel trae movimientos hasta fin de mes (con
 * 2 días de tolerancia: la planilla se paga el 30 o 31 y un mes puede cerrar
 * sin movimientos el último día) y, en las cafeterías, ventas en al menos el
 * 90% de los días. Atelier no tiene venta de mostrador todos los días, así que
 * ahí solo cuentan los movimientos.
 *
 * El mes en curso está AL DÍA si llega hasta hace una semana o menos: Kelly
 * entrega los viernes (ver lib/frescura-datos.ts).
 */

export type MesKelly = {
  businessId: number;
  month: string;
  /** Venta del mes según el Excel (Control de VTAS / CONTROL VENTAS). */
  ventas: number;
  /** Días con venta registrada. */
  diasVenta: number;
  /** Gastos del mes que trajo el Excel. */
  gastos: number;
  /** Último día con cualquier movimiento del Excel. */
  hasta: string | null;
  /** Cuándo se subió el último Excel que tocó ese mes (fecha de Lima). */
  cargadoEl: string | null;
  /** Gastos registrados a mano ese mes (antes de que Kelly llevara el Excel de la sede). */
  gastosManuales?: number;
  /**
   * Lo que entró y salió ese mes: la MISMA cifra que Grupo → Resumen y
   * Finanzas y que los totales de la pestaña Ing&Gtos del Excel
   * (lib/totales-mes-sede.ts). Es lo que se muestra; ventas/gastos de arriba
   * solo deciden el estado de la casilla. Pedido de Jahnn (25-sep-2026): los
   * montos sincronizados en todas las pestañas.
   */
  entro?: number;
  salio?: number;
};

export type EstadoMesKelly = "completo" | "al-dia" | "atrasado" | "parcial" | "manual" | "vacio";

export type CeldaKelly = MesKelly & {
  estado: EstadoMesKelly;
  diasMes: number;
  /** Una línea: "mes completo", "hasta el 15 set", "sin cargar". */
  texto: string;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const TOLERANCIA_FIN_DE_MES = 2;
const COBERTURA_VENTAS = 0.9;
const DIAS_AL_DIA = 7;

function diasDelMes(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export const fechaCortaKelly = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

export function celdaKelly(m: MesKelly, hoy: string, esCafeteria: boolean): CeldaKelly {
  const total = diasDelMes(m.month);
  const base = { ...m, diasMes: total };
  if (!m.hasta && m.ventas === 0 && m.gastos === 0) {
    // Antes de agosto 2026 Atelier se registraba a mano: no es un hueco.
    return (m.gastosManuales ?? 0) > 0
      ? { ...base, estado: "manual", texto: "registrado a mano" }
      : { ...base, estado: "vacio", texto: "Sin cargar" };
  }

  const ultimo = `${m.month}-${String(total).padStart(2, "0")}`;
  const enCurso = hoy.slice(0, 7) === m.month;
  const hasta = m.hasta ?? `${m.month}-01`;

  if (enCurso) {
    const atraso = diasEntre(hasta, hoy);
    return atraso <= DIAS_AL_DIA
      ? { ...base, estado: "al-dia", texto: `al día · hasta el ${fechaCortaKelly(hasta)}` }
      : { ...base, estado: "atrasado", texto: `hasta el ${fechaCortaKelly(hasta)} · ${atraso} días sin cargar` };
  }

  const movimientosCompletos = diasEntre(hasta, ultimo) <= TOLERANCIA_FIN_DE_MES;
  const ventasCompletas = !esCafeteria || m.diasVenta >= total * COBERTURA_VENTAS;
  if (movimientosCompletos && ventasCompletas) return { ...base, estado: "completo", texto: "mes completo" };
  if (!movimientosCompletos) return { ...base, estado: "parcial", texto: `solo hasta el ${fechaCortaKelly(hasta)}` };
  return { ...base, estado: "parcial", texto: `ventas en ${m.diasVenta} de ${total} días` };
}
