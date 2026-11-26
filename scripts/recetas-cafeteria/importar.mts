/**
 * Importa las recetas de las cafeterías del Excel de pricing (hojas «CAF · …») a recetas_sistema
 * (business_id CAFETERIAS). Una sola vez (26-nov-2026). Uso:
 *   npx tsx --env-file=.env.local scripts/recetas-cafeteria/importar.mts <excel.xlsx>           (solo mirar)
 *   npx tsx --env-file=.env.local scripts/recetas-cafeteria/importar.mts <excel.xlsx> --apply   (guarda)
 * No borra nada; si ya hay recetas de cafetería, se detiene.
 */
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { filas, primeraFila, leerBloques, HOJAS_CAFETERIA, preciosDeInsumos } from "@/lib/costos-preparaciones-excel";
import { leerCarta } from "@/lib/carta-sql";
import { leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { CAFETERIAS, REF_FIJO, catalogoBaseCafeteria, conIdsReales, planImportacion, type PlanReceta } from "@/lib/recetas-cafeteria";
import { skuInsumoNuevo } from "@/lib/precios-sugeridos";
import { ARCHIVO_SISTEMA } from "@/lib/productos/precios-vigentes";
import { catalogoEfectivo, costoDeReceta, erroresDeReceta, type RecetaSistema } from "@/lib/recetas";

const PAN_ATELIER: Record<string, string> = {
  PN002: "AT-059", PN003: "AT-059", PN025: "AT-059",
  PN004: "AT-076", PN005: "AT-076", PN006: "AT-076",
  PN007: "AT-065", PN008: "AT-065", PN009: "AT-065",
  PN010: "AT-063", PN011: "AT-063", PN012: "AT-063", PN027: "AT-063",
  PN014: "AT-071", PN015: "AT-071", PN016: "AT-148", PN017: "AT-148",
  PN018: "AT-073", PN019: "AT-072", PN020: "AT-067", PN021: "AT-067", PN022: "AT-067", PN026: "AT-067", PN024: "AT-069",
};

const [archivo] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APLICAR = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL!);
const wb = XLSX.read(readFileSync(archivo));
const ins = filas(wb, "CAF · Insumos")!;
const { srNombre } = preciosDeInsumos(ins, "Cafetería");
const h = ins.findIndex((r) => r.some((c) => typeof c === "string" && /^\s*sku\s*$/i.test(c)));
const cab = ins[h].map((c) => (typeof c === "string" ? c.trim().toLowerCase() : ""));
const cS = cab.indexOf("sku"), cN = cab.findIndex((c) => c.startsWith("nombre")), cP = cab.findIndex((c) => c.startsWith("costo por peso"));
const panes = ins.slice(h + 1).filter((r) => /^PN\d{3}$/.test(String(r[cS] ?? "").trim()))
  .map((r) => ({ sku: String(r[cS]).trim(), nombre: String(r[cN]), precio: Number(r[cP]) > 0 ? Number(r[cP]) : null }));
const bloques = (hoja: string) => leerBloques(filas(wb, hoja)!, hoja, primeraFila(wb, hoja));

const [carta, { vigentes }] = await Promise.all([leerCarta(sql), leerPreciosVigentes(sql)]);
const insumosCaf = vigentes.filter((v) => v.origen === "Cafetería");
const atelier = carta.filter((c) => c.ref.startsWith("AT-") && c.costo > 0).map((c) => ({ ref: c.ref, nombre: c.nombre, interno: c.costo }));
const base = catalogoBaseCafeteria(insumosCaf, atelier);

const { recetas: plan, fijos } = planImportacion({
  subrecetas: bloques("CAF · Sub-Recetas"),
  productos: HOJAS_CAFETERIA.filter((x) => x !== "CAF · Sub-Recetas").flatMap(bloques),
  srNombre, panes, panAtelier: PAN_ATELIER,
  atelierInterno: new Map(atelier.map((a) => [a.ref, a.interno])),
  insumos: new Map(insumosCaf.map((i) => [i.sku.toUpperCase(), { unidad: i.unidad, precio: i.precio }])),
  carta: carta.filter((c) => !c.ref.startsWith("AT-")).map((c) => ({ ref: c.ref, nombre: c.nombre, nombreCarta: c.nombreCarta ?? null })),
  atelier,
});
base.push(...fijos.map((f) => ({ ref: REF_FIJO(f.clave), tipo: "insumo" as const, nombre: f.nombre, categoria: "Precio fijo del Excel", unidad: f.unidad, costo: f.precio })));
console.log("Con precio fijo del Excel:", fijos.map((f) => `${f.nombre} S/${f.precio}/${f.unidad}`).join(" · "));

const comoRecetas = (ps: PlanReceta[]): RecetaSistema[] => ps.map((x) => ({ id: x.id, nombre: x.nombre, tipo: x.tipo, categoria: x.categoria, detalle: x.detalle, reemplaza: null }));
// Sub-recetas que el Excel costea por el peso FINAL (rinden menos de lo que pesa la mezcla): kg que salen.
for (let vuelta = 0; vuelta < 3; vuelta++) {
  const ef = catalogoEfectivo(base, comoRecetas(plan));
  for (const x of plan.filter((y) => y.tipo === "preparacion" && y.costoExcel)) {
    const c = costoDeReceta("preparacion", x.detalle, (ref) => ef.find((i) => i.ref === ref) ?? null);
    if (c.costo !== null && c.faltantes.length === 0 && Math.abs(c.costo - x.costoExcel!) / x.costoExcel! > 0.01) {
      x.detalle = { ...x.detalle, rendimiento: Math.round((c.total / x.costoExcel!) * 1e6) / 1e6, merma: 0 };
    }
  }
}
const ef = catalogoEfectivo(base, comoRecetas(plan));
let cuadran = 0, conCosto = 0;
const filasInf: string[] = [];
for (const x of plan) {
  const i = ef.find((y) => y.ref === `REC:${x.id}`);
  const dif = i && x.costoExcel ? (i.costo - x.costoExcel) / x.costoExcel : null;
  if (i) conCosto++;
  if (dif !== null && Math.abs(dif) <= 0.03) cuadran++;
  else filasInf.push(`  ${x.categoria.padEnd(16)} ${x.nombre.padEnd(46)} ${i ? "S/ " + i.costo.toFixed(2) : "SIN COSTO"} vs Excel ${x.costoExcel?.toFixed(2)} ${x.avisos.join(" ")}`);
}
const enCarta = plan.filter((x) => x.reemplaza).length;
console.log(`Recetas: ${plan.length} (${plan.filter((x) => x.categoria === "Sub-recetas").length} sub-recetas) · con costo: ${conCosto} · cuadran ±3%: ${cuadran} · enlazadas a la carta: ${enCarta}`);
console.log("Revisar:\n" + filasInf.join("\n"));

if (APLICAR) {
  if (((await sql`SELECT count(*)::int n FROM recetas_sistema WHERE business_id = ${CAFETERIAS}`) as { n: number }[])[0].n > 0) throw new Error("Ya hay recetas de cafetería: no importo encima.");
  for (const x of plan) { const e = erroresDeReceta({ nombre: x.nombre, tipo: x.tipo, detalle: { ...x.detalle, ingredientes: x.detalle.ingredientes.filter((i) => i.ref) } }); if (e.length) console.log("aviso", x.nombre, e); }
  // Las preparaciones con precio fijo del Excel entran como insumos de cafetería nuevos (SIS-C…).
  const usados = ((await sql`SELECT DISTINCT sku FROM insumos_precios WHERE origen = 'Cafetería'`) as { sku: string }[]).map((u) => u.sku);
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const skuDe = new Map<string, string>();
  for (const f of fijos) {
    const sku = skuInsumoNuevo("Cafetería", usados);
    usados.push(sku);
    skuDe.set(REF_FIJO(f.clave), sku);
    await sql`INSERT INTO insumos_precios (fecha, origen, sku, nombre, unidad, precio, archivo, fuente)
      VALUES (${fecha}::date, 'Cafetería', ${sku}, ${f.nombre}, ${f.unidad}, ${f.precio}, ${ARCHIVO_SISTEMA}, 'sistema')`;
  }
  for (const x of plan) x.detalle = { ...x.detalle, ingredientes: x.detalle.ingredientes.map((i) => (i.ref && skuDe.has(i.ref) ? { ...i, ref: skuDe.get(i.ref)! } : i)) };
  console.log("insumos creados", skuDe.size);
  const reales = new Map<number, number>();
  for (const x of plan) {
    const [{ id }] = (await sql`INSERT INTO recetas_sistema (business_id, nombre, tipo, categoria, detalle, reemplaza_ref, actualizado_por)
      VALUES (${CAFETERIAS}, ${x.nombre}, ${x.tipo}, ${x.categoria}, ${JSON.stringify(x.detalle)}::jsonb, ${x.reemplaza}, 'jahnn') RETURNING id`) as { id: number }[];
    reales.set(x.id, id);
  }
  for (const x of plan) await sql`UPDATE recetas_sistema SET detalle = ${JSON.stringify(conIdsReales(x.detalle, reales))}::jsonb WHERE id = ${reales.get(x.id)!}`;
  console.log("guardadas", reales.size);
}
if (process.argv.includes("--debug")) for (const n of ["Piña Confitada", "Desayuno Yayi’s", "Triple Yayi’s"]) {
  const x = plan.find((y) => y.nombre === n)!;
  const c = costoDeReceta(x.tipo, x.detalle, (ref) => ef.find((i) => i.ref === ref) ?? null);
  console.log(n, x.detalle.rendimiento, x.detalle.merma, c.lineas.map((l) => `${l.ingrediente.ref} ${l.ingrediente.nombre} ${l.ingrediente.cantidad}${l.ingrediente.unidad} → ${l.costo?.toFixed(3)} [${ef.find((i) => i.ref === l.ingrediente.ref)?.unidad}]`).join(" | "));
}
