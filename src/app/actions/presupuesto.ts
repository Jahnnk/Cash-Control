"use server";

/**
 * Presupuesto · acciones (pedido de Jahnn, 6-oct-2026). El cálculo vive en lib/presupuesto.ts.
 *
 *   · Plan: presupuesto_mes (venta esperada + aprobación) y presupuesto_linea (S/ o % por categoría).
 *   · Real: las mismas filas de gasto que «las seis cifras» (lo que salió, con la parte PROPIA de
 *     los gastos compartidos, sin espejos ni lo que pagó el socio de su bolsillo).
 *   · Venta real: el cargador único (loadVentaRowsBlended).
 *   · Sugerencia: los 3 últimos meses cerrados antes del mes que se presupuesta.
 * Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import { CATEGORIAS_PRESUPUESTABLES, type Linea, type MesHistorial, type Modo } from "@/lib/presupuesto";

const sql = neon(process.env.DATABASE_URL!);
const SEDES = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }, { id: 1, nombre: "Atelier" }];
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

const finDeMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export type CabeceraPresupuesto = {
  ventaEsperada: number | null;
  aprobadoEl: string | null;
  aprobadoPor: string | null;
  actualizadoEl: string;
  actualizadoPor: string | null;
};

export type SedePresupuesto = {
  businessId: number;
  sede: string;
  cabecera: CabeceraPresupuesto | null;
  lineas: Linea[];
  /** Lo que salió en el mes por categoría (hasta hoy si el mes está en curso). */
  real: Record<string, number>;
  ventaReal: number | null;
  /** Último día con Excel cargado en el mes (null = nada todavía). */
  corte: string | null;
  /** Los 3 últimos meses cerrados antes de este: para sugerir. */
  historial: MesHistorial[];
  mesAnterior: { ventaEsperada: number | null; lineas: Linea[] };
};

export type DatosPresupuesto = { mes: string; hoy: string; enCurso: boolean; avanceMes: number; sedes: SedePresupuesto[] };

async function gastoPorCategoria(bId: number, desde: string, hasta: string): Promise<{ mes: string; categoria: string; monto: number }[]> {
  return (await sql`
    SELECT to_char(date, 'YYYY-MM') AS mes, category AS categoria,
           SUM(CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS monto
    FROM expenses
    WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} AND archived = false
      AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
      AND payment_method NOT IN ('pendiente_atelier', 'socio')
    GROUP BY 1, 2
  `) as { mes: string; categoria: string; monto: number }[];
}

async function ventasPorMes(bId: number, desde: string, hasta: string): Promise<Map<string, number>> {
  const v = await loadVentaRowsBlended(sql, bId, desde, hasta);
  const m = new Map<string, number>();
  for (const r of v.rows) m.set(r.date.slice(0, 7), (m.get(r.date.slice(0, 7)) ?? 0) + r.total);
  return m;
}

async function lineasDe(bId: number, mes: string): Promise<{ cab: CabeceraPresupuesto | null; lineas: Linea[] }> {
  const [cab, lin] = await Promise.all([
    sql`SELECT venta_esperada::float AS "ventaEsperada", aprobado_el::text AS "aprobadoEl", aprobado_por AS "aprobadoPor",
               actualizado_el::text AS "actualizadoEl", actualizado_por AS "actualizadoPor"
        FROM presupuesto_mes WHERE business_id = ${bId} AND mes = ${mes}` as unknown as Promise<CabeceraPresupuesto[]>,
    sql`SELECT categoria, modo, valor::float AS valor FROM presupuesto_linea WHERE business_id = ${bId} AND mes = ${mes}` as unknown as Promise<Linea[]>,
  ]);
  return { cab: cab[0] ?? null, lineas: lin };
}

async function datosSede(bId: number, sede: string, mes: string, hoy: string): Promise<SedePresupuesto> {
  const mesActual = hoy.slice(0, 7);
  const hasta = finDeMes(mes) < hoy ? finDeMes(mes) : hoy;
  // Historial: los 3 meses cerrados más recientes antes del mes elegido.
  const ultimoCerrado = mes <= mesActual ? mesMas(mes, -1) : mesMas(mesActual, -1);
  const desdeHist = `${mesMas(ultimoCerrado, -2)}-01`;
  const hastaHist = finDeMes(ultimoCerrado);

  const [plan, anterior, gastoMes, gastoHist, ventasMes, ventasHist, corte] = await Promise.all([
    lineasDe(bId, mes),
    lineasDe(bId, mesMas(mes, -1)),
    mes <= mesActual ? gastoPorCategoria(bId, `${mes}-01`, hasta) : Promise.resolve([]),
    gastoPorCategoria(bId, desdeHist, hastaHist),
    mes <= mesActual ? ventasPorMes(bId, `${mes}-01`, hasta) : Promise.resolve(new Map<string, number>()),
    ventasPorMes(bId, desdeHist, hastaHist),
    mes <= mesActual
      ? (sql`SELECT MAX(d)::text AS corte FROM (
            SELECT MAX(date) AS d FROM expenses WHERE business_id = ${bId} AND imported_from_excel = true AND archived = false AND date BETWEEN ${`${mes}-01`} AND ${hasta}
            UNION ALL
            SELECT MAX(date) FROM bank_income_items WHERE business_id = ${bId} AND imported_from_excel = true AND archived = false AND date BETWEEN ${`${mes}-01`} AND ${hasta}
          ) x` as unknown as Promise<{ corte: string | null }[]>)
      : Promise.resolve([{ corte: null }]),
  ]);

  const real: Record<string, number> = {};
  for (const g of gastoMes) real[g.categoria] = (real[g.categoria] ?? 0) + g.monto;
  const historial: MesHistorial[] = [mesMas(ultimoCerrado, -2), mesMas(ultimoCerrado, -1), ultimoCerrado].map((m) => {
    const r: Record<string, number> = {};
    for (const g of gastoHist.filter((x) => x.mes === m)) r[g.categoria] = g.monto;
    return { mes: m, ventas: ventasHist.get(m) ?? null, real: r };
  });
  return {
    businessId: bId, sede, cabecera: plan.cab, lineas: plan.lineas, real,
    ventaReal: ventasMes.get(mes) ?? null, corte: corte[0]?.corte ?? null, historial,
    mesAnterior: { ventaEsperada: anterior.cab?.ventaEsperada ?? null, lineas: anterior.lineas },
  };
}

/** El presupuesto de un mes, de una sede o de las tres. Solo dirección. */
export async function getPresupuesto(mes: string, businessId?: number | null): Promise<{ ok: true; data: DatosPresupuesto } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!MES_RE.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    const hoy = hoyLima();
    const enCurso = mes === hoy.slice(0, 7);
    const dia = Number(hoy.slice(8, 10)), dias = Number(finDeMes(mes).slice(8, 10));
    const avanceMes = enCurso ? Math.round((dia / dias) * 1000) / 10 : mes < hoy.slice(0, 7) ? 100 : 0;
    const elegidas = businessId ? SEDES.filter((s) => s.id === businessId) : SEDES;
    const sedes = await Promise.all(elegidas.map((s) => datosSede(s.id, s.nombre, mes, hoy)));
    return { ok: true, data: { mes, hoy, enCurso, avanceMes, sedes } };
  } catch (e) {
    console.error("[getPresupuesto] failed:", e);
    return { ok: false, error: "No se pudo cargar el presupuesto." };
  }
}

/** Guarda el presupuesto de una sede para un mes (reemplaza sus líneas). Solo dirección. */
export async function guardarPresupuesto(input: {
  businessId: number; mes: string; ventaEsperada: number | null; lineas: { categoria: string; modo: Modo; valor: number }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!SEDES.some((s) => s.id === input?.businessId)) return { ok: false, error: "Sede inválida." };
  if (!MES_RE.test(input?.mes ?? "")) return { ok: false, error: "Mes inválido." };
  const venta = input.ventaEsperada === null || input.ventaEsperada === undefined ? null : Number(input.ventaEsperada);
  if (venta !== null && (!Number.isFinite(venta) || venta < 0)) return { ok: false, error: "La venta esperada debe ser un monto de cero o más." };
  const lineas = (input.lineas ?? []).filter((l) => Number(l.valor) > 0);
  const vistas = new Set<string>();
  for (const l of lineas) {
    if (!CATEGORIAS_PRESUPUESTABLES.includes(l.categoria)) return { ok: false, error: `«${l.categoria}» no se presupuesta.` };
    if (vistas.has(l.categoria)) return { ok: false, error: `«${l.categoria}» está repetida.` };
    vistas.add(l.categoria);
    if (l.modo !== "soles" && l.modo !== "pct") return { ok: false, error: "Modo inválido." };
    if (!Number.isFinite(Number(l.valor))) return { ok: false, error: `El monto de ${l.categoria} no es un número.` };
    if (l.modo === "pct" && Number(l.valor) > 100) return { ok: false, error: `${l.categoria}: el porcentaje no puede pasar de 100.` };
  }
  if (lineas.some((l) => l.modo === "pct") && !(venta && venta > 0)) {
    return { ok: false, error: "Hay categorías en % de la venta: escribe la venta esperada del mes." };
  }
  const r2 = (n: number) => Math.round(Number(n) * 100) / 100;
  try {
    await sql.transaction([
      sql`INSERT INTO presupuesto_mes (business_id, mes, venta_esperada, actualizado_por)
          VALUES (${input.businessId}, ${input.mes}, ${venta === null ? null : r2(venta)}, ${role.quien})
          ON CONFLICT (business_id, mes) DO UPDATE SET venta_esperada = EXCLUDED.venta_esperada,
            actualizado_por = EXCLUDED.actualizado_por, actualizado_el = NOW()`,
      sql`DELETE FROM presupuesto_linea WHERE business_id = ${input.businessId} AND mes = ${input.mes}`,
      ...lineas.map((l) => sql`
        INSERT INTO presupuesto_linea (business_id, mes, categoria, modo, valor, actualizado_por)
        VALUES (${input.businessId}, ${input.mes}, ${l.categoria}, ${l.modo}, ${r2(l.valor)}, ${role.quien})`),
    ]);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[guardarPresupuesto] failed:", e);
    return { ok: false, error: "No se pudo guardar el presupuesto." };
  }
}

/** Aprueba (o reabre) el presupuesto de una sede para un mes. Solo dirección. */
export async function aprobarPresupuesto(input: { businessId: number; mes: string; aprobar: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!SEDES.some((s) => s.id === input?.businessId)) return { ok: false, error: "Sede inválida." };
  if (!MES_RE.test(input?.mes ?? "")) return { ok: false, error: "Mes inválido." };
  try {
    const n = (await sql`SELECT COUNT(*)::int AS n FROM presupuesto_linea WHERE business_id = ${input.businessId} AND mes = ${input.mes}`) as { n: number }[];
    if (input.aprobar && !n[0]?.n) return { ok: false, error: "Primero guarda el presupuesto: no hay nada que aprobar." };
    await sql`
      UPDATE presupuesto_mes SET aprobado_el = ${input.aprobar ? new Date().toISOString() : null}, aprobado_por = ${input.aprobar ? role.quien : null}
      WHERE business_id = ${input.businessId} AND mes = ${input.mes}`;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[aprobarPresupuesto] failed:", e);
    return { ok: false, error: "No se pudo aprobar el presupuesto." };
  }
}
