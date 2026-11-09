"use server";

/** Préstamos entre sedes (Fonavi y Centro → Atelier) con su saldo pendiente, para el Dashboard (solo dirección). */

import { neon } from "@neondatabase/serverless";
import { requireLectura } from "@/lib/session-access";
import { leerPrestamosEntreSedes } from "@/lib/prestamos-entre-sedes-sql";
import type { PrestamoEntreSedes } from "@/lib/prestamos-entre-sedes";

const sql = neon(process.env.DATABASE_URL!);

export async function getPrestamosEntreSedes(): Promise<{ ok: true; prestamos: PrestamoEntreSedes[] } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  return { ok: true, prestamos: await leerPrestamosEntreSedes(sql) };
}
