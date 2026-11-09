"use server";

/** Saldo de los fondos mutuos de Atelier y Centro para el Dashboard (solo dirección). Guardar: guardarFondosMutuos (decision.ts). */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { leerFondo } from "@/lib/fondos-mutuos-sql";
import type { EstadoFondo } from "@/lib/fondos-mutuos";

const sql = neon(process.env.DATABASE_URL!);
export type FondoSede = { businessId: number; sede: string } & EstadoFondo;

export async function getFondosMutuos(): Promise<{ ok: true; fondos: FondoSede[] } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  try {
    const fondos = await Promise.all([[3, "Centro"], [1, "Atelier"]].map(async ([id, sede]) => ({ businessId: id as number, sede: sede as string, ...(await leerFondo(sql, id as number)) })));
    return { ok: true, fondos };
  } catch (e) {
    console.error("[getFondosMutuos] failed:", e);
    return { ok: false, error: "No se pudo leer el saldo de los fondos mutuos." };
  }
}
