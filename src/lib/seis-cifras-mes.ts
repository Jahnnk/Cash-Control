/**
 * Las seis cifras de UNA sede en UN mes, a partir de sus filas · MOTOR (puro).
 *
 * Antes este armado vivía dentro de la server action (getSeisCifras), mezclado con el SQL. Se separó el
 * 24-oct-2026 (controles de fiabilidad) por tres razones:
 *   1. Un solo cálculo: el punto de equilibrio (app/actions/breakeven.ts) y los controles del mes
 *      (lib/controles-fiabilidad.ts) usan EXACTAMENTE estas cifras, no una copia parecida.
 *   2. Las correcciones de la auditoría de setiembre viven en un solo lugar:
 *        · A1 — gasto no ejecutado / a rendir que vuelve el mismo mes: se compensa (lib/gastos-compensados.ts).
 *        · A2 — fila con tipo y columna cruzados: fuera de las cifras (lib/revisar-tipo.ts).
 *        · A4 — una fila con Grupo «Ventas» es venta aunque su nota parezca un reembolso entre sedes.
 *   3. Se puede probar sin base de datos: la regresión de setiembre 2026 corre en el CI con las filas guardadas.
 *
 * Los filtros replican, fila por fila, las consultas que había (ver lib/seis-cifras-sql.ts para la lectura).
 */

import { cifrasDeSede, corteComun, type CifrasSede, type FilaCifras, type IngresosFuera } from "./seis-cifras";
import { compensarGastosNoEjecutados, type Compensacion } from "./gastos-compensados";
import { filasRevisarTipo, type AvisoImportador, type FilaRevisarTipo } from "./revisar-tipo";
import type { Recupero } from "./recuperos-entre-sedes";

export type GastoMes = {
  id: string; fecha: string; categoria: string; concepto: string | null; monto: number;
  /** La parte de la sede (en un compartido, COALESCE(atelier_amount, amount)). */
  propio: number;
  metodo: string; prestamoSocio: boolean; viaBanco: boolean; transferenciaInterna: boolean; importado: boolean;
};

export type IngresoMes = {
  id: string; fecha: string; monto: number; nota: string | null; metodo: string;
  /** Grupo «Ventas» en el Excel (is_byte_sale). */
  venta: boolean;
  /** is_fonavi_reimbursement tal como quedó guardado. */
  reembolso: boolean;
  noOperativo: string | null; prestamoSocio: boolean; viaBanco: boolean; transferenciaInterna: boolean; importado: boolean;
};

export type RecuperosCorte = { recuperos: Recupero[]; deGastos: Recupero[] };

/** Todo lo que hace falta leer de la base para las seis cifras de una sede en un mes (sin archivados). */
export type DatosMesSede = {
  businessId: number;
  sede: string;
  mes: string;
  finDeMes: string;
  /** Hoy en Lima (YYYY-MM-DD). */
  hoy: string;
  /** min(finDeMes, hoy): hasta dónde se leyeron filas y ventas. */
  hastaHoy: string;
  /** Último día con filas importadas del Excel (o, en un mes cerrado sin Excel, con filas manuales). */
  corteExcel: string | null;
  fuenteExcel: boolean;
  gastos: GastoMes[];
  ingresos: IngresoMes[];
  /** La venta oficial de cada día (lib/kpis/ventas-loader.ts → loadVentaRowsBlended), del 01 a hastaHoy. */
  ventas: { date: string; total: number }[];
  /** recuperosDelPeriodo(inicio, corte) para cada corte que se usa. */
  recuperos: Record<string, RecuperosCorte>;
  /** Avisos del importador de las cargas con filas en el mes (para reconocer filas viejas con el tipo cruzado). */
  avisos: AvisoImportador[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);

/** A4: Kelly manda con el Grupo. Una fila «Ventas» no es reembolso aunque su nota diga «devolución … sede». */
export const esReembolsoEfectivo = (i: IngresoMes) => i.reembolso && !i.venta;

/** Ingreso de la operación (totalesMesSede.ingresos, con A4). */
export const esIngresoOperativo = (i: IngresoMes) =>
  !esReembolsoEfectivo(i) && !i.prestamoSocio && !i.transferenciaInterna && i.noOperativo === null;

/** Entró a la cuenta (totalesMesSede.entro): sin transferencias internas; un préstamo del socio solo si pasó por el banco. */
export const entroALaCuenta = (i: IngresoMes) => !i.transferenciaInterna && (!i.prestamoSocio || i.viaBanco);

/** Salió de la cuenta (totalesMesSede.salio). */
export const salioDeLaCuenta = (g: GastoMes) =>
  !g.transferenciaInterna && (!g.prestamoSocio || g.viaBanco) && g.metodo !== "pendiente_atelier" && g.metodo !== "socio";

/** Fila de gasto que entra a las seis cifras (antes de A1/A2). */
const cuentaComoGasto = (g: GastoMes) =>
  !g.transferenciaInterna && (!g.prestamoSocio || g.viaBanco) && g.metodo !== "pendiente_atelier" && (g.metodo !== "socio" || !g.prestamoSocio);

/**
 * Las parejas gasto ↔ devolución del mes (A1). Solo ingresos de la operación, y nunca uno que ya resta del gasto
 * como «devolución de una persona» (lib/recuperos-entre-sedes.ts → devolucionesDeGastos): se contaría dos veces.
 */
export function compensacionesDelMes(d: Pick<DatosMesSede, "gastos" | "ingresos" | "recuperos">): Compensacion[] {
  const clave = (fecha: string, monto: number, nota: string | null) => `${fecha}|${monto.toFixed(2)}|${nota ?? ""}`;
  const yaRestan = new Set(Object.values(d.recuperos).flatMap((r) => r.deGastos).map((r) => clave(r.fecha, r.monto, r.nota)));
  return compensarGastosNoEjecutados(
    d.gastos.filter(cuentaComoGasto).map((g) => ({ id: g.id, fecha: g.fecha, monto: g.monto, concepto: g.concepto })),
    d.ingresos.filter((i) => esIngresoOperativo(i) && !i.venta && !yaRestan.has(clave(i.fecha, i.monto, i.nota)))
      .map((i) => ({ id: i.id, fecha: i.fecha, monto: i.monto, nota: i.nota })),
  );
}

/** Las filas con el tipo cruzado (A2). */
export function revisarTipoDelMes(d: Pick<DatosMesSede, "gastos" | "ingresos" | "avisos">): FilaRevisarTipo[] {
  return filasRevisarTipo({
    gastos: d.gastos.map((g) => ({ id: g.id, fecha: g.fecha, monto: g.monto, texto: g.concepto, categoria: g.categoria })),
    ingresos: d.ingresos.map((i) => ({ id: i.id, fecha: i.fecha, monto: i.monto, texto: i.nota })),
    avisos: d.avisos,
  });
}

/** Lo que entró y salió de la cuenta en el mes (hasta hastaHoy): el total de ingresos y egresos, igual al Excel. */
export function cajaDelMes(d: Pick<DatosMesSede, "gastos" | "ingresos">): { entro: number; salio: number; rescate: number } {
  return {
    entro: r2(suma(d.ingresos.filter(entroALaCuenta), (i) => i.monto)),
    salio: r2(suma(d.gastos.filter(salioDeLaCuenta), (g) => g.monto)),
    // Rescates de fondos mutuos: entran a la caja pero es plata propia que vuelve del ahorro.
    rescate: r2(suma(d.ingresos.filter((i) => entroALaCuenta(i) && /rescate/i.test(i.nota ?? "")), (i) => i.monto)),
  };
}

/** El día hasta el que se mide el mes (getSeisCifras): mes cerrado → el Excel; en curso → el común con Byte. */
export function corteDelMes(d: Pick<DatosMesSede, "finDeMes" | "hoy" | "corteExcel" | "ventas">): string | null {
  const ultimaVenta = d.ventas.reduce<string | null>((m, r) => (r.total > 0 && (m === null || r.date > m) ? r.date : m), null);
  // En un mes CERRADO cuenta el mes completo (el último día puede ser un domingo sin venta). El corte común es
  // para el mes en curso, cuando Byte va atrasado.
  return d.finDeMes < d.hoy ? d.corteExcel : corteComun(d.corteExcel, ultimaVenta);
}

/** Los cortes que necesitan recuperos (para que la lectura los pida). */
export function cortesDelMes(d: Pick<DatosMesSede, "finDeMes" | "hoy" | "corteExcel" | "ventas">): string[] {
  return [...new Set([corteDelMes(d), d.corteExcel].filter((c): c is string => c !== null))];
}

export function cifrasDelMes(d: DatosMesSede): CifrasSede {
  const corte = corteDelMes(d);
  const caja = cajaDelMes(d);
  const comp = compensacionesDelMes(d);
  const revisar = revisarTipoDelMes(d);
  const principal = { ...cifrasHasta(d, corte, caja, comp, revisar), fuenteExcel: d.fuenteExcel };
  if (corte === d.corteExcel) return principal;
  // La franja «según el Excel» sigue llegando hasta el último día del Excel, para cuadrar con Kelly.
  return { ...principal, segunExcel: { ...cifrasHasta(d, d.corteExcel, caja, comp, revisar), fuenteExcel: d.fuenteExcel } };
}

/** Qué filas entran a las cifras hasta un corte, y cuáles quedan fuera por A1 (compensadas) o A2 (tipo cruzado). */
function partesDelCorte(d: DatosMesSede, corte: string | null, comp: Compensacion[], revisar: FilaRevisarTipo[]) {
  const hasta = (f: string) => corte !== null && f <= corte;
  // Una pareja cuenta solo si las DOS patas ya están dentro del corte (en el mes en curso la devolución puede faltar).
  const fechaIngreso = new Map(d.ingresos.map((i) => [i.id, i.fecha]));
  const parejas = comp.filter((c) => hasta(c.fecha) && hasta(fechaIngreso.get(c.ingresoId) ?? "9999"));
  const gastoCompensado = new Set(parejas.map((c) => c.gastoId));
  const ingresoCompensado = new Set(parejas.map((c) => c.ingresoId));
  const revisarIds = new Set(revisar.filter((x) => hasta(x.fecha)).map((x) => x.id));
  const gastos = d.gastos.filter((g) => hasta(g.fecha) && cuentaComoGasto(g));
  return { hasta, parejas, gastoCompensado, ingresoCompensado, revisarIds, gastos, enCifras: gastos.filter((g) => !gastoCompensado.has(g.id) && !revisarIds.has(g.id)) };
}

/** Las filas de gasto que entran a las seis cifras del mes (corte principal): las que miran los controles. */
export function gastosEnCifras(d: DatosMesSede): GastoMes[] {
  return partesDelCorte(d, corteDelMes(d), compensacionesDelMes(d), revisarTipoDelMes(d)).enCifras;
}

function cifrasHasta(
  d: DatosMesSede, corte: string | null, caja: { entro: number; salio: number; rescate: number },
  comp: Compensacion[], revisar: FilaRevisarTipo[],
): CifrasSede {
  const { hasta, gastoCompensado, ingresoCompensado, revisarIds, gastos, enCifras } = partesDelCorte(d, corte, comp, revisar);
  const filas: FilaCifras[] = enCifras
    .map((g) => ({ categoria: g.categoria, concepto: g.concepto, monto: g.monto, propio: g.propio, pagadoPorSocio: g.metodo === "socio" }));
  const compensado = suma(gastos.filter((g) => gastoCompensado.has(g.id) && salioDeLaCuenta(g)), (g) => g.monto);
  const revisarGastos = suma(d.gastos.filter((g) => revisarIds.has(g.id) && salioDeLaCuenta(g)), (g) => g.monto);

  const ingresos = d.ingresos.filter((i) => hasta(i.fecha));
  const fueraDeCifras = (i: IngresoMes) => ingresoCompensado.has(i.id) || revisarIds.has(i.id);
  const cobros = suma(ingresos.filter((i) => esIngresoOperativo(i) && !fueraDeCifras(i)), (i) => i.monto);
  // Lo que entró POR VENTAS: las filas con Grupo «Ventas» del Excel (A4: aunque su nota parezca un reembolso).
  const porVentas = ingresos.filter((i) => i.venta && !i.prestamoSocio && !i.transferenciaInterna && i.noOperativo === null && !revisarIds.has(i.id));
  const recup = corte !== null ? d.recuperos[corte] ?? { recuperos: [], deGastos: [] } : { recuperos: [], deGastos: [] };
  const devGastos = r2(suma(recup.deGastos, (r) => r.monto));

  // Lo que entró sin ser de la operación, por tipo (conciliación del mes). Mismo filtro que «entró».
  const entran = ingresos.filter(entroALaCuenta);
  const prestamo = (i: IngresoMes) => /pr.stamo/i.test(i.noOperativo ?? "");
  // `nota ILIKE …` con nota NULL no cuenta ni como rescate ni como «otros» (así lo hacía el SQL).
  const esRescate = (i: IngresoMes) => i.nota !== null && /rescate|fondos mutuos/i.test(i.nota);
  const noOpSinPrestamo = (i: IngresoMes) => !esReembolsoEfectivo(i) && !i.prestamoSocio && i.noOperativo !== null && !prestamo(i);
  const ingresosFuera: IngresosFuera | undefined = corte !== null ? {
    devolucionesSedes: r2(suma(entran.filter(esReembolsoEfectivo), (i) => i.monto)),
    prestamos: r2(suma(entran.filter((i) => !esReembolsoEfectivo(i) && (prestamo(i) || i.prestamoSocio)), (i) => i.monto)),
    rescates: r2(suma(entran.filter((i) => noOpSinPrestamo(i) && esRescate(i)), (i) => i.monto)),
    otros: r2(suma(entran.filter((i) => noOpSinPrestamo(i) && i.nota !== null && !esRescate(i)), (i) => i.monto)),
    devolucionesGastos: devGastos,
    compensados: r2(suma(entran.filter((i) => ingresoCompensado.has(i.id)), (i) => i.monto)),
    revisarTipo: r2(suma(entran.filter((i) => revisarIds.has(i.id)), (i) => i.monto)),
  } : undefined;

  const tope = corte ?? d.hastaHoy;
  const vHasta = suma(d.ventas.filter((r) => r.date <= tope), (r) => r.total);
  const vDespues = suma(d.ventas.filter((r) => r.date > tope), (r) => r.total);
  return cifrasDeSede({
    businessId: d.businessId, sede: d.sede, mes: d.mes, finDeMes: d.finDeMes, corte, corteExcel: d.corteExcel, filas,
    ventas: vHasta > 0 ? vHasta : null, ventasPosteriores: corte ? vDespues : 0,
    caja,
    // Las devoluciones de personas restan del gasto: dejan de ser «otros ingresos».
    cobrado: corte !== null ? Math.round((cobros - devGastos) * 100) / 100 : null,
    ingresadoVentas: corte !== null && porVentas.length > 0 ? suma(porVentas, (i) => i.monto) : null,
    recuperos: recup.recuperos.map((r) => ({ categoria: r.categoria, monto: r.monto, concepto: r.nota })),
    ingresosFuera,
    compensado: r2(compensado), revisarTipo: r2(revisarGastos),
  });
}
