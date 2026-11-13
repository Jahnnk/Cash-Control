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
import { gastoPorCategoria } from "@/lib/presupuesto-datos";
import { diagnosticar, type Diagnostico, type MesGasto } from "@/lib/fugas";

const sql = neon(process.env.DATABASE_URL!);
const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];
/** Cuántos meses hacia atrás se miran: tres cerrados para partir y hasta tres más para comparar (Fase 3). */
const MESES_ATRAS = 7;
const META_MERMA_POR_DEFECTO = 4;

export type PalancasSede = { businessId: number; sede: string; base: BasePalancas | null; /** Fase 3: gastos fijos, fugas y focos. */ diagnostico: Diagnostico | null };
export type DatosPalancas = { sedes: PalancasSede[]; /** EBITDA objetivo del CEO (% de la venta). */ ebitdaMetaPct: number };

function mesesAnteriores(hoy: string, n: number): string[] {
  const out: string[] = [];
  let a = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  for (let i = 0; i < n; i++) { m -= 1; if (m === 0) { m = 12; a -= 1; } out.push(`${a}-${String(m).padStart(2, "0")}`); }
  return out;
}

const finDe = (mes: string) => { const [a, m] = mes.split("-").map(Number); return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`; };

/** Fase 3 · gastos fijos por categoría, mermas y descuentos de los mismos meses cerrados (solo lectura). */
async function leerDiagnostico(bId: number, cerrados: MesBase[], base: BasePalancas): Promise<Diagnostico | null> {
  const orden = [...cerrados].sort((a, b) => a.mes.localeCompare(b.mes));
  const recientes = orden.filter((m) => base.meses.includes(m.mes));
  const previos = orden.filter((m) => !base.meses.includes(m.mes)).slice(-3);
  const todos = [...previos, ...recientes];
  const desde = `${todos[0].mes}-01`, hasta = finDe(todos[todos.length - 1].mes);
  const [gastos, mermas, motivos, descuentos, meta] = await Promise.all([
    gastoPorCategoria(bId, desde, hasta),
    sql`SELECT to_char(date, 'YYYY-MM') AS mes, SUM(mermas_soles)::float AS total FROM upselling_daily
        WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} AND mermas_soles IS NOT NULL GROUP BY 1` as unknown as Promise<{ mes: string; total: number }[]>,
    sql`SELECT to_char(date, 'YYYY-MM') AS mes, COALESCE(motivo, 'Sin motivo') AS motivo, SUM(total)::float AS total FROM merma_items
        WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} GROUP BY 1, 2` as unknown as Promise<{ mes: string; motivo: string; total: number }[]>,
    sql`SELECT to_char(date, 'YYYY-MM') AS mes, SUM(COALESCE(descuentos, 0))::float AS total FROM byte_ventas_efectiva
        WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} GROUP BY 1` as unknown as Promise<{ mes: string; total: number }[]>,
    sql`SELECT mermas_max_pct::float AS pct FROM kpi_targets WHERE business_id = ${bId} ORDER BY effective_month DESC LIMIT 1` as unknown as Promise<{ pct: number | null }[]>,
  ]);
  const aMes = (m: MesBase): MesGasto => ({ mes: m.mes, ventas: m.ventas, porCategoria: Object.fromEntries(gastos.filter((g) => g.mes === m.mes).map((g) => [g.categoria, g.monto])) });
  const enRecientes = (mes: string) => base.meses.includes(mes);
  const enPrevios = (mes: string) => previos.some((m) => m.mes === mes);
  const suma = (l: { total: number }[]) => l.reduce((t, x) => t + (x.total ?? 0), 0);
  const mermasRec = mermas.filter((m) => enRecientes(m.mes));
  const descRec = descuentos.filter((d) => enRecientes(d.mes)), descPrev = descuentos.filter((d) => enPrevios(d.mes));
  const porMotivo = new Map<string, number>();
  for (const m of motivos) if (enRecientes(m.mes)) porMotivo.set(m.motivo, (porMotivo.get(m.motivo) ?? 0) + m.total);
  return diagnosticar({
    recientes: recientes.map(aMes), previos: previos.map(aMes), variablePct: base.palancas.variablePct,
    fugas: {
      mermas: mermasRec.length ? suma(mermasRec) : null,
      porMotivo: [...porMotivo].map(([motivo, total]) => ({ motivo, total })),
      metaMermaPct: meta[0]?.pct ? Math.round(meta[0].pct * 1000) / 10 : META_MERMA_POR_DEFECTO,
      descuentos: descRec.length ? suma(descRec) : null,
      descuentosAntes: previos.length && descPrev.length ? suma(descPrev) : null,
    },
  });
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
      const base = baseDePalancas(cerrados, config.utilidadPct);
      return { businessId: bId, sede, base, diagnostico: base ? await leerDiagnostico(bId, cerrados, base) : null };
    }));
    return { ok: true, data: { sedes, ebitdaMetaPct: config.ebitdaPct } };
  } catch (e) {
    console.error("[getBasePalancas] failed:", e);
    return { ok: false, error: "No se pudo leer el punto de partida de las palancas." };
  }
}
