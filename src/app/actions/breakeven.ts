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
  tocaCongelar, metaPorPromedioDeVentas, MESES_A_BUSCAR_META, type EntradaCandadoVentas,
} from "@/lib/incentives/candado-ventas";
import { conciliacionVentas } from "@/lib/ventas-conciliadas-sql";
import { buildFixedVariable } from "@/lib/fixed-variable";
import { POR_ACLARAR } from "@/lib/reglas-gasto";
import { ventasInternasDelGrupo, type SedeEnConsolidado } from "@/lib/ventas-internas-grupo";
import { gastosDevueltos, MARCA_PAGO_ERRADO, DIAS_MAX, type IngresoCandidato } from "@/lib/pagos-devueltos";
import { elegirFuenteVentas, type FuenteVenta, type VentasMes } from "@/lib/ventas-mes-sql";
import { formatCurrency } from "@/lib/utils";
import { computeBreakeven, type BreakevenResult, type BreakevenReference } from "@/lib/breakeven";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import type { BaseEquilibrio } from "@/lib/equilibrio";

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
  return (await ventasOficiales(bId, start, end)).total;
}

/**
 * La venta OFICIAL del período: la misma de todo el sistema (seis cifras, dashboard, deck),
 * día por día con la regla de dos de tres entre Byte, el Excel y el administrador
 * (lib/kpis/ventas-loader.ts). Decisión de Jahnn, 5-oct-2026: el punto de equilibrio deja
 * de usar la copia de Byte del Excel de Kelly; el Excel queda como control.
 */
async function ventasOficiales(bId: number, start: string, end: string): Promise<{ total: number; dias: number; ultimoDia: string | null }> {
  const { rows } = await loadVentaRowsBlended(sql as never, bId, start, end);
  const conVenta = rows.filter((r) => r.total > 0);
  return {
    total: Math.round(conVenta.reduce((t, r) => t + r.total, 0) * 100) / 100,
    dias: conVenta.length,
    ultimoDia: conVenta.length > 0 ? conVenta[conVenta.length - 1].date : null,
  };
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

/* ─────────────────────────────────────────────────────────────────────
   Ventas y control contra el Excel de Kelly
   ───────────────────────────────────────────────────────────────────── */

/**
 * Hasta el 19-sep-2026 una sede con la pestaña "Categorías PE" se calculaba
 * con la clasificación de Kelly y las demás con la del sistema. Desde la
 * lista única (lib/reglas-gasto.ts), el Excel y el sistema usan las MISMAS
 * categorías: todas las sedes se calculan con el catálogo del sistema.
 */

/** Ventas del mes para el punto de equilibrio: la venta oficial (ver ventasOficiales). */
async function ventasParaEquilibrio(bId: number, start: string, end: string): Promise<{ total: number; dias: number }> {
  const v = await ventasOficiales(bId, start, end);
  return { total: v.total, dias: v.dias };
}

/** Primer mes cuyo Excel calcula con la lista única (antes usaba otra clasificación). */
const PRIMER_MES_LISTA_UNICA = "2026-09";

/**
 * Lo que calculó el Excel de Kelly para ese mes (el control), solo con la lista única y solo
 * para meses cerrados. El Excel trae la hoja del mes siguiente con los números del anterior
 * («PE OCT26» = setiembre, 5-oct-2026): si un mes repite exacto al anterior, no es un cálculo
 * propio y no se muestra.
 */
async function peDelExcel(bId: number, month: string): Promise<number | null> {
  if (month < PRIMER_MES_LISTA_UNICA || month >= todayLima().slice(0, 7)) return null;
  try {
    const anterior = prevMonths(month, 1)[0];
    const r = (await sql`
      SELECT month, punto_equilibrio::float AS pe, ventas::float AS ventas, costos_fijos::float AS fijos
      FROM pe_mensual_excel WHERE business_id = ${bId} AND month IN (${month}, ${anterior})
    `) as { month: string; pe: number | null; ventas: number | null; fijos: number | null }[];
    const este = r.find((x) => x.month === month);
    const prev = r.find((x) => x.month === anterior);
    if (!este) return null;
    if (prev && prev.ventas === este.ventas && prev.fijos === este.fijos) return null;
    return este.pe;
  } catch {
    return null;
  }
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
  // POR ACLARAR cuenta como fijo provisional (lib/fixed-variable.ts): se avisa cuánto.
  const porAclarar = cuentan.filter((r) => r.category === POR_ACLARAR).reduce((t, r) => t + Number(r.amount), 0);
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
    /** Cuotas de préstamos y tarjetas: van aparte ("PE incluyendo deudas"). */
    financiamiento: report.financiamiento.total,
    sinClasificar: report.sinClasificar.total,
    /** Parte de los fijos que es POR ACLARAR (provisional). */
    porAclarar: Math.round(porAclarar * 100) / 100,
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
        ventasParaEquilibrio(bId, start, end),
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
    // La venta oficial: a la fecha en el mes en curso, del mes entero si está cerrado.
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
  const r = computeBreakeven({ ...costs, ventas, daysElapsed, daysInMonth, reference });
  if (costs.porAclarar > 0) {
    r.warnings = [...r.warnings, `Incluye S/${costs.porAclarar.toFixed(2)} de gastos desconocidos (POR ACLARAR), contados como fijos.`];
  }
  return r;
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
          ventasOficiales(bId, start, end),
          monthCosts(bId, start, end),
          isCurrent ? buildReference(bId, month) : Promise.resolve(null),
        ]);
        return { bId, ventas: v.total, ventasHasta: v.ultimoDia, reference, ...costs };
      }),
    );
    // Mes en curso: cada sede se mide con los días que TIENE cargados, no con los del calendario.
    // Con los del calendario, Atelier con ventas hasta el 3 se veía «en riesgo» un día 8 (8-oct-2026).
    const diasDe = (s: (typeof perSede)[number]) =>
      isCurrent && s.ventasHasta?.startsWith(month) ? Math.min(daysElapsed, Number(s.ventasHasta.slice(8, 10))) : daysElapsed;
    /** Días equivalentes del grupo: los que hacen que su ritmo sea la suma de los ritmos de cada sede. */
    const diasGrupo = (incluidas: typeof perSede) => {
      const ritmo = incluidas.reduce((t, s) => t + (s.ventas > 0 ? s.ventas / diasDe(s) : 0), 0);
      const ventas = incluidas.reduce((t, s) => t + s.ventas, 0);
      return ritmo > 0 ? ventas / ritmo : daysElapsed;
    };
    const sedes = perSede.map((s) => {
      if (isCurrent && !s.reference) {
        const r = computeBreakeven({
          fijos: 0, variables: s.variables, sinClasificar: s.sinClasificar,
          ventas: s.ventas, daysElapsed: diasDe(s), daysInMonth,
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
          daysElapsed: diasDe(s),
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
        daysElapsed: diasGrupo(withRef),
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
 * La meta es el PROMEDIO del total vendido de los últimos 3 meses cerrados
 * y completos (decisión de Jahnn y Kelly, 17-sep-2026: el punto de
 * equilibrio quedaba unos S/10,000 debajo de lo que ya vende cada sede;
 * ver lib/incentives/candado-ventas.ts). Las ventas del mes se miden con
 * el mismo total, para comparar lo mismo con lo mismo. Se congela el
 * primer lunes del mes en `incentive_sales_targets` y no se mueve
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
    ventasTotalesDelMes(bId, start, hoy < end ? hoy : end),
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
    const calc = await metaDeVentas(bId, month);
    return { ...base, meta: calc?.meta ?? null, provisional: false, mesesReferencia: calc?.mesesReferencia ?? [] };
  }

  const congelada = (await sql`
    SELECT meta::float AS meta, meses_referencia
    FROM incentive_sales_targets WHERE business_id = ${bId} AND month = ${month}
  `) as { meta: number; meses_referencia: string[] }[];
  if (congelada.length > 0) {
    return { ...base, meta: congelada[0].meta, provisional: false, mesesReferencia: congelada[0].meses_referencia };
  }

  const calc = await metaDeVentas(bId, month);
  if (calc === null) {
    return { ...base, meta: null, provisional: true, mesesReferencia: [] };
  }

  if (tocaCongelar(month, hoy)) {
    await sql`
      INSERT INTO incentive_sales_targets (business_id, month, meta, meta_exacta, meses_referencia)
      VALUES (${bId}, ${month}, ${calc.meta}, ${calc.exacta}, ${calc.mesesReferencia})
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
  return { ...base, meta: calc.meta, provisional: true, mesesReferencia: calc.mesesReferencia };
}

/**
 * Total vendido del rango: la venta de Byte conciliada, la misma que ve
 * dirección en Reportes (archivo de Byte → registro del administrador →
 * copia de Kelly, día por día). Es la cifra de los reportes mensuales de
 * Byte que usa Kelly. Sin nada conciliable, las fuentes de siempre.
 */
async function ventasTotalesDelMes(bId: number, start: string, end: string): Promise<{ total: number; dias: number }> {
  const c = await conciliacionVentas(bId, start, end);
  if (c && c.totalVendido > 0) {
    return { total: c.totalVendido, dias: c.dias.filter((d) => d.totalVendido > 0).length };
  }
  const v = await ventasDelMesConFuente(bId, start, end);
  return { total: v.total, dias: v.dias };
}

/** Meta de ventas del mes: promedio de los últimos 3 meses cerrados y completos. Ver lib/incentives/candado-ventas.ts. */
async function metaDeVentas(bId: number, month: string) {
  const meses = await Promise.all(
    prevMonths(month, MESES_A_BUSCAR_META).map(async (m) => {
      const { start, end, daysInMonth } = monthMeta(m);
      const v = await ventasTotalesDelMes(bId, start, end);
      return { month: m, total: v.total, diasConVenta: v.dias, diasDelMes: daysInMonth };
    }),
  );
  return metaPorPromedioDeVentas(meses);
}

/* ─────────────────────────────────────────────────────────────────────
   Resumen mensual del punto de equilibrio (la pestaña "PE Resumen")
   ───────────────────────────────────────────────────────────────────── */

export type FilaResumenEquilibrio = {
  month: string;
  ventas: number;
  variables: number;
  fijos: number;
  puntoEquilibrio: number | null;
  /** Ventas − variables − fijos (null en el mes en curso: los gastos todavía no están completos). */
  utilidadOperativa: number | null;
  /**
   * Mes en curso: el punto de equilibrio sale de la referencia de meses cerrados (sus gastos
   * todavía no están completos y darían un piso falso: Centro, 5-oct-2026, S/172).
   */
  porReferencia: boolean;
  mesesReferencia: string[] | null;
  /** null = el mes todavía no terminó. */
  sobreEquilibrio: boolean | null;
  enCurso: boolean;
  /** (Fijos + cuotas de préstamos y tarjetas) / margen: lo que hay que vender para pagar también las deudas. */
  puntoEquilibrioConDeudas: number | null;
  financiamiento: number;
  /** Lo que calculó el Excel de Kelly para ese mes (solo desde la lista única). */
  excel: number | null;
  /** Gastos cuya categoría no tiene grupo en el sistema. */
  sinTipo: number;
};

/**
 * El punto de equilibrio de cada mes, calculado solo con los datos de ese
 * mes — igual que la pestaña "PE Resumen" del Excel de Kelly. Sirve para
 * ver la tendencia y controlar contra el Excel. La META del bono no sale
 * de acá: sale de juntar los meses completos (ver buildReference), porque
 * un mes solo salta mucho (Fonavi 2026: mayo S/21,384, agosto S/37,493).
 */
export async function getResumenEquilibrio(hastaMonth: string, meses = 6, businessId?: number): Promise<
  | { ok: true; filas: FilaResumenEquilibrio[] }
  | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(hastaMonth)) return { ok: false, error: "Mes inválido." };
  try {
    const bId = businessId ?? (await activeBusinessId());
    const lista = [hastaMonth, ...prevMonths(hastaMonth, meses - 1)].reverse();
    const filas = await Promise.all(lista.map(async (m): Promise<FilaResumenEquilibrio | null> => {
      const { start, end, isCurrent } = monthMeta(m);
      const [v, c, excel, ref] = await Promise.all([
        ventasParaEquilibrio(bId, start, end), monthCosts(bId, start, end), peDelExcel(bId, m),
        isCurrent ? buildReference(bId, m) : Promise.resolve(null),
      ]);
      if (v.total === 0 && c.fijos === 0 && c.variables === 0) return null;
      if (isCurrent) {
        // Con la referencia de los meses cerrados, igual que la tarjeta del dashboard.
        const mc = ref ? 1 - ref.varRatio : 0;
        return {
          month: m, ventas: v.total,
          variables: ref ? Math.round(v.total * ref.varRatio * 100) / 100 : Math.round(c.variables * 100) / 100,
          fijos: ref ? Math.round(ref.fijos * 100) / 100 : Math.round(c.fijos * 100) / 100,
          puntoEquilibrio: ref && mc > 0 ? Math.round((ref.fijos / mc) * 100) / 100 : null,
          puntoEquilibrioConDeudas: null,
          financiamiento: Math.round(c.financiamiento * 100) / 100,
          utilidadOperativa: null, sobreEquilibrio: null, enCurso: true, excel: null,
          sinTipo: Math.round(c.sinClasificar * 100) / 100,
          porReferencia: ref !== null, mesesReferencia: ref?.monthsUsed ?? null,
        };
      }
      const margen = v.total > 0 ? (v.total - c.variables) / v.total : 0;
      const pe = margen > 0 ? Math.round((c.fijos / margen) * 100) / 100 : null;
      const peDeudas = margen > 0 ? Math.round(((c.fijos + c.financiamiento) / margen) * 100) / 100 : null;
      return {
        month: m,
        ventas: v.total,
        variables: Math.round(c.variables * 100) / 100,
        fijos: Math.round(c.fijos * 100) / 100,
        puntoEquilibrio: pe,
        puntoEquilibrioConDeudas: peDeudas,
        financiamiento: Math.round(c.financiamiento * 100) / 100,
        utilidadOperativa: Math.round((v.total - c.variables - c.fijos) * 100) / 100,
        sobreEquilibrio: pe === null ? null : v.total >= pe,
        enCurso: false,
        excel,
        sinTipo: Math.round(c.sinClasificar * 100) / 100,
        porReferencia: false,
        mesesReferencia: null,
      };
    }));
    return { ok: true, filas: filas.filter((f): f is FilaResumenEquilibrio => f !== null) };
  } catch (err) {
    console.error("[getResumenEquilibrio] failed:", err);
    return { ok: false, error: "No se pudo calcular el resumen del punto de equilibrio." };
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Punto de equilibrio rediseñado (Grupo → Reportes, 5-oct-2026)
   ───────────────────────────────────────────────────────────────────── */

export type EquilibrioSede = {
  businessId: number;
  sede: string;
  mes: string;
  enCurso: boolean;
  /** Los números que entran a la fórmula (null = no alcanza para calcular). */
  base: BaseEquilibrio | null;
  /** Mes en curso: lo vendido a la fecha. */
  ventasALaFecha: number;
  /**
   * De dónde sale base.ventas: el mes cerrado, la proyección al cierre (mes en curso con 7 días
   * o más cargados) o la venta promedio de los meses cerrados (mes en curso que recién empieza).
   */
  ventasBase: "mes" | "proyeccion" | "promedio";
  /** Hasta qué día llega la venta cargada. */
  ventasHasta: string | null;
  /** De qué mes sale el ticket promedio (si el mes no tiene el reporte de ventas de Byte, el último que lo tenga). */
  ticketDe: string | null;
  /** «ventas» en las cafeterías (tickets de Byte), «pedidos» en Atelier. */
  unidad: "ventas" | "pedidos";
  /** El piso estable: con el promedio de los meses cerrados anteriores (null sin referencia). */
  referencia: { pe: number; meses: string[] } | null;
  historial: FilaResumenEquilibrio[];
  avisos: string[];
};

/**
 * El precio promedio por venta (ticket) del mes: total ÷ número de ventas del reporte de Byte
 * que sube dirección. Si el mes no lo tiene (el mes en curso, casi siempre), el del último mes
 * que lo tenga.
 */
async function ticketDelMes(bId: number, month: string): Promise<{ ticket: number; mes: string } | null> {
  const meses = [month, ...prevMonths(month, 3)];
  try {
    const r = (await sql`
      SELECT to_char(date, 'YYYY-MM') AS m, SUM(pedidos)::float AS pedidos, SUM(total)::float AS total
      FROM byte_ventas_direccion WHERE business_id = ${bId} AND to_char(date, 'YYYY-MM') = ANY(${meses}::text[])
      GROUP BY 1
    `) as { m: string; pedidos: number; total: number }[];
    for (const m of meses) {
      const x = r.find((y) => y.m === m);
      if (x && x.pedidos > 0 && x.total > 0) return { ticket: Math.round((x.total / x.pedidos) * 100) / 100, mes: m };
    }
  } catch { /* sin la tabla: solo soles */ }
  return null;
}

/** Con menos días cargados que esto, el mes en curso no se proyecta (sería ruido). */
const MIN_DIAS_PROYECCION = 7;

/** Todo lo que necesita la sección «Punto de equilibrio» de una sede en un mes. Solo dirección. */
export async function getEquilibrioSede(mes: string, businessId: number): Promise<{ ok: true; data: EquilibrioSede } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  if (![1, 2, 3].includes(businessId)) return { ok: false, error: "Sede inválida." };
  try {
    const { start, end, daysInMonth, isCurrent } = monthMeta(mes);
    const [v, costs, ref, tk, resumen] = await Promise.all([
      ventasOficiales(businessId, start, end),
      monthCosts(businessId, start, end),
      buildReference(businessId, mes),
      ticketDelMes(businessId, mes),
      getResumenEquilibrio(mes, 6, businessId),
    ]);
    const avisos: string[] = [];
    const referencia = ref && ref.varRatio < 1 ? { pe: Math.round((ref.fijos / (1 - ref.varRatio)) * 100) / 100, meses: ref.monthsUsed } : null;
    let base: BaseEquilibrio | null = null;
    let ventasBase: EquilibrioSede["ventasBase"] = "mes";
    if (isCurrent) {
      // Mes en curso: fijos y % de variables de los meses cerrados; las ventas, proyectadas al cierre
      // con el ritmo de los días que ya tienen venta cargada.
      const diasCubiertos = v.ultimoDia ? Number(v.ultimoDia.slice(8, 10)) : 0;
      if (!ref) avisos.push("Todavía no hay meses cerrados completos para calcular el punto de equilibrio del mes en curso.");
      else {
        // Con pocos días la proyección es ruido (Fonavi, 2 días → S/46,198): se compara contra la
        // venta promedio de los meses cerrados hasta tener una semana cargada.
        const proyeccion = diasCubiertos >= MIN_DIAS_PROYECCION ? Math.round((v.total / diasCubiertos) * daysInMonth * 100) / 100 : null;
        ventasBase = proyeccion !== null ? "proyeccion" : "promedio";
        base = {
          fijos: ref.fijos, varRatio: ref.varRatio,
          ventas: proyeccion ?? Math.round((ref.sumVentas / ref.monthsUsed.length) * 100) / 100,
          ticket: tk?.ticket ?? null, diasDelMes: daysInMonth,
          // Las cuotas del mes en curso todavía no están completas: no se suman.
          financiamiento: 0,
        };
        avisos.push(proyeccion !== null
          ? `Mes en curso: el piso usa el promedio de ${ref.monthsUsed.length} meses cerrados y las ventas se proyectan al cierre con el ritmo de los ${diasCubiertos} días cargados.`
          : `Mes en curso con ${diasCubiertos} ${diasCubiertos === 1 ? "día cargado" : "días cargados"}: todavía es pronto para proyectar, así que se compara con la venta promedio de los meses cerrados.`);
      }
    } else if (v.total > 0 && costs.fijos > 0) {
      base = {
        fijos: costs.fijos, varRatio: costs.variables / v.total, ventas: v.total,
        ticket: tk?.ticket ?? null, diasDelMes: daysInMonth, financiamiento: costs.financiamiento,
      };
    } else {
      avisos.push("Ese mes no tiene ventas o gastos fijos cargados.");
    }
    if (costs.porAclarar > 0 && !isCurrent) avisos.push(`Incluye S/${costs.porAclarar.toFixed(2)} de gastos por aclarar, contados como fijos.`);
    if (tk && tk.mes !== mes) avisos.push(`El ticket promedio es de ${tk.mes} (el mes elegido todavía no tiene el reporte de ventas de Byte).`);
    if (!tk) avisos.push("No hay reporte de ventas de Byte para saber cuántas ventas hubo: el punto de equilibrio sale solo en soles.");
    return {
      ok: true,
      data: {
        businessId, sede: SEDE_NAMES[businessId], mes, enCurso: isCurrent, base,
        ventasALaFecha: v.total, ventasBase, ventasHasta: v.ultimoDia, ticketDe: tk?.mes ?? null,
        unidad: businessId === 1 ? "pedidos" : "ventas",
        referencia, historial: resumen.ok ? resumen.filas : [], avisos,
      },
    };
  } catch (err) {
    console.error("[getEquilibrioSede] failed:", err);
    return { ok: false, error: "No se pudo calcular el punto de equilibrio." };
  }
}
