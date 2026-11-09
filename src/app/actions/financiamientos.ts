"use server";

/** Financiamientos que se pagan mes a mes, con lo pagado y lo que falta, para el Dashboard (solo dirección). */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { leerFinanciamientos } from "@/lib/financiamientos-sql";
import type { EstadoFinanciamiento, PagoDeuda } from "@/lib/financiamientos";

const sql = neon(process.env.DATABASE_URL!);

export async function getFinanciamientos(): Promise<{ ok: true; deudas: EstadoFinanciamiento[]; sinDeuda: PagoDeuda[] } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  return { ok: true, ...(await leerFinanciamientos(sql)) };
}
