"use server";

/**
 * Los cuatro motores del EBITDA de un mes (solo dirección). El dashboard los pide aparte, ya con la
 * página abierta, para no alargar su carga; Reportes los lee directo (lib/motores-ebitda-sql.ts).
 */

import { getSeisCifras } from "./seis-cifras";
import { leerMotores } from "@/lib/motores-ebitda-sql";
import type { Motores } from "@/lib/motores-ebitda";

export async function getMotoresEbitda(mes: string): Promise<{ ok: true; data: Motores[] } | { ok: false }> {
  const cifras = await getSeisCifras(mes);
  if (!cifras.ok) return { ok: false };
  try {
    return { ok: true, data: await leerMotores(cifras.data) };
  } catch (e) {
    console.error("[getMotoresEbitda] failed:", e);
    return { ok: false };
  }
}
