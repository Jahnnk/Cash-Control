"use server";

/**
 * Palancas del EBITDA · el punto de partida REAL de cada sede (solo dirección, solo lectura).
 * Promedia los últimos meses cerrados con las mismas seis cifras del Dashboard (lib/seis-cifras-sql.ts): no hay un
 * cálculo nuevo. El simulador vive en lib/palancas.ts y no guarda nada.
 */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { cifrasDeSedeEnMes, hoyLima } from "@/lib/seis-cifras-sql";
import { leerConfigProfitFirst } from "@/lib/profit-first-config-sql";
import { baseDePalancas, type BasePalancas, type MesBase } from "@/lib/palancas";

const sql = neon(process.env.DATABASE_URL!);
const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];
/** Cuántos meses hacia atrás se miran para encontrar tres cerrados. */
const MESES_ATRAS = 5;

export type PalancasSede = { businessId: number; sede: string; base: BasePalancas | null };
export type DatosPalancas = { sedes: PalancasSede[]; /** EBITDA objetivo del CEO (% de la venta). */ ebitdaMetaPct: number };

function mesesAnteriores(hoy: string, n: number): string[] {
  const out: string[] = [];
  let a = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  for (let i = 0; i < n; i++) { m -= 1; if (m === 0) { m = 12; a -= 1; } out.push(`${a}-${String(m).padStart(2, "0")}`); }
  return out;
}

export async function getBasePalancas(): Promise<{ ok: true; data: DatosPalancas } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  try {
    const hoy = hoyLima();
    const meses = mesesAnteriores(hoy, MESES_ATRAS);
    const { config } = await leerConfigProfitFirst(sql);
    const sedes = await Promise.all(SEDES.map(async ([bId, sede]): Promise<PalancasSede> => {
      const cifras = await Promise.all(meses.map((mes) => cifrasDeSedeEnMes(sql as never, bId, sede, mes, hoy)));
      const cerrados: MesBase[] = cifras
        .filter((c) => c.mesCompleto && c.conResultado && (c.ventas ?? 0) > 0)
        .map((c) => ({ mes: c.mes, ventas: c.ventas ?? 0, costos: c.costos, gastos: c.gastos, planilla: c.planilla, bolsa: c.fuera.deudas + c.fuera.inversion + c.impuestos }));
      return { businessId: bId, sede, base: baseDePalancas(cerrados, config.utilidadPct) };
    }));
    return { ok: true, data: { sedes, ebitdaMetaPct: config.ebitdaPct } };
  } catch (e) {
    console.error("[getBasePalancas] failed:", e);
    return { ok: false, error: "No se pudo leer el punto de partida de las palancas." };
  }
}
