"use server";

/**
 * Mejor vendedor por TURNO (hándicap) · Actions.
 *
 * Con lo que Byte SÍ exporta (Ventas por Trabajador: mesas + total por
 * trabajador del período) + el turno de cada uno (mañana/tarde/completo),
 * medimos quién más levanta su ticket sobre lo normal de SU turno — no
 * quien vende más en bruto. El motor puro vive en lib/mejor-vendedor.ts.
 *
 * Unidad: ticket por MESA (lo que da Byte). Es consistente para todos,
 * así que el ranking del "levantamiento" es justo aunque no sea por
 * persona. "Lo normal del turno" = promedio del turno SIN el propio
 * vendedor (no compite contra sí mismo).
 *
 * Datos: usa el ÚLTIMO reporte subido dentro del mes (mismo patrón que
 * el ranking del tablero) — el admin sube el acumulado del mes.
 * El pago sigue siendo manual: esto entrega el ganador sugerido, no paga.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { filasVentasTrabajador } from "@/lib/incentivos/ventas-trabajador-sql";
import { ventasPorTrabajador, type FilaPeriodo } from "@/lib/incentivos/ventas-trabajador";

import { getSessionRole } from "@/lib/session-access";
import { computeMejorVendedor, type MejorVendedorResult, type SellerFranjaRecord } from "@/lib/mejor-vendedor";
import { MIN_MESAS_MEJOR_VENDEDOR, contarNoElegibles } from "@/lib/incentives/best-seller-window";

const sql = neon(process.env.DATABASE_URL!);

export type Turno = "mañana" | "tarde" | "completo";
const TURNOS: Turno[] = ["mañana", "tarde", "completo"];

/** Mínimo de MESAS en el mes para calificar al premio (piso anti-suerte). */
// Umbral ÚNICO compartido con el panel del Grupo (incidente jul-2026:
// dos umbrales = dos ganadores del mismo desayuno).
const MIN_MESAS = MIN_MESAS_MEJOR_VENDEDOR;

async function requireDireccionOrAdmin(bId: number): Promise<boolean> {
  const role = await getSessionRole();
  if (role?.kind === "full") return true;
  return role?.kind === "admin" && role.sede === bId;
}

/** Último reporte de Ventas por Trabajador subido dentro del mes. */
async function latestWorkers(bId: number, month: string): Promise<{ nombre: string; mesas: number; total: number; periodEnd: string | null }[]> {
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const filas = ventasPorTrabajador(
    (await filasVentasTrabajador(sql, bId, monthStart, monthEnd)) as FilaPeriodo[],
  );
  return filas.map((f) => ({ nombre: f.nombre, mesas: f.mesas, total: f.total, periodEnd: f.periodEnd }));
}

async function loadShifts(bId: number): Promise<Map<string, Turno>> {
  try {
    const rows = (await sql`
      SELECT nombre, turno FROM worker_shifts WHERE business_id = ${bId}
    `) as { nombre: string; turno: Turno }[];
    return new Map(rows.map((r) => [r.nombre.trim().toUpperCase(), r.turno]));
  } catch {
    return new Map();
  }
}

export type MejorVendedorView = {
  month: string;
  result: MejorVendedorResult;
  /** true si aún no hay reporte de trabajadores del mes. */
  sinDatos: boolean;
  /** true si nadie tiene turno asignado (todos caen en "completo"). */
  sinTurnos: boolean;
  periodEnd: string | null;
  minMesas: number;
  /** Cuántos quedaron fuera del ranking por no llegar al mínimo de mesas. */
  noElegibles: number;
};

/** Ranking del mejor vendedor por turno (hándicap) del mes. */
export async function getMejorVendedor(month: string): Promise<
  | { ok: true; data: MejorVendedorView }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (!(await requireDireccionOrAdmin(bId))) return { ok: false, error: "Sin acceso." };
  if (bId !== 2 && bId !== 3) return { ok: false, error: "Aplica a las cafeterías." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const workers = await latestWorkers(bId, month);
    const shifts = await loadShifts(bId);
    const records: SellerFranjaRecord[] = workers
      .filter((w) => w.mesas > 0)
      .map((w) => ({
        seller: w.nombre,
        franja: shifts.get(w.nombre.trim().toUpperCase()) ?? "completo",
        ticketPersona: w.total / w.mesas,   // ticket por mesa (unidad de Byte)
        clientes: w.mesas,
      }));
    const result = computeMejorVendedor({ records, minClientes: MIN_MESAS });
    const assignedCount = workers.filter((w) => shifts.has(w.nombre.trim().toUpperCase())).length;
    return {
      ok: true,
      data: {
        month,
        result,
        sinDatos: workers.length === 0,
        sinTurnos: assignedCount === 0,
        periodEnd: workers[0]?.periodEnd ?? null,
        minMesas: MIN_MESAS,
        noElegibles: contarNoElegibles(workers),
      },
    };
  } catch (err) {
    console.error("[getMejorVendedor] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al calcular el mejor vendedor" };
  }
}

export type WorkerShiftRow = { nombre: string; turno: Turno; mesas: number };

/** Trabajadores del último reporte + su turno asignado (para el editor). */
export async function getWorkerShifts(month: string): Promise<
  | { ok: true; rows: WorkerShiftRow[]; tableReady: boolean }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (!(await requireDireccionOrAdmin(bId))) return { ok: false, error: "Sin acceso." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };
  try {
    const workers = await latestWorkers(bId, month);
    let tableReady = true;
    let shifts = new Map<string, Turno>();
    try {
      shifts = await loadShifts(bId);
    } catch {
      tableReady = false;
    }
    return {
      ok: true,
      tableReady,
      rows: workers.map((w) => ({
        nombre: w.nombre,
        turno: shifts.get(w.nombre.trim().toUpperCase()) ?? "completo",
        mesas: w.mesas,
      })),
    };
  } catch (err) {
    console.error("[getWorkerShifts] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar turnos" };
  }
}

/** Guarda el turno de cada trabajador (dirección o admin de la sede). */
export async function saveWorkerShifts(input: {
  assignments: { nombre: string; turno: Turno }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!(await requireDireccionOrAdmin(bId))) return { ok: false, error: "Sin acceso." };
  for (const a of input.assignments) {
    if (!a.nombre?.trim()) return { ok: false, error: "Nombre vacío." };
    if (!TURNOS.includes(a.turno)) return { ok: false, error: `Turno inválido: ${a.turno}.` };
  }
  try {
    await sql.transaction(
      input.assignments.map(
        (a) => sql`
          INSERT INTO worker_shifts (business_id, nombre, turno, updated_at)
          VALUES (${bId}, ${a.nombre.trim()}, ${a.turno}, NOW())
          ON CONFLICT (business_id, nombre) DO UPDATE
            SET turno = EXCLUDED.turno, updated_at = NOW()`,
      ),
    );
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/worker_shifts/.test(msg)) {
      return { ok: false, error: "Falta la migración de turnos (tabla worker_shifts) — avísale a Jahnn." };
    }
    console.error("[saveWorkerShifts] failed:", err);
    return { ok: false, error: msg || "Error al guardar turnos" };
  }
}
