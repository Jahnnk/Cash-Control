/**
 * Lectura del Excel maestro de pricing → lista de costos de Atelier.
 * Qué se lee de cada hoja: ver lib/costos-preparaciones.ts.
 *
 * Columnas por encabezado, nunca por posición fija (AGENTS.md › Parsers de
 * Excel): el rango de una hoja puede empezar en A o en B.
 */

import * as XLSX from "xlsx";
import { claveNombre, type CostoPreparacion, type DetalleReceta, type Ingrediente, type LecturaPricing, type UnidadBase } from "@/lib/costos-preparaciones";
import { costoDeReceta } from "@/lib/recetas";

const HOJA_PRICING = "PRICING";
const HOJA_SUBRECETAS = "ATE · Sub-Recetas";
const HOJA_INSUMOS = "ATE · Insumos";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Quita las notas entre corchetes: "Buttercream [USO INTERNO — …]" → "Buttercream". */
const limpiarNombre = (s: string) => s.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();

/** "Crema Pastelera (kg)", "Granola Yayi's Kg" → mismo nombre que su sub-receta. */
const nombreSinKg = claveNombre;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

type Fila = unknown[];

/**
 * Filas de una hoja. Con blankrows y el inicio del rango, la posición en el
 * arreglo + primeraFila es el número de fila de Excel (lo usa "Fuente costo").
 */
function filas(wb: XLSX.WorkBook, hoja: string): Fila[] | null {
  const ws = wb.Sheets[hoja];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Fila[];
}

function primeraFila(wb: XLSX.WorkBook, hoja: string): number {
  const ref = wb.Sheets[hoja]?.["!ref"];
  return ref ? XLSX.utils.decode_range(ref).s.r + 1 : 1;
}

function unidadDePricing(u: unknown): UnidadBase {
  const t = typeof u === "string" ? norm(u) : "";
  if (t === "kg") return "kg";
  if (t === "l" || t === "lt" || t === "litro") return "l";
  return "und"; // unidad, pack x5, bolsa…
}

/** De qué celda sale el costo de cada producto de PRICING ("3. Pastelería!L334"). */
type Fuente = { hoja: string; fila: number; conversion: boolean };

/** Los libros anteriores numeraban las hojas; este las renombró sin mover filas. */
const HOJA_POR_NUMERO: Record<string, string> = {
  "1": HOJA_SUBRECETAS, "2": "ATE · Empanadas", "3": "ATE · Pastelería", "4": "ATE · Panadería", "5": "ATE · Cuchareables", "6": "ATE · Croissant",
};

function fuenteDe(texto: unknown): Fuente | null {
  if (typeof texto !== "string") return null;
  const m = texto.match(/(?:(\d)\.\s*[^!|]+|(ATE · [^!|]+))!\$?[A-Z]+\$?(\d+)/);
  if (!m) return null;
  const hoja = m[1] ? HOJA_POR_NUMERO[m[1]] : m[2].trim();
  // "costo/kg × 0.250 kg + 1 manga", "L678 × 2": el costo es una cuenta sobre
  // el bloque, no el bloque. Esa receta no se puede abrir tal cual.
  const conversion = /conversi|×|÷|costo\/kg/i.test(texto);
  return hoja ? { hoja, fila: Number(m[3]), conversion } : null;
}

function leerPricing(rows: Fila[], avisos: string[], fuentes: Map<string, Fuente>): CostoPreparacion[] {
  const h = rows.findIndex((r) => r.some((c) => c === "Producto maestro"));
  if (h === -1) { avisos.push(`No encontré la columna "Producto maestro" en la hoja ${HOJA_PRICING}.`); return []; }
  const cab = rows[h].map((c) => (typeof c === "string" ? c.trim() : ""));
  const col = (nombre: string) => cab.findIndex((c) => c === nombre);
  const cId = col("ID"), cCat = col("Categoría"), cNom = col("Producto maestro"), cOri = col("Origen");
  const cUni = col("Unidad"), cCosto = col("Costo insumos Atelier"), cVig = col("Vigente"), cFuente = col("Fuente costo");
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
    const f = cFuente === -1 ? null : fuenteDe(r[cFuente]);
    if (f) fuentes.set(String(r[cId]).trim(), f);
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

type Bloque = {
  hoja: string;
  /** Fila de Excel del "▼ Nombre". */
  fila: number;
  nombre: string;
  archivado: boolean;
  /** Fila "Costo por 1 KG" (solo sub-recetas). */
  kg: number | null;
  rendimiento: number | null;
  /** "% Merma de Preparación" del bloque (solo sub-recetas). */
  merma: number;
  /** Fila "TOTAL COSTO FINAL X PRODUCTO": costo por unidad (hojas de productos). */
  costoUnidad: number | null;
  ingredientes: { sku: string; nombre: string; unidad: string; cantidad: number }[];
};

/**
 * Los bloques "▼ Nombre" de una hoja de recetas, con sus ingredientes. Las
 * etiquetas se buscan en cualquier columna (el rango puede empezar en A o
 * en B) y las columnas de ingredientes salen del encabezado de cada bloque
 * ("SKU", "Ingrediente", "Und", "Q x Receta").
 */
function leerBloques(rows: Fila[], hoja: string, fila0: number): Bloque[] {
  const out: Bloque[] = [];
  let b: Bloque | null = null;
  let col: { sku: number; nom: number; und: number; q: number; precioG: number; unit: number } | null = null;
  for (const [n, r] of rows.entries()) {
    const i = r.findIndex((c) => typeof c === "string" && c.trim() !== "");
    if (i === -1) continue;
    const t = String(r[i]).trim();
    const etiqueta = r.find((c, k) => k >= i && typeof c === "string" && /^(▼|rendimiento por receta|% merma de prep|.*costo por 1 kg|total costo final)/i.test(c.trim())) as string | undefined;
    const numeroTras = (texto: string) => r.slice(r.indexOf(texto) + 1).map(num).find((v) => v !== null) ?? null;
    if (etiqueta?.trim().startsWith("▼")) {
      const crudo = etiqueta.trim().slice(1).trim();
      b = { hoja, fila: fila0 + n, nombre: limpiarNombre(crudo), archivado: r.some((c) => typeof c === "string" && /ARCHIVADO/i.test(c)), kg: null, rendimiento: null, merma: 0, costoUnidad: null, ingredientes: [] };
      out.push(b);
      col = null;
      continue;
    }
    if (!b) continue;
    if (etiqueta && /^rendimiento por receta/i.test(etiqueta.trim())) { b.rendimiento = numeroTras(etiqueta); continue; }
    if (etiqueta && /^% merma de prep/i.test(etiqueta.trim())) { b.merma = numeroTras(etiqueta) ?? 0; continue; }
    if (etiqueta && /costo por 1 kg/i.test(etiqueta)) { b.kg = numeroTras(etiqueta); continue; }
    if (etiqueta && /^total costo final/i.test(etiqueta.trim())) {
      // La columna "Costo Unitario" del bloque; si no se detectó, el último número.
      const v = col && col.unit !== -1 ? num(r[col.unit]) : null;
      b.costoUnidad = v ?? [...r].reverse().map(num).find((x) => x !== null) ?? null;
      continue;
    }
    if (/^sku$/i.test(t)) {
      const cab = r.map((c) => (typeof c === "string" ? norm(c) : ""));
      col = {
        sku: i,
        nom: cab.findIndex((c) => c === "ingrediente"),
        und: cab.findIndex((c) => c === "und"),
        q: cab.findIndex((c) => c.startsWith("q x receta")),
        precioG: cab.findIndex((c) => c.startsWith("precio unt")),
        unit: cab.findIndex((c) => c.startsWith("costo unitario")),
      };
      if (col.nom === -1 || col.und === -1 || col.q === -1) col = null;
      continue;
    }
    if (!col) continue;
    const sku = String(r[col.sku] ?? "").match(/[A-Z]{2}\d{3}/)?.[0];
    const cantidad = num(r[col.q]);
    if (!sku || typeof r[col.nom] !== "string" || !cantidad) continue;
    // En las hojas de productos, "Costo Unitario" ÷ "Precio Unt." es lo que
    // realmente lleva CADA unidad, con la merma del ingrediente incluida. Ahí
    // el Excel pone los empaques por unidad (1 bisagra por porción aunque "Q x
    // Receta" diga 1 para toda la torta). Por receta = eso × rendimiento.
    const precioG = col.precioG === -1 ? null : num(r[col.precioG]);
    const unit = col.unit === -1 ? null : num(r[col.unit]);
    const porUnidad = hoja !== HOJA_SUBRECETAS && b.rendimiento && precioG && unit !== null ? (unit / precioG) * b.rendimiento : null;
    const final = porUnidad !== null && porUnidad > 0 ? Math.round(porUnidad * 1000) / 1000 : cantidad;
    b.ingredientes.push({ sku, nombre: limpiarNombre(r[col.nom] as string), unidad: String(r[col.und] ?? "").trim().toLowerCase(), cantidad: final });
  }
  return out;
}

/** Cada sub-receta con su "Costo por 1 KG" (el costo) y su receta (el detalle). */
function leerSubRecetas(rows: Fila[], fila0: number, avisos: string[]): { items: CostoPreparacion[]; bloques: Bloque[] } {
  const items: CostoPreparacion[] = [];
  const bloques = leerBloques(rows, HOJA_SUBRECETAS, fila0).filter((b) => !b.archivado);
  for (const b of bloques) {
    if (b.kg && b.kg > 0) {
      items.push({ ref: `SUB:${norm(b.nombre)}`, tipo: "preparacion", nombre: b.nombre, categoria: "Sub-recetas", unidad: "kg", costo: b.kg });
    } else {
      avisos.push(`${b.nombre}: la sub-receta no tiene "Costo por 1 KG".`);
    }
  }
  return { items, bloques };
}

/**
 * Insumos crudos. Aparte devuelve las filas SR (sub-recetas listadas como
 * insumo): solo se usan si una receta las pide y no existen con otro nombre.
 */
function leerInsumos(rows: Fila[], avisos: string[]): { items: CostoPreparacion[]; sr: CostoPreparacion[] } {
  const h = rows.findIndex((r) => r.some((c) => typeof c === "string" && /^\s*sku\s*$/i.test(c)));
  if (h === -1) { avisos.push(`No encontré la columna "SKU" en la hoja ${HOJA_INSUMOS}.`); return { items: [], sr: [] }; }
  const cab = rows[h].map((c) => (typeof c === "string" ? norm(c) : ""));
  const cSku = cab.findIndex((c) => c === "sku");
  const cNom = cab.findIndex((c) => c.startsWith("nombre"));
  const cUni = cab.findIndex((c) => c.startsWith("unidad de compra"));
  const cPeso = cab.findIndex((c) => c.startsWith("costo por peso"));
  console.log(`[costos-preparaciones] ${HOJA_INSUMOS}: header=${h} sku=${cSku} nombre=${cNom} unidad=${cUni} costo=${cPeso}`);
  if ([cNom, cUni, cPeso].some((c) => c === -1)) {
    avisos.push(`La hoja ${HOJA_INSUMOS} no tiene las columnas esperadas (Nombre, Unidad de Compra, Costo por Peso).`);
    return { items: [], sr: [] };
  }
  const out: CostoPreparacion[] = [];
  const sr: CostoPreparacion[] = [];
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
    if (/^PN/.test(sku)) continue;
    const nombre = typeof r[cNom] === "string" ? limpiarNombre(r[cNom] as string) : "";
    const porPeso = num(r[cPeso]);
    const unidadCompra = typeof r[cUni] === "string" ? (r[cUni] as string).trim().toLowerCase() : "";
    if (!nombre || !porPeso || porPeso <= 0) continue;
    let unidad: UnidadBase = "und";
    let costo = porPeso;
    if (unidadCompra === "g") { unidad = "kg"; costo = porPeso * 1000; }
    else if (unidadCompra === "ml" || unidadCompra === "cm3") { unidad = "l"; costo = porPeso * 1000; }
    else if (unidadCompra === "l") { unidad = "l"; }
    if (/^SR/.test(sku)) {
      if (unidad === "kg" || unidad === "l") sr.push({ ref: sku, tipo: "preparacion", nombre, categoria: "Sub-recetas", unidad: "kg", costo });
      continue;
    }
    // Un SKU repetido para dos insumos distintos (pasa en el Excel: OT012 es
    // "Polvo de hornear" y "Agua en Bidón"): el segundo queda como "OT012·2"
    // para no perderlo, y se avisa para que se corrija en el Excel.
    const repetidos = out.filter((o) => o.ref === sku || o.ref.startsWith(`${sku}·`));
    if (repetidos.length > 0) avisos.push(`El SKU ${sku} está repetido en ${HOJA_INSUMOS}: "${repetidos[0].nombre}" y "${nombre}". Conviene darle un código propio a cada uno.`);
    out.push({ ref: repetidos.length > 0 ? `${sku}·${repetidos.length + 1}` : sku, tipo: "insumo", nombre, categoria, unidad, costo });
  }
  return { items: out, sr };
}

/** Lee el Excel maestro de pricing y arma la lista de costos de Atelier. */
/** Hojas con recetas de productos (los bloques "▼" que PRICING costea). */
const HOJAS_RECETAS = ["ATE · Empanadas", "ATE · Pastelería", "ATE · Panadería", "ATE · Cuchareables", "ATE · Croissant"];

export function leerPricingAtelier(data: Uint8Array): LecturaPricing {
  const wb = XLSX.read(data, { type: "array" });
  const avisos: string[] = [];
  const pricing = filas(wb, HOJA_PRICING);
  const sub = filas(wb, HOJA_SUBRECETAS);
  const ins = filas(wb, HOJA_INSUMOS);
  if (!pricing) avisos.push(`El archivo no tiene la hoja "${HOJA_PRICING}".`);
  if (!sub) avisos.push(`El archivo no tiene la hoja "${HOJA_SUBRECETAS}".`);
  if (!ins) avisos.push(`El archivo no tiene la hoja "${HOJA_INSUMOS}".`);

  const fuentes = new Map<string, Fuente>();
  const productos = pricing ? leerPricing(pricing, avisos, fuentes) : [];
  const subRecetas = sub ? leerSubRecetas(sub, primeraFila(wb, HOJA_SUBRECETAS), avisos) : { items: [], bloques: [] };
  const { items: insumos, sr } = ins ? leerInsumos(ins, avisos) : { items: [], sr: [] };

  // Una preparación que PRICING ya trae por kg ("Crema Pastelera (kg)") es la
  // misma fórmula: queda la de PRICING, que es la tabla curada.
  const yaPorKg = new Set(productos.filter((p) => p.unidad === "kg").map((p) => nombreSinKg(p.nombre)));
  const items = [...productos, ...subRecetas.items.filter((s) => !yaPorKg.has(nombreSinKg(s.nombre))), ...insumos];

  // Refs únicas (un SKU repetido en el Excel se queda con la primera fila).
  const vistos = new Set<string>();
  const unicos = items.filter((i) => (vistos.has(i.ref) ? false : (vistos.add(i.ref), true)));

  // La receta detrás de cada producto y preparación, para poder abrirla y
  // modificarla en el sistema. Primero por la celda de "Fuente costo" (dice
  // exactamente de qué bloque sale el costo); si no, por nombre, buscando
  // en Sub-Recetas lo que va por kg y en las hojas de productos lo que va por
  // unidad ("Pan al ajo" existe en las dos).
  const deProductos = HOJAS_RECETAS.flatMap((h) => { const f = filas(wb, h); return f ? leerBloques(f, h, primeraFila(wb, h)) : []; });
  const todos = [...subRecetas.bloques, ...deProductos].filter((b) => !b.archivado && b.ingredientes.length > 0);
  const porNombreEn = (lista: Bloque[]) => {
    const m = new Map<string, Bloque>();
    for (const b of lista) if (!m.has(nombreSinKg(b.nombre))) m.set(nombreSinKg(b.nombre), b);
    return m;
  };
  const nombreSub = porNombreEn(subRecetas.bloques.filter((b) => b.ingredientes.length > 0));
  const nombreProd = porNombreEn(deProductos.filter((b) => !b.archivado && b.ingredientes.length > 0));
  const porCelda = (f: Fuente) =>
    todos.filter((b) => b.hoja === f.hoja && b.fila <= f.fila).sort((x, y) => y.fila - x.fila)[0];
  const bloqueDe = (i: CostoPreparacion): Bloque | undefined => {
    const f = fuentes.get(i.ref);
    if (f?.conversion) return undefined;
    if (f) { const b = porCelda(f); if (b) return b; }
    const n = nombreSinKg(i.nombre);
    return i.unidad === "und" ? nombreProd.get(n) ?? nombreSub.get(n) : nombreSub.get(n) ?? nombreProd.get(n);
  };
  // SKU → sus insumos (más de uno cuando el Excel repite el código).
  const insumosPorSku = new Map<string, CostoPreparacion[]>();
  for (const i of insumos) {
    const sku = i.ref.split("·")[0];
    insumosPorSku.set(sku, [...(insumosPorSku.get(sku) ?? []), i]);
  }
  const porNombre = new Map<string, string>();
  for (const i of unicos) if (i.tipo !== "insumo" && !porNombre.has(nombreSinKg(i.nombre))) porNombre.set(nombreSinKg(i.nombre), i.ref);
  const srPorSku = new Map(sr.map((i) => [i.ref, i]));
  const extra: CostoPreparacion[] = [];
  const refDe = (g: Bloque["ingredientes"][number]): string | null => {
    const candidatos = insumosPorSku.get(g.sku);
    if (candidatos) return (candidatos.find((c) => norm(c.nombre) === norm(g.nombre)) ?? candidatos[0]).ref;
    const n = porNombre.get(nombreSinKg(g.nombre));
    if (n) return n;
    // Una sub-receta que solo existe en la lista de insumos (SR…): se suma.
    const s = srPorSku.get(g.sku);
    if (!s) return null;
    if (!extra.includes(s)) { extra.push(s); porNombre.set(nombreSinKg(s.nombre), s.ref); }
    return s.ref;
  };
  // Productos que tienen su receta en una hoja de producción pero todavía no
  // su fila en PRICING (Jahnn saca una receta nueva y primero la costea en el
  // Excel): entran igual, por unidad, con el "TOTAL COSTO FINAL X PRODUCTO".
  const usados = new Set(unicos.filter((i) => i.tipo !== "insumo").map(bloqueDe).filter(Boolean));
  const sinPricing: string[] = [];
  for (const b of deProductos) {
    if (b.archivado || usados.has(b) || b.ingredientes.length === 0 || !b.costoUnidad || b.costoUnidad <= 0) continue;
    const n = nombreSinKg(b.nombre);
    if (porNombre.has(n)) continue;
    const item: CostoPreparacion = {
      ref: `PROD:${n}`, tipo: "producto", nombre: b.nombre, categoria: b.hoja.replace(/^ATE · /, ""), unidad: "und", costo: b.costoUnidad,
    };
    unicos.push(item);
    porNombre.set(n, item.ref);
    sinPricing.push(b.nombre);
  }

  const buscar = (ref: string) => unicos.find((x) => x.ref === ref) ?? extra.find((x) => x.ref === ref) ?? null;
  for (const i of unicos) {
    if (i.tipo === "insumo") continue;
    const b = bloqueDe(i);
    if (!b) continue;
    const porKg = i.unidad !== "und";
    const detalle: DetalleReceta = {
      rendimiento: porKg ? null : b.rendimiento,
      merma: porKg ? b.merma : 0,
      ingredientes: b.ingredientes.map((g): Ingrediente => {
        const ref = refDe(g);
        return { ref: ref === i.ref ? null : ref, nombre: g.nombre, unidad: g.unidad === "cm3" ? "ml" : g.unidad, cantidad: g.cantidad };
      }),
    };
    // Carnes y otras preparaciones que el Excel costea por el peso FINAL (el
    // roast beef pierde peso al hornearse, la salmuera se bota): se guarda
    // cuántos kg salen, para que la receta abierta dé el mismo costo.
    if (porKg) {
      const c = costoDeReceta("preparacion", detalle, buscar);
      if (c.costo !== null && c.faltantes.length === 0 && Math.abs(c.costo - i.costo) / i.costo > 0.01) {
        detalle.rendimiento = Math.round((c.total / i.costo) * 1e6) / 1e6;
        detalle.merma = 0;
      }
    }
    i.detalle = detalle;
  }
  unicos.push(...extra.filter((e) => !unicos.some((u) => u.ref === e.ref)));
  return { items: unicos, avisos, sinPricing };
}
