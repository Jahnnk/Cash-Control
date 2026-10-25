/**
 * Atelier abr–jul 2026 · grupo C de la revisión de reglas (25-oct-2026, respuestas de Jahnn).
 *
 *   1. «Son gastos de Atelier mal anotados»: estaban en DEVOLUCIONES (no es gasto) → su categoría real (lo que se
 *      compró). OJO (visto al aplicar): los 8 son gastos que Atelier pagó POR Fonavi con la regla «Por devolver a
 *      Atelier» (100% de Fonavi) y Fonavi devolvió cada uno (fonavi_receivables cobradas). El reparto no se toca:
 *      siguen contando para Fonavi y el costo de Atelier no cambia; solo se ve qué se compró.
 *   2. «Conexión Luz – Diego» S/200: «fue una instalación» → REMODELACIÓN (instalación nueva = inversión).
 *   3. «02 harinas panaderas + 02 papel bond» S/275.40 → se parte en dos: harinas INSUMOS (2 × S/126.90 = S/253.80,
 *      el precio de la compra del 06/05 «02 harinas panaderas (126.90 cu)») y papel bond OFICINA Y SISTEMAS (S/21.60).
 *
 * Cada fila queda como decidida por Jahnn (tipo_pe), así no vuelve a Por definir. Son registros a mano (no vienen
 * del Excel): ninguna importación los pisa. Respaldo local antes de tocar.
 * Uso: npx tsx scripts/audit/2026-10-25-atelier-grupo-c.ts [--apply]
 */
import { config } from "dotenv"; config({ path: ".env.local", quiet: true });
import { writeFileSync, mkdirSync } from "fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// id → [categoría actual esperada, categoría nueva, tipo para el punto de equilibrio]
const CAMBIOS: Record<string, [string, string, "Fijo" | "Variable" | "Excluido"]> = {
  "9e134e25-3132-47f6-9f5d-634ee1dfde79": ["DEVOLUCIONES", "INSUMOS", "Variable"],            // Compras Metro F753-167564 (05/05)
  "d4d5c118-a6f6-4df6-8441-6809d17f057c": ["DEVOLUCIONES", "INSUMOS", "Variable"],            // Compras metro (12/05)
  "8d181b2b-ff88-47b5-8d33-cdb37f178319": ["DEVOLUCIONES", "INSUMOS", "Variable"],            // Compras Metro (16/06)
  "f1f5618f-140e-4865-a9b5-344b28b05bcb": ["DEVOLUCIONES", "INSUMOS", "Variable"],            // Compras metro (28/07)
  "3fac29f2-2469-494f-9e92-fa37fd96467f": ["DEVOLUCIONES", "PACKAGING", "Variable"],          // Compras Akemy (29/06)
  "f4b6e0ea-7f19-4703-bfd3-ce77dd49a352": ["DEVOLUCIONES", "MARKETING", "Fijo"],              // Re diseño de carta física (21/05)
  "a1a997b8-3e2a-4924-a42c-b1a5d132ecc5": ["DEVOLUCIONES", "SERVICIOS", "Fijo"],              // Pago de celular tienda (25/06)
  // Un cargador de S/50 no es una inversión que dure años: gasto de oficina.
  "1540061c-50f1-4ee3-a4a4-14762660016a": ["DEVOLUCIONES", "OFICINA Y SISTEMAS", "Fijo"],     // Compra de cargador para tienda (25/06)
  "f3662f8e-f86a-4b6d-b390-27847ef424c9": ["SERVICIOS", "REMODELACIÓN", "Excluido"],          // Conexión Luz - Diego (17/04)
};
const FILA_MIXTA = "8639b903-b09b-481a-ac09-adff60d8c436"; // 02 harinas panaderas + 02 papel bond (29/04), S/275.40
const HARINAS = 253.8, PAPEL = 21.6, TOTAL = 275.4; // 253.80 + 21.60

(async () => {
  const ids = [...Object.keys(CAMBIOS), FILA_MIXTA];
  const filas = (await sql`SELECT * FROM expenses WHERE id = ANY(${ids}::uuid[]) AND archived = false`) as Record<string, unknown>[];
  if (filas.length !== ids.length) throw new Error(`Se esperaban ${ids.length} filas y hay ${filas.length}.`);
  for (const f of filas) {
    const c = CAMBIOS[f.id as string];
    if (c && f.category !== c[0]) throw new Error(`${f.concept}: está en ${f.category}, se esperaba ${c[0]}.`);
    console.log(`${String(f.date).slice(0, 10)} · S/${f.amount} · ${f.category} → ${c ? c[1] : `INSUMOS ${HARINAS} + OFICINA Y SISTEMAS ${PAPEL}`} · ${f.concept}`);
  }
  const mixta = filas.find((f) => f.id === FILA_MIXTA)!;
  if (Math.abs(Number(mixta.amount) - TOTAL) > 0.001 || Math.abs(HARINAS + PAPEL - TOTAL) > 0.001 || mixta.category !== "INSUMOS") throw new Error("La fila mixta cambió: revisar.");
  mkdirSync("scripts/audit/respaldos", { recursive: true });
  writeFileSync("scripts/audit/respaldos/atelier-grupo-c_2026-10-25.json", JSON.stringify(filas, null, 1));
  if (!process.argv.includes("--apply")) return console.log("(simulación: no se cambió nada)");

  const q = [
    ...Object.entries(CAMBIOS).map(([id, [de, a, tipo]]) =>
      sql`UPDATE expenses SET category = ${a}, tipo_pe = ${tipo} WHERE id = ${id}::uuid AND category = ${de} RETURNING id`),
    // La fila mixta queda con las harinas…
    sql`UPDATE expenses SET amount = ${HARINAS}, concept = '02 harinas panaderas (126.90 c/u) [separado del papel bond]', tipo_pe = 'Variable'
        WHERE id = ${FILA_MIXTA}::uuid AND amount = ${TOTAL} RETURNING id`,
    // …y el papel bond va en su propia fila, con el mismo día, sede y forma de pago.
    sql`INSERT INTO expenses (business_id, date, category, concept, amount, payment_method, notes, sort_order, tipo_pe, imported_from_excel)
        SELECT business_id, date, 'OFICINA Y SISTEMAS', '02 papel bond [separado de «02 harinas panaderas + 02 papel bond»]', ${PAPEL},
               payment_method, notes, sort_order, 'Fijo', imported_from_excel
        FROM expenses WHERE id = ${FILA_MIXTA}::uuid RETURNING id`,
  ];
  const res = await sql.transaction(q);
  console.log("Filas tocadas:", res.flat().length, "(9 reclasificadas + 1 partida + 1 nueva)");
})();
