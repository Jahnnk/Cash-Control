/**
 * Historial de cambios de la venta diaria (pedido de Jahnn, 1-nov-2026).
 *
 * Cada vez que una administradora (o la dirección) guarda la venta o las personas de un día y eso CAMBIA
 * algo, se anota quién, cuándo y de qué monto a qué monto. Guardar lo mismo no anota nada.
 * Tabla: venta_diaria_cambios (scripts/migrations/2026-11-01-venta-diaria-cambios.sql).
 *
 * Anotar nunca debe impedir guardar la venta: si la tabla aún no existe o falla, se sigue en silencio.
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SessionRole } from "@/lib/session-access";

type Sql = NeonQueryFunction<false, false>;

export type DiaVenta = { personas: number | null; revenue: number | null };

const SEDE: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

const centimos = (n: number | null) => (n === null ? null : Math.round(n * 100));

/** ¿Guardar este día cambia algo respecto de lo que había? Un día que no existía siempre cuenta. */
export function huboCambioDeVenta(antes: DiaVenta | null, despues: { personas: number; revenue: number }): boolean {
  if (antes === null) return true;
  return antes.personas !== despues.personas || centimos(antes.revenue) !== centimos(despues.revenue);
}

/** Quién guardó, dicho para la pantalla. Sin nombre conocido se dice el cargo. */
export function quienGuardo(role: SessionRole, bId: number): { quien: string; rol: "admin" | "direccion" } {
  if (role?.kind === "admin") return { quien: role.nombre?.trim() || `Administración de ${SEDE[bId] ?? "la sede"}`, rol: "admin" };
  return { quien: role?.kind === "full" ? (role.quien === "kelly" ? "Kelly" : "Jahnn") : "Dirección", rol: "direccion" };
}

export async function anotarCambioDeVenta(
  sql: Sql,
  c: { bId: number; date: string; antes: DiaVenta | null; despues: { personas: number; revenue: number }; role: SessionRole },
): Promise<void> {
  if (!huboCambioDeVenta(c.antes, c.despues)) return;
  const { quien, rol } = quienGuardo(c.role, c.bId);
  try {
    await sql`
      INSERT INTO venta_diaria_cambios (business_id, date, venta_antes, venta_despues, personas_antes, personas_despues, quien, rol)
      VALUES (${c.bId}, ${c.date}, ${c.antes?.revenue ?? null}, ${c.despues.revenue}, ${c.antes?.personas ?? null}, ${c.despues.personas}, ${quien}, ${rol})
    `;
  } catch (err) {
    console.error("[venta-diaria-historial] no se pudo anotar el cambio:", err);
  }
}

export type CambioDeVenta = {
  businessId: number;
  sede: string;
  date: string;
  ventaAntes: number | null;
  ventaDespues: number;
  personasAntes: number | null;
  personasDespues: number;
  quien: string;
  creadoEn: string;
};

export const nombreDeSede = (bId: number) => SEDE[bId] ?? `Sede ${bId}`;
