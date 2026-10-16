"use server";

/**
 * Mano de obra por producto (método 2 del coach: planilla repartida por ventas) de una cafetería
 * o de Fonavi + Centro juntas, en un mes. Solo dirección. Junta lo vendido por producto y su costo
 * de insumos (getRentabilidadProductos) con la planilla de las seis cifras. Cálculo y reglas:
 * lib/productos/mano-de-obra.ts.
 */

import { getRentabilidadProductos } from "./productos-panorama";
import { getSeisCifras, type SeisCifras } from "./seis-cifras";
import { regla33 } from "@/lib/regla-33";
import { manoDeObraPorProducto, type ManoDeObraSede } from "@/lib/productos/mano-de-obra";
import { CAFETERIAS, IDS_CAFETERIAS } from "@/lib/productos/cafeterias";

const NOMBRE: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** La planilla y la venta de esas sedes en un mes, si el mes ya tiene todo cargado. */
function baseDe(cifras: SeisCifras, ids: number[]): { planilla: number; ventas: number } | null {
  const filas = regla33(cifras).filter((f) => !f.esGrupo && ids.some((id) => NOMBRE[id] === f.etiqueta));
  if (filas.length !== ids.length || filas.some((f) => !f.planilla || f.ventas === null || !f.mesCompleto)) return null;
  return { planilla: filas.reduce((t, f) => t + f.planilla!.monto, 0), ventas: filas.reduce((t, f) => t + (f.ventas ?? 0), 0) };
}

export async function getManoDeObraProductos(mes: string, businessId: number): Promise<
  { ok: true; data: ManoDeObraSede | null; nota: string | null } | { ok: false; error: string }
> {
  const rent = await getRentabilidadProductos(mes, businessId);
  if (!rent.ok) return { ok: false, error: rent.error };
  if (!rent.data) return { ok: true, data: null, nota: null };
  const ids = businessId === CAFETERIAS ? IDS_CAFETERIAS : [businessId];
  try {
    // La planilla se reparte con un mes completo: el elegido, o el anterior si el elegido está a medias
    // (la planilla y el alquiler se pagan a fin de mes: a mitad de mes saldría una planilla de mentira).
    let usado = mes;
    let cifras = await getSeisCifras(mes);
    let base = cifras.ok ? baseDe(cifras.data, ids) : null;
    if (!base) {
      usado = mesMas(mes, -1);
      cifras = await getSeisCifras(usado);
      base = cifras.ok ? baseDe(cifras.data, ids) : null;
    }
    if (!base || !cifras.ok) return { ok: true, data: null, nota: "Todavía no hay un mes con la planilla completa para repartir." };
    const metaCostos = (100 - cifras.data.config.ebitdaPct) / 2;
    const data = manoDeObraPorProducto(rent.data, { ...base, mes: usado }, metaCostos);
    return { ok: true, data, nota: usado !== mes ? `La planilla de ${nombreMes(mes)} todavía no está completa (se paga a fin de mes): se reparte la de ${nombreMes(usado)}, que sí lo está.` : null };
  } catch (e) {
    console.error("[getManoDeObraProductos] failed:", e);
    return { ok: false, error: "No se pudo repartir la planilla entre los productos." };
  }
}
