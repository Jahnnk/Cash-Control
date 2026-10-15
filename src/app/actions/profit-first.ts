"use server";

/**
 * Guarda los ajustes de Profit First y de la regla 33-33-33 (solo dirección).
 * La tabla profit_first_config tiene una sola fila; ver scripts/migrations/2026-10-15-profit-first-config.sql.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";
import { validarConfig, type ConfigProfitFirst } from "@/lib/regla-33";

const sql = neon(process.env.DATABASE_URL!);

export async function guardarConfigProfitFirst(input: ConfigProfitFirst): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const cfg: ConfigProfitFirst = {
    utilidadPct: Math.round(Number(input?.utilidadPct) * 100) / 100,
    ebitdaPct: Math.round(Number(input?.ebitdaPct) * 100) / 100,
    sociosDeUtilidad: input?.sociosDeUtilidad === true,
  };
  const motivo = validarConfig(cfg);
  if (motivo) return { ok: false, error: motivo };
  try {
    await sql`
      INSERT INTO profit_first_config (id, utilidad_pct, ebitda_pct, socios_de_utilidad, actualizado_por)
      VALUES (1, ${cfg.utilidadPct}, ${cfg.ebitdaPct}, ${cfg.sociosDeUtilidad}, ${role.quien})
      ON CONFLICT (id) DO UPDATE SET utilidad_pct = EXCLUDED.utilidad_pct, ebitda_pct = EXCLUDED.ebitda_pct,
        socios_de_utilidad = EXCLUDED.socios_de_utilidad, actualizado_por = EXCLUDED.actualizado_por, actualizado_el = NOW()`;
    revalidatePath("/grupo/reportes");
    revalidatePath("/grupo/dashboard");
    return { ok: true };
  } catch (e) {
    console.error("[guardarConfigProfitFirst] failed:", e);
    return { ok: false, error: "No se pudo guardar. Si es la primera vez, falta activar los ajustes (una sola vez)." };
  }
}
