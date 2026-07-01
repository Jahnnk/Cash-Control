"use server";

/**
 * Importa la reposición de caja chica (Excel de "Gastos Pendientes por
 * Reponer") como egresos de Atelier. Cada ítem del Excel se registra como
 * un gasto por TRANSFERENCIA (sale del banco) en la FECHA DE REPOSICIÓN
 * elegida —el día que se transfiere al administrador—, categorizado según
 * el bloque del Excel. Así ese día suma exactamente el cargo único que
 * muestra el banco, pero desglosado por categoría.
 *
 * La fecha original de cada gasto se guarda en las notas como referencia.
 * Anti-duplicados: cada gasto lleva una firma [rep:<Generado>] en notas;
 * si esa reposición ya se subió, se avisa (salvo force=true).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { recalcBankBalance } from "./daily-records";
import { validateAmount, validateMovementDate } from "@/lib/money-validation";

const txSql = neon(process.env.DATABASE_URL!);
const ATELIER_ID = 1;

export type CajaChicaImportItem = {
  category: string;
  concept: string;
  itemDate: string; // fecha original del gasto (referencia)
  amount: number;
};

/** Marca de una reposición ya importada (para avisar de re-subidas). */
function repTag(generado: string): string {
  return `[rep:${generado}]`;
}

/** ¿Esta reposición (por su fecha "Generado") ya fue importada? */
export async function getReposicionStatus(
  generado: string | null,
): Promise<{ alreadyImported: boolean; count: number }> {
  if (!generado) return { alreadyImported: false, count: 0 };
  const bId = await activeBusinessId();
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM expenses
    WHERE business_id = ${bId} AND archived = false AND notes LIKE ${"%" + repTag(generado) + "%"}
  `)).rows as { n: number }[];
  const count = rows[0]?.n ?? 0;
  return { alreadyImported: count > 0, count };
}

export async function importCajaChica(data: {
  items: CajaChicaImportItem[];
  reposicionDate: string;
  generado: string | null;
  force?: boolean;
}): Promise<
  | { ok: true; inserted: number; total: number }
  | { ok: false; error: string; alreadyImported?: boolean; alreadyCount?: number }
> {
  const bId = await activeBusinessId();
  if (bId !== ATELIER_ID) {
    return { ok: false, error: "La reposición de caja chica solo aplica a Atelier" };
  }

  // Validaciones de cabecera
  const dateErr = validateMovementDate(data.reposicionDate);
  if (dateErr) return { ok: false, error: `Fecha de reposición: ${dateErr}` };
  if (!Array.isArray(data.items) || data.items.length === 0) {
    return { ok: false, error: "No hay gastos para registrar." };
  }

  // Categorías válidas (activas, no especiales) de Atelier
  const catRows = (await db.execute(sql`
    SELECT name FROM expense_categories
    WHERE business_id = ${bId} AND is_active = true AND is_special_loan = false
  `)).rows as { name: string }[];
  const validCats = new Set(catRows.map((c) => c.name));

  // Validación por ítem (todo o nada: si algo está mal, no inserta nada)
  const unknownCats = new Set<string>();
  for (const it of data.items) {
    const amtErr = validateAmount(it.amount);
    if (amtErr) return { ok: false, error: `"${it.concept}": ${amtErr}` };
    if (!it.concept?.trim()) return { ok: false, error: "Hay un gasto sin descripción." };
    if (!validCats.has(it.category)) unknownCats.add(it.category);
  }
  if (unknownCats.size > 0) {
    return {
      ok: false,
      error: `Estas categorías del Excel no existen en tu sistema: ${[...unknownCats].join(", ")}. Créalas en Configuración o corrige el Excel.`,
    };
  }

  // Anti-duplicados
  if (data.generado && !data.force) {
    const status = await getReposicionStatus(data.generado);
    if (status.alreadyImported) {
      return {
        ok: false,
        error: `Esta reposición (generada el ${data.generado}) ya fue subida antes (${status.count} gastos). Si quieres subirla de nuevo, confírmalo.`,
        alreadyImported: true,
        alreadyCount: status.count,
      };
    }
  }

  // Inserción ATÓMICA (todos los gastos + asegurar daily_record)
  const tag = data.generado ? ` ${repTag(data.generado)}` : "";
  const queries = [
    txSql`INSERT INTO daily_records (business_id, date) VALUES (${bId}, ${data.reposicionDate}) ON CONFLICT (business_id, date) DO NOTHING`,
    ...data.items.map((it) => {
      const note = `Reposición caja chica${it.itemDate ? ` · gasto del ${it.itemDate}` : ""}${tag}`;
      return txSql`
        INSERT INTO expenses (business_id, date, category, concept, amount, payment_method, notes)
        VALUES (${bId}, ${data.reposicionDate}, ${it.category}, ${it.concept.trim()}, ${it.amount.toFixed(2)}, 'transferencia', ${note})
      `;
    }),
  ];

  try {
    await txSql.transaction(queries);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al registrar los gastos" };
  }

  await recalcBankBalance(data.reposicionDate);
  revalidatePath("/", "layout");

  const total = Math.round(data.items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
  return { ok: true, inserted: data.items.length, total };
}
