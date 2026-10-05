/**
 * La venta de un día, cuando hay más de una fuente · MOTOR (puro).
 *
 * Tres datos independientes de la misma venta:
 *   · el reporte oficial de Byte (lo sube la sede),
 *   · la copia de Byte en el Excel (pestaña "Control de VTAS"),
 *   · lo que registra el administrador en su panel.
 *
 * Regla (pedido de Jahnn, 25-sep-2026: "usar las ventas de mis
 * administradores para reforzar los datos de Byte"): manda Byte, salvo que
 * Byte y el Excel difieran y el administrador confirme el Excel — dos de
 * tres. Caso real: el 30/08 el reporte de Byte de Fonavi decía S/102.10 (se
 * bajó antes de cerrar el día); el Excel S/899.60 y el administrador
 * S/899.60. Gana S/899.60.
 *
 * Lo usan el cargador de ventas (dashboard, deck) y la verificación contra
 * el Excel: si eligieran distinto, se contradirían.
 */

/** A partir de cuánto dos fuentes "no coinciden" en un día. */
export const TOLERANCIA_DESACUERDO = 5;
/** Hasta cuánto el administrador "coincide" con una fuente (redondeos). */
export const TOLERANCIA_COINCIDE = 1;

export type FuenteVenta = "byte" | "excel" | "admin";
export type MotivoEleccion =
  | "unica"               // solo había una fuente
  | "coinciden"           // las fuentes dicen lo mismo (± S/5)
  | "admin-confirma-excel"
  | "admin-confirma-byte"
  | "sin-desempate"       // no coinciden y no hay tercer dato que decida
  | "dias-juntos";        // Byte juntó varios días en uno; manda lo que anotó el administrador día por día

export type EleccionDia = { total: number; fuente: FuenteVenta; motivo: MotivoEleccion };

const cerca = (a: number, b: number, tol: number) => Math.abs(a - b) < tol;

export function elegirVentaDia(byte?: number | null, excel?: number | null, admin?: number | null): EleccionDia | null {
  const b = byte ?? null, e = excel ?? null, a = admin ?? null;
  if (b !== null) {
    if (e === null) {
      if (a === null || cerca(a, b, TOLERANCIA_DESACUERDO)) return { total: b, fuente: "byte", motivo: a === null ? "unica" : "coinciden" };
      return { total: b, fuente: "byte", motivo: "sin-desempate" };
    }
    if (cerca(b, e, TOLERANCIA_DESACUERDO)) return { total: b, fuente: "byte", motivo: "coinciden" };
    if (a !== null && cerca(a, e, TOLERANCIA_COINCIDE) && !cerca(a, b, TOLERANCIA_COINCIDE)) return { total: e, fuente: "excel", motivo: "admin-confirma-excel" };
    if (a !== null && cerca(a, b, TOLERANCIA_COINCIDE)) return { total: b, fuente: "byte", motivo: "admin-confirma-byte" };
    return { total: b, fuente: "byte", motivo: "sin-desempate" };
  }
  if (e !== null) {
    if (a === null || cerca(a, e, TOLERANCIA_DESACUERDO)) return { total: e, fuente: "excel", motivo: a === null ? "unica" : "coinciden" };
    return { total: e, fuente: "excel", motivo: "sin-desempate" };
  }
  if (a !== null) return { total: a, fuente: "admin", motivo: "unica" };
  return null;
}


// ─── Días que Byte junta en uno ──────────────────────────────────────────
//
// Si en una sede nadie abre la caja de Byte un día (Fonavi, domingo 04/10/2026),
// Byte suma esas ventas al día anterior: el reporte dice S/1,664.30 el sábado 03
// y nada el domingo 04. Tomarlo tal cual pone el domingo dentro del sábado (y
// del promedio, el ticket y la semana equivocada); sumarle además lo que anotó
// el administrador contaría el domingo dos veces.
//
// Regla (la misma idea de «dos de tres», con la suma de los días): si Byte tiene
// un día D con venta, los días siguientes no tienen nada en Byte, y lo que anotó
// el administrador de D y de los días siguientes SUMA lo que dice Byte (± S/5),
// se usa lo del administrador, día por día. Si el administrador de D solo ya
// coincide con Byte, no hay nada que separar. Si no cuadra la suma, no se
// adivina: se mantiene Byte y se avisa.

/** Cuántos días seguidos como máximo puede juntar Byte (el día D más los siguientes). */
export const MAX_DIAS_SIGUIENTES = 3;

export type VentaFecha = { date: string; total: number };
export type FuentesDia = { byte: VentaFecha[]; kelly: VentaFecha[]; registro: VentaFecha[] };

/** Byte tiene la venta de un día, pero el administrador anotó días siguientes que Byte no tiene y no suman. */
export type AvisoDiasJuntos = { fecha: string; byte: number; administrador: { fecha: string; total: number }[] };

export function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Elige la venta de cada día entre las tres fuentes. `despues` son los días que
 * siguen al periodo pedido (hasta MAX_DIAS_SIGUIENTES): solo sirven para ver si
 * Byte juntó el último día con los siguientes; no salen en el resultado.
 */
export function resolverVentasPorDia(
  f: FuentesDia,
  despues?: FuentesDia,
): { dias: Map<string, EleccionDia>; avisos: AvisoDiasJuntos[] } {
  const mapa = (xs: VentaFecha[], ys?: VentaFecha[]) => new Map([...xs, ...(ys ?? [])].map((r) => [r.date, r.total]));
  const b = mapa(f.byte, despues?.byte), e = mapa(f.kelly, despues?.kelly), a = mapa(f.registro, despues?.registro);
  const fuera = new Set([...(despues?.byte ?? []), ...(despues?.kelly ?? []), ...(despues?.registro ?? [])].map((r) => r.date));
  // La cifra de Byte de un día: el reporte oficial o, si no hay, su copia en el Excel.
  const ladoByte = (d: string) => b.get(d) ?? e.get(d);

  const todas = [...new Set([...b.keys(), ...e.keys(), ...a.keys()])].sort();
  const dias = new Map<string, EleccionDia>();
  const avisos: AvisoDiasJuntos[] = [];
  const usados = new Set<string>();

  for (const d of todas) {
    if (usados.has(d)) continue;
    const bd = ladoByte(d);
    const ad = a.get(d);
    if (bd === undefined || bd <= 0 || ad === undefined || cerca(ad, bd, TOLERANCIA_DESACUERDO)) continue;
    // ¿Los días que siguen, sin nada en Byte, completan lo que dice Byte?
    const tramo: { fecha: string; total: number }[] = [{ fecha: d, total: ad }];
    let juntados = false;
    for (let k = 1; k <= MAX_DIAS_SIGUIENTES; k++) {
      const dk = sumarDias(d, k);
      const ak = a.get(dk);
      if (ladoByte(dk) !== undefined || ak === undefined) break;
      tramo.push({ fecha: dk, total: ak });
      const suma = tramo.reduce((s, x) => s + x.total, 0);
      if (cerca(suma, bd, TOLERANCIA_DESACUERDO)) {
        for (const x of tramo) { dias.set(x.fecha, { total: x.total, fuente: "admin", motivo: "dias-juntos" }); usados.add(x.fecha); }
        juntados = true;
        break;
      }
    }
    // El administrador anotó el día siguiente, Byte no, y Byte sigue con días después: se parece a «días juntos» pero no suma.
    if (!juntados && tramo.length > 1 && todas.some((x) => x > tramo[tramo.length - 1].fecha && ladoByte(x) !== undefined)) {
      avisos.push({ fecha: d, byte: bd, administrador: tramo });
    }
  }

  for (const d of todas) {
    if (usados.has(d) || fuera.has(d)) continue;
    const x = elegirVentaDia(b.get(d), e.get(d), a.get(d));
    if (x) dias.set(d, x);
  }
  for (const d of [...dias.keys()]) if (fuera.has(d)) dias.delete(d);
  return { dias, avisos: avisos.filter((x) => !fuera.has(x.fecha)) };
}
