/**
 * Compromisos de pago de los próximos días · MOTOR (puro).
 *
 * Pedido de Jahnn (6-oct-2026, capítulo «Tu sistema mensual de control financiero»): en la
 * revisión semanal, «saldo bancario vs. compromisos»: el saldo de hoy menos todo lo que vence en
 * los próximos 7–14 días. Decisión de Jahnn: que el sistema los arme solo.
 *
 * Cómo los arma:
 *   · Los pagos fijos (planilla, alquiler, servicios, cuotas, contador, IR, socios) se repiten cada
 *     mes en la misma parte del mes, aunque el concepto cambie de nombre («NOMINA JULIO»,
 *     «SUELDO AGOSTO 26»). Por eso se detectan por CATEGORÍA y TRAMO del mes (días 1–7, 8–14,
 *     15–21, 22–fin): un tramo con pagos en 2 de los últimos 3 meses es un compromiso.
 *   · Monto: el del presupuesto aprobado de esa categoría (si hay), repartido entre sus tramos según
 *     cómo se pagó en esos meses; si no hay presupuesto, el promedio de lo pagado.
 *   · Lo que ya se pagó este mes en ese tramo se descuenta.
 *   · Se suman las facturas a crédito de Control de Caja (fecha de vencimiento exacta) y los
 *     compromisos que se anotan a mano.
 */

export const CATEGORIAS_COMPROMISO = [
  "PLANILLA", "ALQUILER", "SERVICIOS", "PRÉSTAMOS Y TARJETAS", "CONTABILIDAD Y ASESORÍAS",
  "IMPUESTOS", "UTILIDADES A SOCIOS", "SS BANCARIOS",
] as const;

/** Un tramo es recurrente si tuvo pagos en al menos estos meses de los analizados. */
export const MESES_PARA_RECURRENTE = 2;

export type Tramo = 1 | 2 | 3 | 4;
export const tramoDe = (dia: number): Tramo => (dia <= 7 ? 1 : dia <= 14 ? 2 : dia <= 21 ? 3 : 4);
export const NOMBRE_TRAMO: Record<Tramo, string> = { 1: "inicio de mes", 2: "segunda semana", 3: "tercera semana", 4: "fin de mes" };

export type Pago = { fecha: string; monto: number; categoria: string };

export type Patron = {
  categoria: string;
  tramo: Tramo;
  /** Día típico del mes (mediana de los pagos de ese tramo). */
  dia: number;
  /** Qué parte del total mensual de la categoría se paga en este tramo (0–1). */
  participacion: number;
  /** Promedio pagado en este tramo en los meses en que hubo pago. */
  promedio: number;
  meses: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const mediana = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
export const ultimoDia = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const sumarDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Los tramos que se repiten, a partir de los pagos de los meses cerrados indicados. */
export function detectarPatrones(pagos: Pago[], meses: string[]): Patron[] {
  const cats = new Set<string>(CATEGORIAS_COMPROMISO);
  const delPeriodo = pagos.filter((p) => cats.has(p.categoria) && meses.includes(p.fecha.slice(0, 7)) && p.monto > 0);
  const out: Patron[] = [];
  for (const categoria of CATEGORIAS_COMPROMISO) {
    const deCat = delPeriodo.filter((p) => p.categoria === categoria);
    if (!deCat.length) continue;
    const totalMes = new Map(meses.map((m) => [m, deCat.filter((p) => p.fecha.startsWith(m)).reduce((t, p) => t + p.monto, 0)]));
    for (const tramo of [1, 2, 3, 4] as Tramo[]) {
      const enTramo = deCat.filter((p) => tramoDe(Number(p.fecha.slice(8, 10))) === tramo);
      const mesesConPago = meses.filter((m) => enTramo.some((p) => p.fecha.startsWith(m)));
      if (mesesConPago.length < MESES_PARA_RECURRENTE) continue;
      const porMes = mesesConPago.map((m) => enTramo.filter((p) => p.fecha.startsWith(m)).reduce((t, p) => t + p.monto, 0));
      const partes = mesesConPago.map((m, i) => (totalMes.get(m)! > 0 ? porMes[i] / totalMes.get(m)! : 0));
      out.push({
        categoria, tramo,
        dia: Math.round(mediana(enTramo.map((p) => Number(p.fecha.slice(8, 10))))),
        participacion: partes.reduce((t, x) => t + x, 0) / partes.length,
        promedio: r2(porMes.reduce((t, x) => t + x, 0) / porMes.length),
        meses: mesesConPago.length,
      });
    }
  }
  // Las participaciones de una categoría se normalizan para que sumen 1 (el presupuesto se reparte entero).
  for (const categoria of new Set(out.map((p) => p.categoria))) {
    const ps = out.filter((p) => p.categoria === categoria);
    const suma = ps.reduce((t, p) => t + p.participacion, 0);
    if (suma > 0) for (const p of ps) p.participacion = p.participacion / suma;
  }
  return out;
}

export type Compromiso = {
  fecha: string;
  concepto: string;
  monto: number;
  origen: "recurrente" | "credito" | "manual";
  categoria?: string;
  /** Para poder descartar uno detectado (recurrente): categoría|tramo|mes. */
  clave?: string;
  id?: number;
};

export type EntradaCompromisos = {
  patrones: Patron[];
  /** Desde qué fecha cuenta (el día del saldo del banco: lo anterior ya está descontado del saldo). */
  desde: string;
  /** Hasta qué fecha (hoy + 14). */
  hasta: string;
  /** Total del mes de una categoría según el presupuesto aprobado (null = no hay). */
  presupuestoMes: (categoria: string, mes: string) => number | null;
  /** Lo ya pagado por categoría, mes y tramo (para descontar). */
  pagado: Pago[];
  /** Claves descartadas a mano. */
  ignorados: Set<string>;
};

/** Los pagos fijos que caen entre `desde` (exclusive) y `hasta` (inclusive). */
export function proyectarRecurrentes(e: EntradaCompromisos): Compromiso[] {
  const out: Compromiso[] = [];
  const meses = [...new Set([e.desde.slice(0, 7), e.hasta.slice(0, 7)])];
  for (const mes of meses) {
    for (const p of e.patrones) {
      const clave = `${p.categoria}|${p.tramo}|${mes}`;
      if (e.ignorados.has(clave)) continue;
      const fecha = `${mes}-${String(Math.min(p.dia, ultimoDia(mes))).padStart(2, "0")}`;
      if (fecha <= e.desde || fecha > e.hasta) continue;
      const total = e.presupuestoMes(p.categoria, mes);
      const esperado = total !== null ? total * p.participacion : p.promedio;
      const yaPagado = e.pagado
        .filter((x) => x.categoria === p.categoria && x.fecha.startsWith(mes) && tramoDe(Number(x.fecha.slice(8, 10))) === p.tramo)
        .reduce((t, x) => t + x.monto, 0);
      const falta = r2(esperado - yaPagado);
      if (falta < Math.max(20, esperado * 0.05)) continue;
      out.push({
        fecha, concepto: `${p.categoria.charAt(0)}${p.categoria.slice(1).toLowerCase()} · ${NOMBRE_TRAMO[p.tramo]}`,
        monto: falta, origen: "recurrente", categoria: p.categoria, clave,
      });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export type Liquidez = {
  saldo: number;
  /** Lo que suele entrar por ventas en el período (estimado, conservador). */
  entradas: number;
  compromisos7: number;
  compromisos14: number;
  /** saldo + entradas − compromisos de 14 días. */
  libre14: number;
  semaforo: "verde" | "ambar" | "rojo";
};

/**
 * El semáforo de la tarjeta «saldo vs. compromisos»:
 *   rojo  = ni con lo que suele entrar alcanza para los pagos de 14 días;
 *   ámbar = el saldo de hoy no cubre los pagos de 7 días (depende de lo que entre);
 *   verde = alcanza.
 */
export function liquidezContraCompromisos(saldo: number, entradas: number, compromisos: Compromiso[], hoy: string): Liquidez {
  const en7 = sumarDias(hoy, 7);
  const compromisos7 = r2(compromisos.filter((c) => c.fecha <= en7).reduce((t, c) => t + c.monto, 0));
  const compromisos14 = r2(compromisos.reduce((t, c) => t + c.monto, 0));
  const libre14 = r2(saldo + entradas - compromisos14);
  const semaforo = libre14 < 0 ? "rojo" : saldo < compromisos7 ? "ambar" : "verde";
  return { saldo: r2(saldo), entradas: r2(entradas), compromisos7, compromisos14, libre14, semaforo };
}
