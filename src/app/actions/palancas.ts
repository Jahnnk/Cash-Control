"use server";

/**
 * Palancas del EBITDA · el punto de partida REAL de cada sede (solo dirección, solo lectura).
 * Promedia los últimos meses cerrados con las mismas seis cifras del Dashboard (lib/seis-cifras-sql.ts): no hay un
 * cálculo nuevo. El simulador vive en lib/palancas.ts y no guarda nada.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole, requireLectura } from "@/lib/session-access";
import { admiteCandado, candadosDe } from "@/lib/candados";
import { cifrasDeSedeEnMes, hoyLima } from "@/lib/seis-cifras-sql";
import { cifrasDelGrupo, CATEGORIA_COMPRA_ATELIER, type CifrasSede } from "@/lib/seis-cifras";
import { leerConfigProfitFirst } from "@/lib/profit-first-config-sql";
import { baseDePalancas, GRUPO, NOMBRE_GRUPO, type BasePalancas, type MesBase } from "@/lib/palancas";
import { gastoPorCategoria } from "@/lib/presupuesto-datos";
import { diagnosticar, type Diagnostico, type MesGasto } from "@/lib/fugas";

const sql = neon(process.env.DATABASE_URL!);
const SEDES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];
/** Cuántos meses hacia atrás se miran: tres cerrados para partir y hasta tres más para comparar (Fase 3). */
const MESES_ATRAS = 7;
const META_MERMA_POR_DEFECTO = 4;

export type PalancasSede = {
  businessId: number; sede: string; base: BasePalancas | null; /** Fase 3: gastos fijos, fugas y focos. */ diagnostico: Diagnostico | null;
  /** Lo gastado en promedio por categoría en los mismos meses cerrados de la base (16-nov-2026). */
  promedio: Record<string, number>;
  /** Categorías con candado: no se recortan (lib/candados.ts). */
  candados: string[];
};
export type DatosPalancas = {
  sedes: PalancasSede[]; /** EBITDA objetivo del CEO (% de la venta). */ ebitdaMetaPct: number;
  /** false = falta la tabla presupuesto_candados: valen los de por defecto y no se pueden cambiar. */
  candadosGuardables: boolean;
};

/** Los candados guardados de todas las sedes. Sin la tabla, ninguno (valen los de por defecto). */
async function leerCandados(): Promise<{ filas: { business_id: number; categoria: string; bloqueado: boolean }[]; guardable: boolean }> {
  try {
    const filas = await sql`SELECT business_id, categoria, bloqueado FROM presupuesto_candados` as unknown as { business_id: number; categoria: string; bloqueado: boolean }[];
    return { filas, guardable: true };
  } catch {
    return { filas: [], guardable: false };
  }
}

/** Pone o quita el candado de una categoría en una sede (solo dirección con llave completa). */
export async function setCandado(businessId: number, categoria: string, bloqueado: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!SEDES.some(([id]) => id === businessId)) return { ok: false, error: "Sede inválida." };
  if (typeof categoria !== "string" || !admiteCandado(categoria)) return { ok: false, error: "Esa categoría no lleva candado." };
  try {
    await sql`INSERT INTO presupuesto_candados (business_id, categoria, bloqueado, cambiado_por)
              VALUES (${businessId}, ${categoria}, ${!!bloqueado}, ${role.quien === "kelly" ? "Kelly" : "Jahnn"})
              ON CONFLICT (business_id, categoria) DO UPDATE SET bloqueado = EXCLUDED.bloqueado, cambiado_por = EXCLUDED.cambiado_por, cambiado_en = now()`;
    return { ok: true };
  } catch (e) {
    console.error("[setCandado] failed:", e);
    return { ok: false, error: "No se pudo guardar el candado." };
  }
}

function mesesAnteriores(hoy: string, n: number): string[] {
  const out: string[] = [];
  let a = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  for (let i = 0; i < n; i++) { m -= 1; if (m === 0) { m = 12; a -= 1; } out.push(`${a}-${String(m).padStart(2, "0")}`); }
  return out;
}

const finDe = (mes: string) => { const [a, m] = mes.split("-").map(Number); return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`; };

/**
 * Fase 3 · gastos por categoría, mermas y descuentos de los mismos meses cerrados (solo lectura). `ids`: una sede o las
 * tres (Grupo). En el Grupo no cuenta `sinCategoria` (lo que las cafeterías le compran a Atelier: es venta interna).
 */
async function leerDiagnostico(ids: number[], cerrados: MesBase[], base: BasePalancas, sinCategoria: string | null = null): Promise<{ diagnostico: Diagnostico | null; promedio: Record<string, number> }> {
  const orden = [...cerrados].sort((a, b) => a.mes.localeCompare(b.mes));
  const recientes = orden.filter((m) => base.meses.includes(m.mes));
  const previos = orden.filter((m) => !base.meses.includes(m.mes)).slice(-3);
  const todos = [...previos, ...recientes];
  const desde = `${todos[0].mes}-01`, hasta = finDe(todos[todos.length - 1].mes);
  const [gastosPorSede, mermas, motivos, descuentos, meta] = await Promise.all([
    Promise.all(ids.map((id) => gastoPorCategoria(id, desde, hasta))),
    sql`SELECT to_char(date, 'YYYY-MM') AS mes, SUM(mermas_soles)::float AS total FROM upselling_daily
        WHERE business_id = ANY(${ids}::int[]) AND date BETWEEN ${desde} AND ${hasta} AND mermas_soles IS NOT NULL GROUP BY 1` as unknown as Promise<{ mes: string; total: number }[]>,
    sql`SELECT to_char(date, 'YYYY-MM') AS mes, COALESCE(motivo, 'Sin motivo') AS motivo, SUM(total)::float AS total FROM merma_items
        WHERE business_id = ANY(${ids}::int[]) AND date BETWEEN ${desde} AND ${hasta} GROUP BY 1, 2` as unknown as Promise<{ mes: string; motivo: string; total: number }[]>,
    sql`SELECT to_char(date, 'YYYY-MM') AS mes, SUM(COALESCE(descuentos, 0))::float AS total FROM byte_ventas_efectiva
        WHERE business_id = ANY(${ids}::int[]) AND date BETWEEN ${desde} AND ${hasta} GROUP BY 1` as unknown as Promise<{ mes: string; total: number }[]>,
    sql`SELECT MAX(mermas_max_pct)::float AS pct FROM kpi_targets WHERE business_id = ANY(${ids}::int[])` as unknown as Promise<{ pct: number | null }[]>,
  ]);
  const gastos = gastosPorSede.flat().filter((g) => g.categoria !== sinCategoria);
  const aMes = (m: MesBase): MesGasto => {
    const porCategoria: Record<string, number> = {};
    for (const g of gastos) if (g.mes === m.mes) porCategoria[g.categoria] = Math.round(((porCategoria[g.categoria] ?? 0) + g.monto) * 100) / 100;
    return { mes: m.mes, ventas: m.ventas, porCategoria };
  };
  const enRecientes = (mes: string) => base.meses.includes(mes);
  const enPrevios = (mes: string) => previos.some((m) => m.mes === mes);
  const suma = (l: { total: number }[]) => l.reduce((t, x) => t + (x.total ?? 0), 0);
  const mermasRec = mermas.filter((m) => enRecientes(m.mes));
  const descRec = descuentos.filter((d) => enRecientes(d.mes)), descPrev = descuentos.filter((d) => enPrevios(d.mes));
  const porMotivo = new Map<string, number>();
  for (const m of motivos) if (enRecientes(m.mes)) porMotivo.set(m.motivo, (porMotivo.get(m.motivo) ?? 0) + m.total);
  const promedio: Record<string, number> = {};
  const rec = recientes.map(aMes);
  for (const m of rec) for (const [c, v] of Object.entries(m.porCategoria)) promedio[c] = (promedio[c] ?? 0) + v / rec.length;
  for (const c of Object.keys(promedio)) promedio[c] = Math.round(promedio[c] * 100) / 100;
  const diagnostico = diagnosticar({
    recientes: recientes.map(aMes), previos: previos.map(aMes), variablePct: base.palancas.variablePct,
    fugas: {
      mermas: mermasRec.length ? suma(mermasRec) : null,
      porMotivo: [...porMotivo].map(([motivo, total]) => ({ motivo, total })),
      metaMermaPct: meta[0]?.pct ? Math.round(meta[0].pct * 1000) / 10 : META_MERMA_POR_DEFECTO,
      descuentos: descRec.length ? suma(descRec) : null,
      descuentosAntes: previos.length && descPrev.length ? suma(descPrev) : null,
    },
  });
  return { diagnostico, promedio };
}

const cerrado = (c: CifrasSede) => c.mesCompleto && c.conResultado && (c.ventas ?? 0) > 0;

export async function getBasePalancas(): Promise<{ ok: true; data: DatosPalancas } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  try {
    const hoy = hoyLima();
    const meses = mesesAnteriores(hoy, MESES_ATRAS);
    const [{ config }, guardados] = await Promise.all([leerConfigProfitFirst(sql), leerCandados()]);
    const candadosDeSede = (bId: number) => candadosDe(guardados.filas.filter((f) => f.business_id === bId));
    const cifrasPorSede = await Promise.all(SEDES.map(([bId, sede]) => Promise.all(meses.map((mes) => cifrasDeSedeEnMes(sql as never, bId, sede, mes, hoy)))));
    const sedes = await Promise.all(SEDES.map(async ([bId, sede], i): Promise<PalancasSede> => {
      const cerrados: MesBase[] = cifrasPorSede[i].filter(cerrado)
        .map((c) => ({ mes: c.mes, ventas: c.ventas ?? 0, costos: c.costos, gastos: c.gastos, planilla: c.planilla, bolsa: c.fuera.deudas + c.fuera.inversion + c.impuestos }));
      const base = baseDePalancas(cerrados, config.utilidadPct);
      const d = base ? await leerDiagnostico([bId], cerrados, base) : null;
      return { businessId: bId, sede, base, diagnostico: d?.diagnostico ?? null, promedio: d?.promedio ?? {}, candados: candadosDeSede(bId) };
    }));
    // El Grupo: solo los meses que las TRES sedes tienen cerrados, con el mismo consolidado del Dashboard
    // (lib/seis-cifras.ts → cifrasDelGrupo: lo que Atelier le vende a las cafeterías se cuenta una sola vez).
    const cerradosGrupo: MesBase[] = meses.flatMap((mes, k) => {
      const delMes = cifrasPorSede.map((l) => l[k]);
      if (!delMes.every(cerrado)) return [];
      const g = cifrasDelGrupo(delMes);
      return g.ventas === null ? [] : [{ mes, ventas: g.ventas, costos: g.costos, gastos: g.gastos, planilla: g.planilla, bolsa: g.fuera.deudas + g.fuera.inversion + g.impuestos }];
    });
    const baseGrupo = baseDePalancas(cerradosGrupo, config.utilidadPct);
    const dg = baseGrupo ? await leerDiagnostico(SEDES.map(([id]) => id), cerradosGrupo, baseGrupo, CATEGORIA_COMPRA_ATELIER) : null;
    // El Grupo es solo referencia: no lleva candados propios (se ponen sede por sede).
    const grupo: PalancasSede = { businessId: GRUPO, sede: NOMBRE_GRUPO, base: baseGrupo, diagnostico: dg?.diagnostico ?? null, promedio: dg?.promedio ?? {}, candados: [] };
    return { ok: true, data: { sedes: [...sedes, grupo], ebitdaMetaPct: config.ebitdaPct, candadosGuardables: guardados.guardable } };
  } catch (e) {
    console.error("[getBasePalancas] failed:", e);
    return { ok: false, error: "No se pudo leer el punto de partida de las palancas." };
  }
}
