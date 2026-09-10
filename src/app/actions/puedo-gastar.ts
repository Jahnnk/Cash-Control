"use server";

/**
 * "¿Podemos asumir este gasto?" — el panel que faltaba.
 *
 * Junta lo que Kelly pidió por teléfono el 9-sep-2026 cuando se malogró
 * la refrigeradora: ventas de los últimos meses por sede, gastos,
 * resultado, proyección del mes en curso y liquidez. Todo eso ya vivía
 * en el sistema, repartido en cuatro pantallas; acá se recolecta en una.
 *
 * Reutiliza las definiciones canónicas (`salesInRange`, `buildFixedVariable`)
 * para que este panel nunca contradiga al dashboard ni al reporte. La
 * decisión —si alcanza o no— la toma el motor puro `lib/saldos-sede.ts`.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { salesInRange } from "./command-center";
import { buildFixedVariable } from "@/lib/fixed-variable";
import { evaluarGasto, type EvaluacionGasto, type SaldoSede } from "@/lib/saldos-sede";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: { id: number; nombre: string }[] = [
  { id: 1, nombre: "Atelier" },
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
];

const todayLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

function finDeMes(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

function mesAtras(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Costos fijos y totales operativos de un mes. */
async function costosDelMes(bId: number, month: string) {
  const [rows, cats] = await Promise.all([
    sql`
      SELECT category, (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS amount
      FROM expenses
      WHERE business_id = ${bId} AND date BETWEEN ${month + "-01"} AND ${finDeMes(month)}
        AND is_special_loan = false AND is_internal_transfer = false AND archived = false
        AND payment_method <> 'pendiente_atelier'
    `,
    sql`SELECT name, exclude_from_ebitda, cost_group FROM expense_categories WHERE business_id = ${bId}`,
  ]);
  const rep = buildFixedVariable(
    (rows as { category: string; amount: number }[]).map((r) => ({ category: r.category, amount: Number(r.amount) })),
    (cats as { name: string; exclude_from_ebitda: boolean; cost_group: string | null }[]).map((c) => ({
      name: c.name, excludeFromEbitda: c.exclude_from_ebitda, costGroup: c.cost_group,
    })),
  );
  return {
    fijos: rep.fijo.total,
    total: rep.fijo.total + rep.variable.total + rep.sinClasificar.total,
  };
}

export type MesSede = {
  month: string;
  ventas: number;
  gastos: number;
  resultado: number;
};

export type SedePanel = {
  businessId: number;
  nombre: string;
  /** Los 3 meses cerrados anteriores, del más antiguo al más reciente. */
  meses: MesSede[];
  /** Mes en curso a la fecha. */
  enCurso: { ventas: number; gastos: number; dias: number };
  /** Proyección del mes en curso al ritmo actual. null sin días cargados. */
  proyeccion: number | null;
};

export type PanelGasto = {
  todayISO: string;
  sedes: SedePanel[];
  /** La evaluación con monto 0: sirve para pintar la liquidez sin simular. */
  liquidez: EvaluacionGasto;
  /** Costos fijos diarios del grupo, para explicar el colchón. */
  fijoDiarioGrupo: number;
};

async function saldosDeSedes(hoy: string): Promise<SaldoSede[]> {
  const mesPasado = mesAtras(hoy.slice(0, 7), 1);
  return Promise.all(
    SEDES.map(async ({ id, nombre }) => {
      // El saldo declarado más reciente. Si nunca se registró en la tabla
      // nueva, se cae al último cierre diario (la historia de Atelier).
      const declarado = (await sql`
        SELECT fecha::text, banco::float AS banco, caja::float AS caja
        FROM sede_balances WHERE business_id = ${id} ORDER BY fecha DESC LIMIT 1
      `) as { fecha: string; banco: number | null; caja: number }[];

      let banco: number | null = null;
      let caja = 0;
      let fecha: string | null = null;
      if (declarado.length > 0) {
        banco = declarado[0].banco;
        caja = Number(declarado[0].caja);
        fecha = declarado[0].fecha;
      } else {
        const legado = (await sql`
          SELECT date::text AS fecha, bank_balance_real::float AS banco
          FROM daily_records
          WHERE business_id = ${id} AND bank_balance_real IS NOT NULL AND archived = false
          ORDER BY date DESC LIMIT 1
        `) as { fecha: string; banco: number }[];
        if (legado.length > 0) {
          banco = legado[0].banco;
          fecha = legado[0].fecha;
          const c = (await sql`
            SELECT (
              COALESCE((SELECT initial_cash_balance FROM businesses WHERE id = ${id}), 0)
              + COALESCE((SELECT SUM(amount) FROM bank_income_items
                  WHERE business_id = ${id} AND payment_method = 'efectivo' AND archived = false AND date <= ${legado[0].fecha}), 0)
              - COALESCE((SELECT SUM(amount) FROM expenses
                  WHERE business_id = ${id} AND payment_method = 'efectivo' AND archived = false AND date <= ${legado[0].fecha}), 0)
            )::float AS c
          `) as { c: number }[];
          caja = Number(c[0].c);
        }
      }

      // El costo fijo diario sale del último mes CERRADO: el mes en curso
      // todavía no tiene el alquiler ni la planilla completos.
      const { fijos } = await costosDelMes(id, mesPasado);
      const [y, m] = mesPasado.split("-").map(Number);
      const dias = new Date(y, m, 0).getDate();

      return { businessId: id, nombre, banco, caja, fecha, gastoFijoDiario: fijos / dias };
    }),
  );
}

export async function getPanelGasto(monto = 0): Promise<
  { ok: true; data: PanelGasto } | { ok: false; error: string }
> {
  if (!(await requireFullSession())) return { ok: false, error: "Sin acceso." };
  try {
    const hoy = todayLima();
    const mesActual = hoy.slice(0, 7);

    const sedes = await Promise.all(
      SEDES.map(async ({ id, nombre }): Promise<SedePanel> => {
        const meses = await Promise.all(
          [3, 2, 1].map(async (n) => {
            const m = mesAtras(mesActual, n);
            const [ventas, costos] = await Promise.all([
              salesInRange(id, `${m}-01`, finDeMes(m)),
              costosDelMes(id, m),
            ]);
            return { month: m, ventas: r2(ventas), gastos: r2(costos.total), resultado: r2(ventas - costos.total) };
          }),
        );

        const [ventasCurso, costosCurso] = await Promise.all([
          salesInRange(id, `${mesActual}-01`, hoy),
          costosDelMes(id, mesActual),
        ]);
        // Días con venta cargada, para proyectar al ritmo REAL y no
        // dividiendo por los días del calendario (que castigaría a una
        // sede con la carga atrasada).
        const d = (await sql`
          SELECT COUNT(*)::int AS n FROM (
            SELECT gs::date FROM generate_series(${mesActual + "-01"}::date, ${hoy}::date, '1 day') gs
            WHERE EXISTS (SELECT 1 FROM upselling_daily u WHERE u.business_id = ${id} AND u.date = gs::date AND u.revenue > 0)
               OR EXISTS (SELECT 1 FROM daily_records dr WHERE dr.business_id = ${id} AND dr.date = gs::date AND dr.archived = false AND dr.byte_total > 0)
               OR EXISTS (SELECT 1 FROM byte_sales_daily b WHERE b.business_id = ${id} AND b.date = gs::date AND (b.efectivo + b.yape_plin + b.pos) > 0)
          ) t
        `) as { n: number }[];
        const dias = Number(d[0].n);
        const [y, m] = mesActual.split("-").map(Number);
        const diasDelMes = new Date(y, m, 0).getDate();

        return {
          businessId: id, nombre, meses,
          enCurso: { ventas: r2(ventasCurso), gastos: r2(costosCurso.total), dias },
          proyeccion: dias > 0 ? r2((ventasCurso / dias) * diasDelMes) : null,
        };
      }),
    );

    const saldos = await saldosDeSedes(hoy);
    return {
      ok: true,
      data: {
        todayISO: hoy,
        sedes,
        liquidez: evaluarGasto({ monto, sedes: saldos, todayISO: hoy }),
        fijoDiarioGrupo: r2(saldos.reduce((t, s) => t + s.gastoFijoDiario, 0)),
      },
    };
  } catch (err) {
    console.error("[getPanelGasto] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al armar el panel" };
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Registra (o corrige) el saldo de una sede a una fecha. */
export async function guardarSaldoSede(input: {
  businessId: number;
  fecha: string;
  banco: number | null;
  caja: number;
  nota?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección puede registrar saldos." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { ok: false, error: "Fecha inválida." };
  if (!SEDES.some((s) => s.id === input.businessId)) return { ok: false, error: "Sede inválida." };
  try {
    await sql`
      INSERT INTO sede_balances (business_id, fecha, banco, caja, nota, registrado_por)
      VALUES (${input.businessId}, ${input.fecha},
              ${input.banco === null ? null : input.banco.toFixed(2)},
              ${input.caja.toFixed(2)}, ${input.nota ?? null}, 'dirección')
      ON CONFLICT (business_id, fecha) DO UPDATE
        SET banco = EXCLUDED.banco, caja = EXCLUDED.caja,
            nota = EXCLUDED.nota, created_at = now()
    `;
    return { ok: true };
  } catch (err) {
    console.error("[guardarSaldoSede] failed:", err);
    return { ok: false, error: "No pude guardar el saldo." };
  }
}
