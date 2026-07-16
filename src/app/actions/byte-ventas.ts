"use server";

/**
 * Ventas diarias de Byte + Panel de Atelier.
 *
 * Dos fuentes escriben byte_ventas_daily (regla de precedencia explícita,
 * patrón "lo medido manda" — lección de los tiempos, jul-2026):
 *
 *   - 'import'  → reporte semanal "Ventas de <MES>" de Byte (dato OFICIAL).
 *                 Siempre gana: pisa lo manual.
 *   - 'manual'  → registro diario de la supervisora de Atelier (dato fresco).
 *                 NUNCA pisa un día que ya vino del reporte oficial.
 *
 * En las cafeterías (Fonavi/Centro) el import NO toca upselling_daily:
 * "# Pedidos" ≠ personas (el tráfico se cuenta a mano) y ese registro
 * lleva segunda firma. En Atelier sí: venta y pedidos SON sus KPIs.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import type { ParsedVentaDay } from "@/lib/incentives/byte-ventas-parser";

const sql = neon(process.env.DATABASE_URL!);

/** Dirección, o admin/supervisora de la sede activa. */
async function requireSedeAccess(bId: number): Promise<{ ok: true; isAdmin: boolean } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind === "full") return { ok: true, isAdmin: false };
  if (role?.kind === "admin" && role.sede === bId) return { ok: true, isAdmin: true };
  return { ok: false, error: "Sin acceso a esta sede." };
}

/* ─────────────────────────────────────────────────────────────────────
   Import del reporte semanal de ventas (las 3 sedes)
   ───────────────────────────────────────────────────────────────────── */

export async function importVentasByte(input: {
  days: ParsedVentaDay[];
  fileName: string | null;
}): Promise<{ ok: true; imported: number } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const access = await requireSedeAccess(bId);
  if (!access.ok) return access;
  if (!Array.isArray(input.days) || input.days.length === 0) {
    return { ok: false, error: "El archivo no trae días para importar." };
  }
  if (input.days.length > 366) return { ok: false, error: "Demasiados días en un solo archivo." };
  for (const d of input.days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return { ok: false, error: `Fecha inválida: ${d.date}` };
    if (!Number.isFinite(d.total) || d.total < 0) return { ok: false, error: `Venta inválida el ${d.date}` };
    if (!Number.isFinite(d.pedidos) || d.pedidos < 0) return { ok: false, error: `Pedidos inválidos el ${d.date}` };
  }

  try {
    console.log(`[importVentasByte] bId=${bId} days=${input.days.length} file=${input.fileName ?? "?"}`);
    for (const d of input.days) {
      // El reporte oficial de Byte siempre manda (source='import').
      await sql`
        INSERT INTO byte_ventas_daily (business_id, date, pedidos, descuentos, total, source, updated_at)
        VALUES (${bId}, ${d.date}, ${d.pedidos}, ${d.descuentos}, ${d.total}, 'import', NOW())
        ON CONFLICT (business_id, date) DO UPDATE
          SET pedidos = EXCLUDED.pedidos, descuentos = EXCLUDED.descuentos,
              total = EXCLUDED.total, source = 'import', updated_at = NOW()
      `;
      if (bId === 1) {
        // Atelier: venta y pedidos SON sus KPIs diarios. El reporte
        // oficial pisa lo tecleado; las mermas (otra fuente) se respetan.
        await sql`
          INSERT INTO upselling_daily (business_id, date, personas, revenue, source, updated_at)
          VALUES (1, ${d.date}, ${d.pedidos}, ${d.total}, 'import', NOW())
          ON CONFLICT (business_id, date) DO UPDATE
            SET personas = EXCLUDED.personas, revenue = EXCLUDED.revenue,
                source = 'import', updated_at = NOW()
        `;
      }
    }
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true, imported: input.days.length };
  } catch (err) {
    console.error("[importVentasByte] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al importar las ventas" };
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Panel de Atelier (supervisora operativa)
   ───────────────────────────────────────────────────────────────────── */

export type AtelierDaily = {
  date: string;
  venta: number | null;
  pedidos: number | null;
  mermas: number | null;
  /** 'import' = vino del reporte oficial de Byte (no editable a mano). */
  source: string;
};

export type AtelierPanelData = {
  isAdminSession: boolean;
  dailies: AtelierDaily[];
  summary: {
    ventaTotal: number;
    diasConVenta: number;
    ticketProm: number | null;   // venta ÷ pedidos del mes
    mermasTotal: number;
    mermasPct: number | null;    // mermas ÷ venta
  };
};

export async function getAtelierPanel(
  month: string,
): Promise<{ ok: true; data: AtelierPanelData } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (bId !== 1) return { ok: false, error: "Este panel es de Atelier." };
  const access = await requireSedeAccess(1);
  if (!access.ok) return access;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { ok: false, error: "Mes inválido." };

  try {
    const [y, m] = month.split("-").map(Number);
    const monthEnd = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const rows = (await sql`
      SELECT date::text, revenue::float AS venta, personas AS pedidos,
             mermas_soles::float AS mermas, source
      FROM upselling_daily
      WHERE business_id = 1 AND date BETWEEN ${month + "-01"} AND ${monthEnd}
      ORDER BY date
    `) as AtelierDaily[];

    const conVenta = rows.filter((r) => (r.venta ?? 0) > 0);
    const ventaTotal = Math.round(conVenta.reduce((a, r) => a + (r.venta ?? 0), 0) * 100) / 100;
    const pedidosTotal = conVenta.reduce((a, r) => a + (r.pedidos ?? 0), 0);
    const mermasTotal = Math.round(rows.reduce((a, r) => a + (r.mermas ?? 0), 0) * 100) / 100;

    return {
      ok: true,
      data: {
        isAdminSession: access.isAdmin,
        dailies: rows,
        summary: {
          ventaTotal,
          diasConVenta: conVenta.length,
          ticketProm: pedidosTotal > 0 ? Math.round((ventaTotal / pedidosTotal) * 100) / 100 : null,
          mermasTotal,
          mermasPct: ventaTotal > 0 ? Math.round((mermasTotal / ventaTotal) * 10000) / 100 : null,
        },
      },
    };
  } catch (err) {
    console.error("[getAtelierPanel] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar el panel" };
  }
}

export async function saveAtelierDay(input: {
  date: string;
  venta: number;
  pedidos: number;
  mermas: number | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (bId !== 1) return { ok: false, error: "Este registro es de Atelier." };
  const access = await requireSedeAccess(1);
  if (!access.ok) return access;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  if (!Number.isFinite(input.venta) || input.venta <= 0) return { ok: false, error: "La venta debe ser mayor a 0." };
  if (!Number.isFinite(input.pedidos) || input.pedidos <= 0 || !Number.isInteger(input.pedidos)) {
    return { ok: false, error: "Los pedidos deben ser un número entero mayor a 0." };
  }
  if (input.mermas !== null && (!Number.isFinite(input.mermas) || input.mermas < 0)) {
    return { ok: false, error: "Mermas inválidas." };
  }

  try {
    // Reglas de escritura (patrón "lo medido manda"):
    //  - venta/pedidos: lo manual NUNCA pisa un día del reporte oficial
    //    de Byte (source='import') — se corrige re-subiendo el reporte.
    //  - mermas: siempre de la supervisora; vacío no borra (COALESCE).
    await sql`
      INSERT INTO upselling_daily (business_id, date, personas, revenue, mermas_soles, source, updated_at)
      VALUES (1, ${input.date}, ${input.pedidos}, ${input.venta}, ${input.mermas}, 'manual', NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET personas = CASE WHEN upselling_daily.source = 'import' THEN upselling_daily.personas ELSE EXCLUDED.personas END,
            revenue = CASE WHEN upselling_daily.source = 'import' THEN upselling_daily.revenue ELSE EXCLUDED.revenue END,
            mermas_soles = COALESCE(EXCLUDED.mermas_soles, upselling_daily.mermas_soles),
            source = CASE WHEN upselling_daily.source = 'import' THEN 'import' ELSE 'manual' END,
            updated_at = NOW()
    `;
    // Espejo en byte_ventas_daily para el deck — pero lo manual NUNCA
    // pisa un día que ya vino del reporte oficial de Byte.
    try {
      await sql`
        INSERT INTO byte_ventas_daily (business_id, date, pedidos, total, source, updated_at)
        VALUES (1, ${input.date}, ${input.pedidos}, ${input.venta}, 'manual', NOW())
        ON CONFLICT (business_id, date) DO UPDATE
          SET pedidos = EXCLUDED.pedidos, total = EXCLUDED.total, updated_at = NOW()
          WHERE byte_ventas_daily.source <> 'import'
      `;
    } catch {
      // tabla byte_ventas_daily pendiente de migración — el registro
      // diario (upselling_daily) igual quedó guardado.
    }
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    console.error("[saveAtelierDay] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al guardar el día" };
  }
}
