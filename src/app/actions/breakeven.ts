"use server";

/**
 * Punto de equilibrio · Actions (por sede y consolidado del grupo).
 *
 * Fuentes (todas ya existentes — no se inventa nada):
 * - Ventas del mes: Byte por día (byte_sales_daily → daily_records →
 *   registro diario del admin en upselling_daily, en ese orden).
 * - Fijos/variables: la clasificación de categorías de egreso que Jahnn
 *   mantiene en Configuración (cost_group), con los MISMOS filtros
 *   operativos del EBITDA (buildFixedVariable).
 * El motor puro vive en lib/breakeven.ts.
 */

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { requireFullSession, getSessionRole } from "@/lib/session-access";
import {
  redondearMeta, tocaCongelar, type EntradaCandadoVentas,
} from "@/lib/incentives/candado-ventas";
import { buildFixedVariable } from "@/lib/fixed-variable";
import { ventasInternasDelGrupo, type SedeEnConsolidado } from "@/lib/ventas-internas-grupo";
import { gastosDevueltos, MARCA_PAGO_ERRADO, DIAS_MAX, type IngresoCandidato } from "@/lib/pagos-devueltos";
import { elegirFuenteVentas, type FuenteVenta, type VentasMes } from "@/lib/ventas-mes-sql";
import { formatCurrency } from "@/lib/utils";
import { computeBreakeven, type BreakevenResult, type BreakevenReference } from "@/lib/breakeven";

const sql = neon(process.env.DATABASE_URL!);

const SEDE_NAMES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

function todayLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

function monthMeta(month: string) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${month}-01`;
  const end = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const today = todayLima();
  const isCurrent = month === today.slice(0, 7);
  const daysElapsed = isCurrent ? Number(today.slice(8, 10)) : daysInMonth;
  return { start, end, daysInMonth, daysElapsed, isCurrent };
}

/**
 * Ventas Byte del mes de una sede.
 *
 * Trae las TRES fuentes con sus días de venta y deja que
 * `elegirFuenteVentas` decida: una fuente rota (31 filas en cero) ya no
 * puede ganarle a una completa. La regla y su porqué viven en
 * lib/ventas-mes-sql.ts — no reimplementarla acá.
 */
async function monthSales(bId: number, start: string, end: string): Promise<number> {
  return (await ventasDelMesConFuente(bId, start, end)).total;
}

async function ventasDelMesConFuente(bId: number, start: string, end: string): Promise<VentasMes> {
  const rows = (await sql`
    SELECT 'byte' AS fuente,
           COALESCE(SUM(total), 0)::float AS total,
           COUNT(*) FILTER (WHERE total > 0)::int AS dias,
           MAX(date) FILTER (WHERE total > 0)::text AS ultimo_dia
    FROM byte_sales_daily
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
    UNION ALL
    SELECT 'cierre',
           COALESCE(SUM(byte_total), 0)::float,
           COUNT(*) FILTER (WHERE byte_total > 0)::int,
           MAX(date) FILTER (WHERE byte_total > 0)::text
    FROM daily_records
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end} AND archived = false
    UNION ALL
    SELECT 'registro',
           COALESCE(SUM(revenue), 0)::float,
           COUNT(*) FILTER (WHERE revenue > 0)::int,
           MAX(date) FILTER (WHERE revenue > 0)::text
    FROM upselling_daily
    WHERE business_id = ${bId} AND date BETWEEN ${start} AND ${end}
  `) as { fuente: FuenteVenta["fuente"]; total: number; dias: number; ultimo_dia: string | null }[];

  // El orden del UNION ALL no está garantizado: se reordena por la
  // preferencia, que es lo que la regla necesita para decidir.
  const orden: FuenteVenta["fuente"][] = ["byte", "cierre", "registro"];
  const fuentes: FuenteVenta[] = orden.map((f) => {
    const r = rows.find((x) => x.fuente === f);
    return r
      ? { fuente: f, total: r.total, dias: r.dias, ultimoDia: r.ultimo_dia }
      : { fuente: f, total: 0, dias: 0, ultimoDia: null };
  });
  return elegirFuenteVentas(fuentes);
}

/**
 * Fijos/variables/sin-clasificar operativos del mes de una sede, y hasta
 * qué día llegan los gastos registrados.
 *
 * Los pagos hechos por error y devueltos no cuentan: ver
 * lib/pagos-devueltos.ts (Fonavi, agosto 2026: S/3,777).
 */
async function monthCosts(bId: number, start: string, end: string) {
  const [rows, cats] = await Promise.all([
    sql`
      SELECT id::text AS id, date::text AS date, category, concept, amount::float AS bruto,
             (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount
      FROM expenses
      WHERE business_id = ${bId} AND date >= ${start} AND date <= ${end}
        AND is_special_loan = false AND is_internal_transfer = false AND archived = false
        AND payment_method <> 'pendiente_atelier'
    `,
    sql`
      SELECT name, exclude_from_ebitda, cost_group
      FROM expense_categories WHERE business_id = ${bId}
    `,
  ]);
  const gastos = rows as { id: string; date: string; category: string; concept: string | null; bruto: number; amount: number }[];

  // La devolución puede llegar hasta DIAS_MAX días después, ya en el mes
  // siguiente. Solo se consulta el banco si hay algún gasto marcado.
  let devueltos = new Set<string>();
  if (gastos.some((g) => MARCA_PAGO_ERRADO.test(g.concept ?? ""))) {
    const ingresos = (await sql`
      SELECT id::text AS id, date::text AS date, amount::float AS amount, note
      FROM bank_income_items
      WHERE business_id = ${bId} AND archived = false
        AND date >= ${start} AND date <= (${end}::date + ${DIAS_MAX}::int)
    `) as IngresoCandidato[];
    devueltos = gastosDevueltos(gastos.map((g) => ({ id: g.id, date: g.date, amount: g.bruto, concept: g.concept })), ingresos);
  }

  const categorias = cats as { name: string; exclude_from_ebitda: boolean; cost_group: string | null }[];
  const cuentan = gastos.filter((r) => !devueltos.has(r.id));
  // Lo comprado a Atelier, tal como entra en `variables`: el consolidado
  // del grupo lo descuenta (ver lib/ventas-internas-grupo.ts).
  const catAtelier = categorias.find((c) => c.name === CATEGORIA_COMPRA_ATELIER);
  const compraAtelier = catAtelier && catAtelier.cost_group === "variable" && !catAtelier.exclude_from_ebitda
    ? cuentan.filter((r) => r.category === CATEGORIA_COMPRA_ATELIER).reduce((t, r) => t + Number(r.amount), 0)
    : 0;
  const report = buildFixedVariable(
    cuentan.map((r) => ({ category: r.category, amount: Number(r.amount) })),
    categorias.map((c) => ({
      name: c.name,
      excludeFromEbitda: c.exclude_from_ebitda,
      costGroup: c.cost_group,
    })),
  );
  return {
    fijos: report.fijo.total,
    variables: report.variable.total,
    sinClasificar: report.sinClasificar.total,
    compraAtelier,
    ultimoGasto: gastos.reduce<string | null>((max, g) => (max === null || g.date > max ? g.date : max), null),
  };
}

/** Lo que las cafeterías le compran a Atelier (catálogo único de categorías). */
const CATEGORIA_COMPRA_ATELIER = "PRODUCTOS ATELIER";

function prevMonths(month: string, n: number): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out; // del más reciente al más antiguo
}

/**
 * Qué fracción del mes tiene que estar cargada para que sirva de
 * referencia. Con menos, sus costos (del mes entero) se comparan contra
 * ventas parciales y el ratio de variables se dispara.
 *
 * 70% deja fuera a Centro en mayo (11 días de 31 = 35%) y a Fonavi en
 * abril (10 de 30 = 33%), y mantiene todos los meses sanos, que van de
 * 26/30 (87%) para arriba.
 */
const COBERTURA_MINIMA_REFERENCIA = 0.7;

/**
 * Cuántos meses completos se promedian, y cuántos se miran hacia atrás
 * para encontrarlos.
 *
 * Eran 3. Con 3, un solo mes con pagos corridos movía la meta miles de
 * soles: el Excel registra la compra el día que se paga, y en agosto 2026
 * se pagaron facturas de Atelier de julio. El % de variables de Fonavi
 * fue 47, 51, 44 y 62% en cuatro meses vendiendo casi lo mismo, mientras
 * el costo por receta se mantuvo entre 38 y 41%: el salto era de fechas,
 * no del negocio. Con 6 meses esos corrimientos se compensan (una factura
 * pagada tarde sale de un mes y cae en otro de la misma ventana). Revisado
 * con Jahnn el 14-sep-2026.
 */
const MESES_REFERENCIA = 6;
const MESES_A_BUSCAR = 9;

/**
 * Un mes sirve de referencia solo si sus gastos llegan hasta fin de mes.
 * La planilla se paga el 30 o 31: un mes cuyo Excel todavía no trae los
 * últimos días tiene fijos a medias y bajaría la meta sin razón.
 */
const DIAS_SIN_GASTO_TOLERADOS = 2;

/** Agregado interno de la referencia (permite consolidar el grupo). */
type RefAgg = BreakevenReference & {
  sumVariables: number;
  sumVentas: number;
  /** De TODOS los meses revisados, no solo los usados: ver ventas-internas-grupo.ts. */
  compraAtelierPorMes: Record<string, number>;
};

/**
 * Referencia histórica para el MES EN CURSO: hasta `MESES_REFERENCIA`
 * meses cerrados y completos (ventas ≥70% de los días, gastos hasta fin
 * de mes, fijos clasificados). Fijos = promedio mensual; ratio variable =
 * Σvariables/Σventas de esos meses.
 * Sin la referencia, comparar contra los fijos registrados a la fecha
 * daría un equilibrio falso de bajo (lección del piloto de Jahnn).
 */
async function buildReference(bId: number, month: string): Promise<RefAgg | null> {
  const candidates = prevMonths(month, MESES_A_BUSCAR);
  const rows = await Promise.all(
    candidates.map(async (m) => {
      const { start, end, daysInMonth } = monthMeta(m);
      const [v, costs] = await Promise.all([
        ventasDelMesConFuente(bId, start, end),
        monthCosts(bId, start, end),
      ]);
      const diasSinGasto = costs.ultimoGasto
        ? daysInMonth - Number(costs.ultimoGasto.slice(8, 10))
        : daysInMonth;
      return { month: m, ventas: v.total, diasVenta: v.dias, daysInMonth, diasSinGasto, ...costs };
    }),
  );

  // Un mes con las VENTAS a medias no sirve de referencia: sus costos
  // son del mes entero y sus ventas no, así que el ratio de variables
  // sale disparado. Le pasó a Centro: mayo tenía 11 días de venta
  // cargados de 31, con los costos completos → 197% de variables sobre
  // ventas. Promediado con junio y julio daba un margen de contribución
  // NEGATIVO y el sistema concluía "cada sol vendido pierde plata",
  // cuando el problema era el mes incompleto, no el negocio.
  const usable = rows
    .filter((r) => r.fijos > 0 && r.ventas > 0)
    .filter((r) => r.diasVenta >= r.daysInMonth * COBERTURA_MINIMA_REFERENCIA)
    .filter((r) => r.diasSinGasto <= DIAS_SIN_GASTO_TOLERADOS)
    .slice(0, MESES_REFERENCIA);
  if (usable.length === 0) return null;
  const sumVariables = usable.reduce((s, r) => s + r.variables, 0);
  const sumVentas = usable.reduce((s, r) => s + r.ventas, 0);
  return {
    fijos: usable.reduce((s, r) => s + r.fijos, 0) / usable.length,
    varRatio: sumVentas > 0 ? sumVariables / sumVentas : 0,
    monthsUsed: usable.map((r) => r.month).sort(),
    sumVariables,
    sumVentas,
    compraAtelierPorMes: Object.fromEntries(rows.map((r) => [r.month, r.compraAtelier])),
  };
}

async function breakevenOf(bId: number, month: string): Promise<BreakevenResult> {
  const { start, end, daysInMonth, daysElapsed, isCurrent } = monthMeta(month);
  const [ventas, costs, reference] = await Promise.all([
    monthSales(bId, start, end),
    monthCosts(bId, start, end),
    isCurrent ? buildReference(bId, month) : Promise.resolve(null),
  ]);
  if (isCurrent && !reference) {
    // Sin meses cerrados con datos no hay contra qué compararse — se
    // dice claro, nunca un "superado" falso con fijos a medio registrar.
    const r = computeBreakeven({ ...costs, fijos: 0, ventas, daysElapsed, daysInMonth });
    r.warnings = [
      ...r.warnings.filter((w) => !w.includes("No hay costos fijos clasificados")),
      "Mes en curso sin referencia histórica: se necesita al menos un mes cerrado con ventas y costos fijos clasificados para calcular el equilibrio.",
    ];
    return r;
  }
  return computeBreakeven({ ...costs, ventas, daysElapsed, daysInMonth, reference });
}

/** Punto de equilibrio del mes para la sede activa (dashboard de sede). */
export async function getBreakevenMonth(month: string): Promise<
  | { ok: true; data: BreakevenResult; isCurrent: boolean }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const bId = await activeBusinessId();
    const data = await breakevenOf(bId, month);
    return { ok: true, data, isCurrent: monthMeta(month).isCurrent };
  } catch (err) {
    console.error("[getBreakevenMonth] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al calcular el punto de equilibrio" };
  }
}

export type GroupBreakeven = {
  month: string;
  isCurrent: boolean;
  sedes: {
    businessId: number;
    name: string;
    result: BreakevenResult;
    /**
     * Hasta qué día llegan las ventas cargadas de esa sede. Sin esto, una
     * sede con días sin cargar se ve "en riesgo" por eso y no por vender
     * poco — y en la reunión se le reclama al administrador equivocado.
     */
    ventasHasta: string | null;
  }[];
  /**
   * Consolidado: Σ fijos / (1 − Σ variables / Σ ventas), sin las ventas
   * de Atelier a las cafeterías (ni su compra) — ver ventas-internas-grupo.ts.
   */
  grupo: BreakevenResult;
};

/** Punto de equilibrio por sede + consolidado (dashboard del grupo). */
export async function getGroupBreakeven(month: string): Promise<
  | { ok: true; data: GroupBreakeven }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const { start, end, daysInMonth, daysElapsed, isCurrent } = monthMeta(month);
    const ids = [1, 2, 3];
    const perSede = await Promise.all(
      ids.map(async (bId) => {
        const [v, costs, reference] = await Promise.all([
          ventasDelMesConFuente(bId, start, end),
          monthCosts(bId, start, end),
          isCurrent ? buildReference(bId, month) : Promise.resolve(null),
        ]);
        return { bId, ventas: v.total, ventasHasta: v.ultimoDia, reference, ...costs };
      }),
    );
    const sedes = perSede.map((s) => {
      if (isCurrent && !s.reference) {
        const r = computeBreakeven({
          fijos: 0, variables: s.variables, sinClasificar: s.sinClasificar,
          ventas: s.ventas, daysElapsed, daysInMonth,
        });
        r.warnings = [
          ...r.warnings.filter((w) => !w.includes("No hay costos fijos clasificados")),
          "Mes en curso sin referencia histórica: se necesita al menos un mes cerrado con ventas y costos fijos clasificados.",
        ];
        return {
          businessId: s.bId, name: SEDE_NAMES[s.bId] ?? `Negocio ${s.bId}`,
          result: r, ventasHasta: s.ventasHasta,
        };
      }
      return {
        businessId: s.bId,
        name: SEDE_NAMES[s.bId] ?? `Negocio ${s.bId}`,
        ventasHasta: s.ventasHasta,
        result: computeBreakeven({
          fijos: s.fijos,
          variables: s.variables,
          sinClasificar: s.sinClasificar,
          ventas: s.ventas,
          daysElapsed,
          daysInMonth,
          reference: s.reference,
        }),
      };
    });

    // Lo que Atelier le vende a las cafeterías se cuenta una sola vez
    // en el consolidado: ver lib/ventas-internas-grupo.ts.
    const internoDelMes = (incluidas: typeof perSede) =>
      ventasInternasDelGrupo(incluidas.map((s): SedeEnConsolidado => ({
        businessId: s.bId, meses: [month], compraAtelierPorMes: { [month]: s.compraAtelier },
      })));
    const avisoInterno = (monto: number) =>
      `Descuenta ${formatCurrency(monto)} que Atelier le vendió a Fonavi y Centro: es plata que se mueve dentro del grupo, no venta a clientes. Por eso las ventas del grupo son menores que la suma de las tres sedes.`;

    let grupo: BreakevenResult;
    if (isCurrent) {
      // Consolidado del mes en curso: SOLO las sedes con referencia
      // histórica (fijos y ventas de las demás quedan fuera — se avisa).
      const withRef = perSede.filter((s) => s.reference);
      const internoRef = ventasInternasDelGrupo(withRef.map((s): SedeEnConsolidado => ({
        businessId: s.bId, meses: s.reference!.monthsUsed, compraAtelierPorMes: s.reference!.compraAtelierPorMes,
      })));
      const internoMes = internoDelMes(withRef);
      const sumVar = withRef.reduce((t, s) => t + s.reference!.sumVariables, 0) - internoRef.variables;
      const sumVen = withRef.reduce((t, s) => t + s.reference!.sumVentas, 0) - internoRef.ventas;
      const groupRef: BreakevenReference | null =
        withRef.length > 0
          ? {
              fijos: withRef.reduce((t, s) => t + s.reference!.fijos, 0),
              varRatio: sumVen > 0 ? sumVar / sumVen : 0,
              monthsUsed: [...new Set(withRef.flatMap((s) => s.reference!.monthsUsed))].sort(),
            }
          : null;
      grupo = computeBreakeven({
        fijos: 0,
        variables: withRef.reduce((t, s) => t + s.variables, 0) - internoMes.variables,
        sinClasificar: perSede.reduce((t, s) => t + s.sinClasificar, 0),
        ventas: withRef.reduce((t, s) => t + s.ventas, 0) - internoMes.ventas,
        daysElapsed,
        daysInMonth,
        reference: groupRef,
      });
      const sinRef = perSede.filter((s) => !s.reference).map((s) => SEDE_NAMES[s.bId]);
      if (sinRef.length > 0 && groupRef) {
        grupo.warnings.push(
          `El consolidado solo incluye sedes con referencia histórica — falta: ${sinRef.join(", ")} (clasificar sus categorías fijo/variable y cerrar un mes con ventas).`,
        );
      }
      if (internoRef.ventas > 0) grupo.warnings.push(avisoInterno(internoMes.ventas));
    } else {
      const interno = internoDelMes(perSede);
      grupo = computeBreakeven({
        fijos: perSede.reduce((t, s) => t + s.fijos, 0),
        variables: perSede.reduce((t, s) => t + s.variables, 0) - interno.variables,
        sinClasificar: perSede.reduce((t, s) => t + s.sinClasificar, 0),
        ventas: perSede.reduce((t, s) => t + s.ventas, 0) - interno.ventas,
        daysElapsed,
        daysInMonth,
      });
      if (interno.ventas > 0) grupo.warnings.push(avisoInterno(interno.ventas));
    }
    return { ok: true, data: { month, isCurrent, sedes, grupo } };
  } catch (err) {
    console.error("[getGroupBreakeven] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al calcular el punto de equilibrio del grupo" };
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Candado de ventas del bono (desde octubre 2026)
   ───────────────────────────────────────────────────────────────────── */

/**
 * La meta de ventas del bono y las ventas del mes a la fecha.
 *
 * La meta es el punto de equilibrio de REFERENCIA —el mismo que muestra
 * la tarjeta de punto de equilibrio: hasta 6 meses cerrados con datos
 * completos— y vive acá para que el bono y el dashboard no puedan dar dos
 * números distintos. Se congela el primer lunes del mes (ya llegó el Excel
 * de Kelly del mes anterior) en `incentive_sales_targets` y no se mueve
 * después, aunque se re-suban Excels viejos: el equipo conoce su meta
 * desde el inicio.
 *
 * Antes del primer lunes se devuelve PROVISIONAL (no se guarda).
 *
 * Solo dirección o el administrador de esa sede. Devuelve null sin
 * permiso: el motor, sin meta, bloquea el cierre en vez de pagar a ciegas.
 */
export async function getEntradaCandadoVentas(
  bId: number,
  month: string,
): Promise<EntradaCandadoVentas | null> {
  const role = await getSessionRole();
  const permitido = role?.kind === "full" || (role?.kind === "admin" && role.sede === bId);
  if (!permitido) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;

  const { start, end } = monthMeta(month);
  const hoy = todayLima();
  const [ventas, politica] = await Promise.all([
    ventasDelMesConFuente(bId, start, hoy < end ? hoy : end),
    sql`
      SELECT requiere_equilibrio FROM incentive_config
      WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `,
  ]);
  const vinculante = (politica as { requiere_equilibrio: boolean }[])[0]?.requiere_equilibrio === true;
  const base = { ventas: ventas.total, diasConVenta: ventas.dias, vinculante };

  // Un mes en que la meta NO es requisito se muestra con el cálculo del
  // día y nunca se congela: congelar solo tiene sentido cuando hay un
  // bono que depende de ella.
  if (!vinculante) {
    const ref = await buildReference(bId, month);
    const exacta = ref && ref.fijos > 0 && ref.varRatio < 1 ? ref.fijos / (1 - ref.varRatio) : null;
    return {
      ...base, meta: exacta === null ? null : redondearMeta(exacta),
      provisional: false, mesesReferencia: ref?.monthsUsed ?? [],
    };
  }

  const congelada = (await sql`
    SELECT meta::float AS meta, meses_referencia
    FROM incentive_sales_targets WHERE business_id = ${bId} AND month = ${month}
  `) as { meta: number; meses_referencia: string[] }[];
  if (congelada.length > 0) {
    return { ...base, meta: congelada[0].meta, provisional: false, mesesReferencia: congelada[0].meses_referencia };
  }

  const ref = await buildReference(bId, month);
  const exacta = ref && ref.fijos > 0 && ref.varRatio < 1 ? ref.fijos / (1 - ref.varRatio) : null;
  if (exacta === null) {
    return { ...base, meta: null, provisional: true, mesesReferencia: ref?.monthsUsed ?? [] };
  }
  const meta = redondearMeta(exacta);

  if (tocaCongelar(month, hoy)) {
    await sql`
      INSERT INTO incentive_sales_targets (business_id, month, meta, meta_exacta, meses_referencia)
      VALUES (${bId}, ${month}, ${meta}, ${Math.round(exacta * 100) / 100}, ${ref!.monthsUsed})
      ON CONFLICT (business_id, month) DO NOTHING
    `;
    // Si otro request congeló primero, manda la que quedó guardada.
    const fila = (await sql`
      SELECT meta::float AS meta, meses_referencia FROM incentive_sales_targets
      WHERE business_id = ${bId} AND month = ${month}
    `) as { meta: number; meses_referencia: string[] }[];
    if (fila.length > 0) {
      return { ...base, meta: fila[0].meta, provisional: false, mesesReferencia: fila[0].meses_referencia };
    }
  }
  return { ...base, meta, provisional: true, mesesReferencia: ref!.monthsUsed };
}
