/**
 * Lo que otra sede DEVUELVE por un gasto que esta sede pagó entero · lógica PURA.
 *
 * Conciliación de setiembre con Jahnn (16-oct-2026): Fonavi paga el sueldo de Luana completo (PLANILLA) y
 * Centro le devuelve el 50%, que en Centro también es PLANILLA. Fonavi contaba el 100% y Centro el 50%: el
 * grupo contaba 150% del sueldo. Igual con el aceite de oliva (Atelier compra y cada cafetería devuelve
 * S/153) o la mochila de delivery. La devolución se excluía del ingreso (bien: no es venta), pero nadie la
 * restaba del gasto de quien pagó.
 *
 * Regla: una devolución de otra sede (is_fonavi_reimbursement) se RESTA del gasto de la sede que la recibe,
 * en la categoría que dicen las reglas, SALVO que:
 *   · sea un préstamo (la cuota que Atelier devuelve a Centro): no es gasto de nadie;
 *   · sea plata que no era de la sede (pago mal hecho, venta de otra sede, Yape equivocado): su salida ya
 *     está fuera del gasto (DEVOLUCIONES);
 *   · ese gasto ya se repartió en origen: un gasto compartido de la sede con la parte de otra sede por el
 *     MISMO monto (±S/0.05) dentro de 45 días (alquiler, luz y agua del local de Atelier).
 *     Restarla otra vez sería contar la parte de la otra sede como menos gasto dos veces.
 *
 * Gasto mal ejecutado que SÍ está como gasto (25-oct-2026, auditoría de Fonavi set con Jahnn): Fonavi pagó S/100
 * de la reparación de una refrigeradora que era de Atelier («MNTO REFRIGERADORA», MANTENIMIENTO) y Atelier se los
 * devolvió el 30/09 («DEVOLUCIÓN POR GASTOS MAL EJECUTADO ARREGLO REFRI»). Jahnn quiere ver el egreso en su
 * categoría real; entonces la devolución tiene que RESTAR de esa categoría. Regla: si la nota dice «mal
 * ejecutado / mal hecho / duplicado / por error» (no una venta) y la sede tiene un gasto de la operación por el
 * MISMO monto (±S/0.05) hasta 45 días antes, que además comparte una palabra del concepto con la devolución
 * («REFRI» ↔ «REFRIGERADORA»: el monto solo no basta, S/100 se repite mucho), la devolución resta de la categoría
 * de ese gasto. Cada gasto explica una sola devolución. Si no hay ese gasto (lo pagado está en DEVOLUCIONES), sigue
 * sin restar, como antes.
 */

import { clasificarGasto, POR_ACLARAR } from "./reglas-gasto";

export type DevolucionRecibida = { fecha: string; monto: number; nota: string };
/** Un gasto compartido de la sede: `otras` = la parte de las otras sedes (monto − propio). */
export type GastoRepartido = { fecha: string; otras: number };
/** Un gasto de la operación de la sede (categoría de costo o gasto), para emparejar un pago mal ejecutado devuelto. */
export type GastoDeLaSede = { fecha: string; monto: number; categoria: string; concepto: string };
export type Recupero = { fecha: string; monto: number; categoria: string; nota: string };
export type MotivoNoResta = "prestamo" | "no-era-de-la-sede" | "ya-repartido";

const VENTANA_DIAS = 45;
/** Plata pagada por error que otra sede devuelve. */
const MAL_EJECUTADO = /MAL EJECUTAD|MAL HECHO|POR ERROR|DUPLICAD/;
/** Palabras que no dicen de qué era el gasto. */
const VACIAS = new Set(["DEVOLUCION", "DEVOLUCIONES", "GASTO", "GASTOS", "PAGO", "PAGOS", "EJECUTADO", "EJECUTADOS", "HECHO", "ERROR", "DUPLICADO", "PRODUCTOS", "SALUDABLES", "YAYIS", "SERVICIOS", "SERVCIOS", "GASTRONOMICOS", "EXPERIENCIAS", "SETIEMBRE", "SEPTIEMBRE", "OCTUBRE", "AGOSTO", "PARA", "CON", "POR"]);
const palabras = (t: string) => norm(t).replace(/\([^)]*\)/g, " ").split(/[^A-Z0-9]+/).filter((w) => w.length >= 4 && !VACIAS.has(w));
/** ¿La devolución y el gasto hablan de lo mismo? (una palabra en común, o una que empieza como la otra: REFRI/REFRIGERADORA). */
export function hablanDeLoMismo(devolucion: string, gasto: string): boolean {
  const g = palabras(gasto);
  return palabras(devolucion).some((w) => g.some((x) => x.startsWith(w) || w.startsWith(x)));
}
const TOLERANCIA = 0.05;

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

/** Por qué una devolución NO se resta del gasto (null = sí se resta). */
export function motivoNoResta(d: DevolucionRecibida, repartidos: GastoRepartido[]): MotivoNoResta | null {
  const t = norm(d.nota);
  if (/PRESTAMO/.test(t)) return "prestamo";
  if (/MAL EJECUTADO|MAL HECHO|POR ERROR|EQUIVOCAD|DUPLICAD|VENTA /.test(t)) return "no-era-de-la-sede";
  if (repartidos.some((g) => Math.abs(g.otras - d.monto) <= TOLERANCIA && dias(g.fecha, d.fecha) <= VENTANA_DIAS)) return "ya-repartido";
  return null;
}

/**
 * Las devoluciones que se restan del gasto, con su categoría. Cada gasto repartido explica UNA sola
 * devolución (dos devoluciones de S/2.31 no se esconden detrás del mismo recibo).
 */
export function recuperosDeOtrasSedes(devoluciones: DevolucionRecibida[], repartidos: GastoRepartido[], gastos: GastoDeLaSede[] = []): Recupero[] {
  const libres = [...repartidos];
  const gastosLibres = [...gastos];
  const out: Recupero[] = [];
  for (const d of [...devoluciones].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (!(d.monto > 0)) continue;
    const i = libres.findIndex((g) => Math.abs(g.otras - d.monto) <= TOLERANCIA && dias(g.fecha, d.fecha) <= VENTANA_DIAS);
    const motivo = motivoNoResta(d, i >= 0 ? [libres[i]] : []);
    if (motivo === "ya-repartido") { libres.splice(i, 1); continue; }
    if (motivo === "no-era-de-la-sede" && MAL_EJECUTADO.test(norm(d.nota)) && !/VENTA /.test(norm(d.nota))) {
      // El pago mal ejecutado quedó como gasto de la sede: la devolución resta de ESA categoría.
      // Si hay varios (Fonavi: «REVISIÓN REFRIGERADORA» 27/08 y «MNTO REFRIGERADORA» 09/09, S/100 cada uno), el más cercano.
      let j = -1;
      gastosLibres.forEach((g, k) => {
        if (Math.abs(g.monto - d.monto) <= TOLERANCIA && g.fecha <= d.fecha && dias(g.fecha, d.fecha) <= VENTANA_DIAS && hablanDeLoMismo(d.nota, g.concepto)
          && (j < 0 || g.fecha > gastosLibres[j].fecha)) j = k;
      });
      if (j >= 0) {
        out.push({ fecha: d.fecha, monto: d.monto, categoria: gastosLibres[j].categoria, nota: d.nota });
        gastosLibres.splice(j, 1);
      }
      continue;
    }
    if (motivo) continue;
    // El concepto dice de qué era (las reglas quitan el paréntesis con la empresa que devuelve).
    const cat = clasificarGasto(d.nota.replace(/\([^)]*\)/g, " ").replace(/REEMBOLSO|DEVOLUCI[OÓ]N/gi, " "));
    out.push({ fecha: d.fecha, monto: d.monto, categoria: cat === POR_ACLARAR ? POR_ACLARAR : cat, nota: d.nota });
  }
  return out;
}

/**
 * Devoluciones de PERSONAS por un gasto (auditoría abr–set, 16-oct-2026): Kelly devolvió S/900 de un
 * alquiler pagado dos veces y S/90 de un SIS (Fonavi, jul); una colaboradora devolvió sueldo; sobrantes de
 * caja chica. Entraban como «otros ingresos» y el gasto seguía contado entero: la ganancia real (que parte
 * de la venta de Byte, no de los ingresos) los ignoraba. Ahora restan del gasto en su categoría y salen de
 * «otros ingresos» (si no, el resultado de la operación los contaría dos veces).
 * Solo cuando el concepto dice que la plata VUELVE y las reglas saben de qué gasto era; si no, se queda
 * como otro ingreso (mejor no adivinar).
 */
const VUELVE_GASTO = /REEMBOLS|DEVOLUCI|REINTEGRO|SOBRANTE|NO EJECUTADO/;
const CAJA_CHICA = /CAJAS? CHICAS?/;

export function devolucionesDeGastos(ingresos: DevolucionRecibida[]): Recupero[] {
  const out: Recupero[] = [];
  for (const d of ingresos) {
    const t = norm(d.nota ?? "");
    if (!(d.monto > 0) || !VUELVE_GASTO.test(t) || /PRESTAMO|VENTA|CREDITO/.test(t)) continue;
    const cat = CAJA_CHICA.test(t)
      ? "CAJA CHICA"
      : clasificarGasto(t.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/REEMBOLSOS?|REEMBOLZO|DEVOLUCION(ES)?|REINTEGRO/g, " "));
    if (cat === POR_ACLARAR) continue;
    out.push({ fecha: d.fecha, monto: d.monto, categoria: cat, nota: d.nota });
  }
  return out;
}
