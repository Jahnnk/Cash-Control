/**
 * Lectura del Excel maestro de pricing → lista de costos de Atelier.
 * Qué se lee de cada hoja: ver lib/costos-preparaciones.ts.
 *
 * Columnas por encabezado, nunca por posición fija (AGENTS.md › Parsers de
 * Excel): el rango de una hoja puede empezar en A o en B.
 */

import * as XLSX from "xlsx";
import type { CostoPreparacion, LecturaPricing, UnidadBase } from "@/lib/costos-preparaciones";

const HOJA_PRICING = "PRICING";
const HOJA_SUBRECETAS = "ATE · Sub-Recetas";
const HOJA_INSUMOS = "ATE · Insumos";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Quita las notas entre corchetes: "Buttercream [USO INTERNO — …]" → "Buttercream". */
const limpiarNombre = (s: string) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();

/** "Crema Pastelera (kg)", "Granola Yayi's Kg" → mismo nombre que su sub-receta. */
const nombreSinKg = (s: string) => norm(s).replace(/\(kg\)$/, "").replace(/ kg$/, "").trim();

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

type Fila = unknown[];

function filas(wb: XLSX.WorkBook, hoja: string): Fila[] | null {
  const ws = wb.Sheets[hoja];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as Fila[];
}

function unidadDePricing(u: unknown): UnidadBase {
  const t = typeof u === "string" ? norm(u) : "";
  if (t === "kg") return "kg";
  if (t === "l" || t === "lt" || t === "litro") return "l";
  return "und"; // unidad, pack x5, bolsa…
}

function leerPricing(rows: Fila[], avisos: string[]): CostoPreparacion[] {
  const h = rows.findIndex((r) => r.some((c) => c === "Producto maestro"));
  if (h === -1) { avisos.push(`No encontré la columna "Producto maestro" en la hoja ${HOJA_PRICING}.`); return []; }
  const cab = rows[h].map((c) => (typeof c === "string" ? c.trim() : ""));
  const col = (nombre: string) => cab.findIndex((c) => c === nombre);
  const cId = col("ID"), cCat = col("Categoría"), cNom = col("Producto maestro"), cOri = col("Origen");
  const cUni = col("Unidad"), cCosto = col("Costo insumos Atelier"), cVig = col("Vigente");
  console.log(`[costos-preparaciones] ${HOJA_PRICING}: header=${h} id=${cId} producto=${cNom} origen=${cOri} unidad=${cUni} costo=${cCosto} vigente=${cVig}`);
  if ([cId, cNom, cOri, cUni, cCosto].some((c) => c === -1)) {
    avisos.push(`La hoja ${HOJA_PRICING} no tiene las columnas esperadas (ID, Producto maestro, Origen, Unidad, Costo insumos Atelier).`);
    return [];
  }
  const out: CostoPreparacion[] = [];
  for (const r of rows.slice(h + 1)) {
    if (r[cOri] !== "Atelier" || typeof r[cNom] !== "string") continue;
    if (cVig !== -1 && typeof r[cVig] === "string" && norm(r[cVig] as string) !== "si") continue;
    const nombre = limpiarNombre(r[cNom] as string);
    const costo = num(r[cCosto]);
    if (!costo || costo <= 0) { avisos.push(`${nombre}: sin costo de insumos en PRICING.`); continue; }
    out.push({
      ref: String(r[cId]).trim(),
      tipo: "producto",
      nombre,
      categoria: typeof r[cCat] === "string" ? (r[cCat] as string).trim() : null,
      unidad: unidadDePricing(r[cUni]),
      costo,
    });
  }
  return out;
}

/**
 * Cada bloque "▼ Nombre" de Sub-Recetas con su fila "Costo por 1 KG". La
 * etiqueta se busca en cualquier columna (el rango de la hoja puede empezar
 * en A o en B) y el costo es el primer número a su derecha.
 */
function leerSubRecetas(rows: Fila[], avisos: string[]): CostoPreparacion[] {
  const out: CostoPreparacion[] = [];
  let actual: { nombre: string; archivado: boolean; kg: number | null } | null = null;
  const cerrar = () => {
    if (!actual || actual.archivado) return;
    if (actual.kg && actual.kg > 0) {
      out.push({ ref: `SUB:${norm(actual.nombre)}`, tipo: "preparacion", nombre: actual.nombre, categoria: "Sub-recetas", unidad: "kg", costo: actual.kg });
    } else {
      avisos.push(`${actual.nombre}: la sub-receta no tiene "Costo por 1 KG".`);
    }
  };
  for (const r of rows) {
    const i = r.findIndex((c) => typeof c === "string" && (c.trim().startsWith("▼") || /costo por 1 kg/i.test(c)));
    if (i === -1) continue;
    const t = (r[i] as string).trim();
    if (t.startsWith("▼")) {
      cerrar();
      const crudo = t.slice(1).trim();
      const archivado = r.some((c) => typeof c === "string" && /ARCHIVADO/i.test(c));
      actual = { nombre: limpiarNombre(crudo), archivado, kg: null };
    } else if (actual) {
      actual.kg = r.slice(i + 1).map(num).find((v) => v !== null) ?? null;
    }
  }
  cerrar();
  return out;
}

function leerInsumos(rows: Fila[], avisos: string[]): CostoPreparacion[] {
  const h = rows.findIndex((r) => r.some((c) => typeof c === "string" && /^\s*sku\s*$/i.test(c)));
  if (h === -1) { avisos.push(`No encontré la columna "SKU" en la hoja ${HOJA_INSUMOS}.`); return []; }
  const cab = rows[h].map((c) => (typeof c === "string" ? norm(c) : ""));
  const cSku = cab.findIndex((c) => c === "sku");
  const cNom = cab.findIndex((c) => c.startsWith("nombre"));
  const cUni = cab.findIndex((c) => c.startsWith("unidad de compra"));
  const cPeso = cab.findIndex((c) => c.startsWith("costo por peso"));
  console.log(`[costos-preparaciones] ${HOJA_INSUMOS}: header=${h} sku=${cSku} nombre=${cNom} unidad=${cUni} costo=${cPeso}`);
  if ([cNom, cUni, cPeso].some((c) => c === -1)) {
    avisos.push(`La hoja ${HOJA_INSUMOS} no tiene las columnas esperadas (Nombre, Unidad de Compra, Costo por Peso).`);
    return [];
  }
  const out: CostoPreparacion[] = [];
  let categoria: string | null = null;
  for (const r of rows.slice(h + 1)) {
    const sku = typeof r[cSku] === "string" ? (r[cSku] as string).trim() : "";
    if (!/^[A-Z]{2}\d{3}$/.test(sku)) {
      // Encabezado de sección: "🫒 Aceites y Grasas".
      if (sku && !r[cNom]) categoria = sku.replace(/^[^\p{L}]+/u, "").trim() || categoria;
      continue;
    }
    // SR/PN son cosas que produce Atelier listadas como insumo (a veces con su
    // precio de venta a las cafeterías, no su costo): ya vienen de PRICING y
    // de Sub-Recetas.
    if (/^(SR|PN)/.test(sku)) continue;
    const nombre = typeof r[cNom] === "string" ? limpiarNombre(r[cNom] as string) : "";
    const porPeso = num(r[cPeso]);
    const unidadCompra = typeof r[cUni] === "string" ? (r[cUni] as string).trim().toLowerCase() : "";
    if (!nombre || !porPeso || porPeso <= 0) continue;
    let unidad: UnidadBase = "und";
    let costo = porPeso;
    if (unidadCompra === "g") { unidad = "kg"; costo = porPeso * 1000; }
    else if (unidadCompra === "ml" || unidadCompra === "cm3") { unidad = "l"; costo = porPeso * 1000; }
    else if (unidadCompra === "l") { unidad = "l"; }
    out.push({ ref: sku, tipo: "insumo", nombre, categoria, unidad, costo });
  }
  return out;
}

/** Lee el Excel maestro de pricing y arma la lista de costos de Atelier. */
export function leerPricingAtelier(data: Uint8Array): LecturaPricing {
  const wb = XLSX.read(data, { type: "array" });
  const avisos: string[] = [];
  const pricing = filas(wb, HOJA_PRICING);
  const sub = filas(wb, HOJA_SUBRECETAS);
  const ins = filas(wb, HOJA_INSUMOS);
  if (!pricing) avisos.push(`El archivo no tiene la hoja "${HOJA_PRICING}".`);
  if (!sub) avisos.push(`El archivo no tiene la hoja "${HOJA_SUBRECETAS}".`);
  if (!ins) avisos.push(`El archivo no tiene la hoja "${HOJA_INSUMOS}".`);

  const productos = pricing ? leerPricing(pricing, avisos) : [];
  const preparaciones = sub ? leerSubRecetas(sub, avisos) : [];
  const insumos = ins ? leerInsumos(ins, avisos) : [];

  // Una preparación que PRICING ya trae por kg ("Crema Pastelera (kg)") es la
  // misma fórmula: queda la de PRICING, que es la tabla curada.
  const yaPorKg = new Set(productos.filter((p) => p.unidad === "kg").map((p) => nombreSinKg(p.nombre)));
  const items = [...productos, ...preparaciones.filter((s) => !yaPorKg.has(nombreSinKg(s.nombre))), ...insumos];

  // Refs únicas (un SKU repetido en el Excel se queda con la primera fila).
  const vistos = new Set<string>();
  const unicos = items.filter((i) => (vistos.has(i.ref) ? false : (vistos.add(i.ref), true)));
  return { items: unicos, avisos };
}

