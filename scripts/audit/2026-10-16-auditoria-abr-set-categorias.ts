/**
 * Auditoría abr–set 2026 (16-oct, OK de Jahnn: «ajusta lo que tengas que ajustar»). Solo lo claro; lo que
 * depende de su criterio (equipos chicos, pintura, luz trifásica) queda en Por definir.
 *  1. Categorías que ya no existen → su par de la lista única.
 *  2. Fonavi 09-set «MNTO REFRIGERADORA» S/100 → DEVOLUCIONES (Atelier se lo devolvió y registró el gasto real).
 *  3. Centro 14-jul «DEVOLUCION A CLIENTE POR EMPANADAS EN MAL ESTADO» S/51 → DEVOLUCIONES A CLIENTES.
 *  4. Fonavi 23-jun «REEMBOLSO POR INSTALACIÓN DE CAJAS ELÉCTRICAS» S/861.65 → REMODELACIÓN (instalación nueva = inversión).
 *  5. Marca como decididas (tipo_pe) las reclasificadas hoy: Indecopi, Josué, papel de impresora.
 * Respaldo local. Uso: [--apply]
 */
import { readFileSync, writeFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
const sql = neon(readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)![1].trim());
const RENOMBRAR: [string, string, string][] = [
  ["ASESORÍAS Y SERVICIOS PROFESIONALES", "CONTABILIDAD Y ASESORÍAS", "Fijo"],
  ["SOFTWARE Y SUSCRIPCIONES", "OFICINA Y SISTEMAS", "Fijo"],
  ["UNIFORMES / INDUMENTARIA", "PERSONAL", "Fijo"],
  ["FLETES - EQUIPOS", "EQUIPOS", "Excluido"],
  ["EQUIPAMIENTO / MOBILIARIO", "EQUIPOS", "Excluido"],
];
(async () => {
  const filas = (await sql`SELECT * FROM expenses WHERE archived=false AND (
      category = ANY(${RENOMBRAR.map((r) => r[0])}::text[])
      OR (business_id=2 AND date='2026-09-09' AND amount=100 AND concept ILIKE 'MNTO REFRIGERADORA%')
      OR (business_id=3 AND date='2026-07-14' AND amount=51 AND concept ILIKE '%EMAPNADAS EN MAL ESTADO%')
      OR (business_id=2 AND date='2026-06-23' AND amount=861.65 AND concept ILIKE '%CAJAS ELECTRICAS%')
      OR (business_id=3 AND date='2026-09-23' AND amount=120 AND concept ILIKE '%INDECOPI%')
      OR (business_id=2 AND date='2026-09-30' AND amount=31.2 AND concept ILIKE '%JOSUE MANTILLA%')
      OR (business_id=3 AND date='2026-09-22' AND amount=81 AND concept ILIKE 'PAPEL PARA IMPRESORA%'))`) as any[];
  if (filas.length !== 14) throw new Error(`Se esperaban 14 filas y hay ${filas.length}.`);
  writeFileSync("scripts/audit/respaldos/auditoria-abr-set-categorias_2026-10-16.json", JSON.stringify(filas, null, 2));
  console.log("Respaldo de", filas.length, "filas");
  if (!process.argv.includes("--apply")) return console.log("(simulación)");
  const res: unknown[] = [];
  for (const [de, a, tipo] of RENOMBRAR) res.push(...await sql`UPDATE expenses SET category=${a}, tipo_pe=${tipo} WHERE archived=false AND category=${de} RETURNING business_id, amount, category`);
  res.push(...await sql`UPDATE expenses SET category='DEVOLUCIONES', tipo_pe='Excluido' WHERE archived=false AND business_id=2 AND date='2026-09-09' AND amount=100 AND concept ILIKE 'MNTO REFRIGERADORA%' RETURNING business_id, amount, category`);
  res.push(...await sql`UPDATE expenses SET category='DEVOLUCIONES A CLIENTES', tipo_pe='Variable' WHERE archived=false AND business_id=3 AND date='2026-07-14' AND amount=51 AND concept ILIKE '%EMAPNADAS EN MAL ESTADO%' RETURNING business_id, amount, category`);
  res.push(...await sql`UPDATE expenses SET category='REMODELACIÓN', tipo_pe='Excluido' WHERE archived=false AND business_id=2 AND date='2026-06-23' AND amount=861.65 AND concept ILIKE '%CAJAS ELECTRICAS%' RETURNING business_id, amount, category`);
  res.push(...await sql`UPDATE expenses SET tipo_pe='Variable' WHERE archived=false AND ((business_id=3 AND date='2026-09-23' AND amount=120 AND concept ILIKE '%INDECOPI%') OR (business_id=2 AND date='2026-09-30' AND amount=31.2 AND concept ILIKE '%JOSUE MANTILLA%')) RETURNING business_id, amount, category`);
  res.push(...await sql`UPDATE expenses SET tipo_pe='Fijo' WHERE archived=false AND business_id=3 AND date='2026-09-22' AND amount=81 AND concept ILIKE 'PAPEL PARA IMPRESORA%' RETURNING business_id, amount, category`);
  console.log("Actualizadas", res.length, JSON.stringify(res));
})();
