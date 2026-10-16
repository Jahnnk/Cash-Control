"use server";

/**
 * Estado de resultados de 6 meses (Fase 2, 16-oct-2026) · solo dirección. Lee las seis cifras de cada mes
 * (la misma fuente que el resto de Reportes) y los movimientos de una categoría para el detalle.
 * La forma del estado de resultados: lib/estado-resultados.ts.
 */

import { neon } from "@neondatabase/serverless";
import { requireFullSession } from "@/lib/session-access";
import { getSeisCifras } from "./seis-cifras";
import { recuperosDelPeriodo } from "@/lib/recuperos-sql";
import type { CifrasSede } from "@/lib/seis-cifras";

const sql = neon(process.env.DATABASE_URL!);
const SEDES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

const mesesHasta = (mes: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5) - 1 - (n - 1 - i), 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
});

export type DatosEstadoResultados = { hoy: string; meses: { mes: string; sedes: CifrasSede[] }[] };

/** Las seis cifras de los 6 meses que terminan en `mes` (del más antiguo al más reciente). */
export async function getEstadoResultados(mes: string): Promise<{ ok: true; data: DatosEstadoResultados } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, error: "Mes inválido." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const lista = mesesHasta(mes, 6);
  const res = await Promise.all(lista.map((m) => getSeisCifras(m)));
  const malo = res.find((r) => !r.ok);
  if (malo && !malo.ok) return { ok: false, error: malo.error };
  return { ok: true, data: { hoy, meses: res.map((r, i) => ({ mes: lista[i], sedes: r.ok ? r.data.sedes : [] })) } };
}

export type MovimientoCategoria = { sede: string; fecha: string; concepto: string; monto: number; nota: string | null };

/**
 * Los movimientos de una categoría en un mes (lo que le toca a la sede), con las devoluciones que la restan.
 * `bId` null = las tres sedes (vista del grupo).
 */
export async function getMovimientosCategoria(bId: number | null, mes: string, categoria: string): Promise<{ ok: true; items: MovimientoCategoria[] } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || !categoria) return { ok: false, error: "Datos inválidos." };
  const desde = `${mes}-01`;
  const fin = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5), 0)).toISOString().slice(0, 10);
  const ids = bId === null ? [2, 3, 1] : [bId];
  try {
    const porSede = await Promise.all(ids.map(async (id) => {
      const [filas, recup] = await Promise.all([
        sql`
          SELECT date::text AS fecha, concept AS concepto,
                 (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS monto,
                 payment_method AS metodo, is_shared AS compartido, amount::float AS bruto
          FROM expenses
          WHERE business_id = ${id} AND date BETWEEN ${desde} AND ${fin} AND archived = false AND category = ${categoria}
            AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
            AND payment_method <> 'pendiente_atelier' AND (payment_method <> 'socio' OR is_special_loan = false)
          ORDER BY date, amount DESC
        ` as unknown as Promise<{ fecha: string; concepto: string; monto: number; metodo: string; compartido: boolean; bruto: number }[]>,
        recuperosDelPeriodo(sql as never, id, desde, fin),
      ]);
      const items: MovimientoCategoria[] = filas.map((f) => ({
        sede: SEDES[id], fecha: f.fecha, concepto: f.concepto, monto: f.monto,
        nota: f.metodo === "socio" ? "lo pagó el socio" : f.compartido && f.bruto !== f.monto ? `compartido: pagó ${f.bruto.toFixed(2)}` : null,
      }));
      for (const r of recup.recuperos.filter((x) => x.categoria === categoria)) items.push({ sede: SEDES[id], fecha: r.fecha, concepto: r.nota, monto: -r.monto, nota: "devolución: resta del gasto" });
      return items;
    }));
    return { ok: true, items: porSede.flat().sort((a, b) => a.fecha.localeCompare(b.fecha)) };
  } catch (e) {
    console.error("[getMovimientosCategoria] failed:", e);
    return { ok: false, error: "No se pudieron leer los movimientos." };
  }
}
