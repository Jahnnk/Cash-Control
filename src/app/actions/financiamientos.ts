"use server";

/** Financiamientos que se pagan mes a mes, con lo pagado y lo que falta, para el Dashboard (solo dirección). */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole, requireLectura } from "@/lib/session-access";
import { validarFinanciamiento, type FichaFinanciamiento } from "@/lib/financiamientos-validar";
import { leerFinanciamientos } from "@/lib/financiamientos-sql";
import type { EstadoFinanciamiento, PagoDeuda } from "@/lib/financiamientos";

const sql = neon(process.env.DATABASE_URL!);

export async function getFinanciamientos(): Promise<{ ok: true; deudas: EstadoFinanciamiento[]; sinDeuda: PagoDeuda[] } | { ok: false; error: string }> {
  if (!(await requireLectura())) return { ok: false, error: "Solo dirección." };
  return { ok: true, ...(await leerFinanciamientos(sql)) };
}

/** Crea o corrige la ficha de un financiamiento. Solo dirección. Lo que se deja vacío queda como «falta dato». */
export async function guardarFinanciamiento(input: FichaFinanciamiento): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const v = validarFinanciamiento(input);
  if (!v.ok) return v;
  const f = v.ficha;
  try {
    if (f.id !== null) {
      const r = await sql`
        UPDATE financiamientos SET business_id = ${f.businessId}, nombre = ${f.nombre}, acreedor = ${f.acreedor}, patron = ${f.patron},
          dia_pago = ${f.diaPago}, cuota = ${f.cuota}, monto_original = ${f.montoOriginal}, cuotas_total = ${f.cuotasTotal},
          incluye_intereses = ${f.incluyeIntereses}, desde = ${f.desde}
        WHERE id = ${f.id} RETURNING id`;
      if (r.length === 0) return { ok: false, error: "No encontré esa deuda." };
    } else {
      await sql`
        INSERT INTO financiamientos (business_id, nombre, acreedor, patron, dia_pago, cuota, monto_original, cuotas_total, incluye_intereses, desde)
        VALUES (${f.businessId}, ${f.nombre}, ${f.acreedor}, ${f.patron}, ${f.diaPago}, ${f.cuota}, ${f.montoOriginal}, ${f.cuotasTotal}, ${f.incluyeIntereses}, ${f.desde})`;
    }
    revalidatePath("/grupo/dashboard");
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) return { ok: false, error: "Esa sede ya tiene una deuda con ese nombre." };
    console.error("[guardarFinanciamiento] failed:", e);
    return { ok: false, error: "No se pudo guardar el financiamiento." };
  }
}
