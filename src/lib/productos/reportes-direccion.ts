/**
 * Los reportes de Byte que sube dirección · LECTURA (pura).
 *
 * Pedido de Jahnn (28-sep-2026): una fuente más para cruzar datos — la suya.
 * Cada semana baja de Byte, del 01 del mes a ayer, y sube a Grupo → Productos:
 *
 *   · "Ventas de SEPTIEMBRE 2026"                     → venta del día (manda sobre la sede)
 *   · "Platos con mayor rotacion del … al …"          → ventas por producto (ya existía)
 *   · "Platos con menor rotacion del … al …"          → productos que casi no se venden
 *
 * Los tres traen el título en la primera fila; así se reconocen sin que
 * Jahnn tenga que decir cuál es cuál.
 *
 * El día de hoy nunca se toma: si el reporte se bajó con el local abierto,
 * la última fila es un día a medias (el 28-sep traía 2 pedidos y S/12.50).
 */

export type TipoReporteByte = "ventas" | "mayor" | "menor";

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Qué reporte es, por el título de la primera fila (o por sus encabezados). */
export function tipoDeReporte(rows: unknown[][]): TipoReporteByte | null {
  const primeras = rows.slice(0, 4).flat().filter((c): c is string => typeof c === "string").map((c) => sinTildes(c).toUpperCase());
  if (primeras.some((c) => /MENOR ROTACION/.test(c))) return "menor";
  if (primeras.some((c) => /MAYOR ROTACION|RENTABILIDAD/.test(c))) return "mayor";
  if (primeras.some((c) => /^VENTAS DE /.test(c))) return "ventas";
  if (primeras.some((c) => /INMOVILIZADO|ULTIMA VENTA/.test(c))) return "menor";
  if (primeras.some((c) => /TOTAL VENDIDO/.test(c)) && primeras.some((c) => /PEDIDOS/.test(c))) return "ventas";
  if (primeras.some((c) => /^PLATO$/.test(c))) return "mayor";
  return null;
}

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** "Ventas de SEPTIEMBRE 2026" (o SETIEMBRE) → "2026-09". */
export function mesDelTituloVentas(titulo: string): string | null {
  const t = sinTildes(titulo).toUpperCase().replace("SETIEMBRE", "SEPTIEMBRE");
  const m = /VENTAS DE ([A-Z]+)\s+(\d{4})/.exec(t);
  if (!m) return null;
  const i = MESES.indexOf(m[1]);
  return i < 0 ? null : `${m[2]}-${String(i + 1).padStart(2, "0")}`;
}

/** Separa los días cerrados de los que todavía no terminan (hoy o después). */
export function soloDiasCerrados<T extends { date: string }>(dias: T[], hoy: string): { cerrados: T[]; descartados: T[] } {
  return { cerrados: dias.filter((d) => d.date < hoy), descartados: dias.filter((d) => d.date >= hoy) };
}

/* ─────────────────────────── Menor rotación ─────────────────────────── */

export type ProductoMenorRotacion = {
  producto: string;
  /** La categoría que le da Byte (columna "Tipo"). Viene con errores: solo referencia. */
  tipoByte: string | null;
  stock: number | null;
  vendido: number;
  /** YYYY-MM-DD; null si nunca se vendió o no se pudo leer. */
  ultimaVenta: string | null;
  nuncaVendido: boolean;
  precio: number | null;
};

export type MenorRotacionParse =
  | { ok: true; desde: string; hasta: string; productos: ProductoMenorRotacion[]; avisos: string[] }
  | { ok: false; error: string };

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** "14/08/2026 10:43" → "2026-08-14". */
function fechaByte(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v !== "string") return null;
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export function parseMenorRotacion(rows: unknown[][]): MenorRotacionParse {
  const titulo = rows.slice(0, 3).flat().find((c): c is string => typeof c === "string" && /rotaci/i.test(c)) ?? "";
  const rango = /(\d{4}-\d{2}-\d{2})\s+al\s+(\d{4}-\d{2}-\d{2})/i.exec(titulo);
  if (!rango) return { ok: false, error: "El título no trae el rango de fechas (del … al …)." };

  // Encabezados por nombre, nunca por posición.
  let h = -1;
  const col: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const fila = (rows[i] ?? []).map((c) => (typeof c === "string" ? sinTildes(c).toUpperCase().trim() : ""));
    const idx = (re: RegExp) => fila.findIndex((c) => re.test(c));
    if (idx(/^PRODUCTO$|^PLATO$/) >= 0 && idx(/^VENDIDO/) >= 0) {
      h = i;
      col.producto = idx(/^PRODUCTO$|^PLATO$/);
      col.tipo = idx(/^TIPO$/);
      col.stock = idx(/^STOCK/);
      col.vendido = idx(/^VENDIDO/);
      col.ultima = idx(/ULTIMA VENTA/);
      col.precio = idx(/^PRECIO/);
      break;
    }
  }
  if (h < 0) return { ok: false, error: "No encontré las columnas «Producto» y «Vendido». ¿Es «Platos con menor rotación» de Byte?" };

  const productos: ProductoMenorRotacion[] = [];
  const avisos: string[] = [];
  for (const fila of rows.slice(h + 1)) {
    const nombre = typeof fila?.[col.producto] === "string" ? String(fila[col.producto]).trim() : "";
    if (!nombre) continue;
    const ultimaTexto = col.ultima >= 0 ? fila[col.ultima] : null;
    const nunca = typeof ultimaTexto === "string" && /nunca/i.test(ultimaTexto);
    const ultima = nunca ? null : fechaByte(ultimaTexto);
    if (!nunca && ultimaTexto != null && ultima === null) avisos.push(`«${nombre}»: no entendí la fecha de última venta (${String(ultimaTexto)}).`);
    productos.push({
      producto: nombre,
      tipoByte: col.tipo >= 0 && typeof fila[col.tipo] === "string" ? String(fila[col.tipo]).trim() : null,
      stock: col.stock >= 0 ? num(fila[col.stock]) : null,
      vendido: num(fila[col.vendido]) ?? 0,
      ultimaVenta: ultima,
      nuncaVendido: nunca,
      precio: col.precio >= 0 ? num(fila[col.precio]) : null,
    });
  }
  if (productos.length === 0) return { ok: false, error: "El archivo no trae productos." };
  return { ok: true, desde: rango[1], hasta: rango[2], productos, avisos };
}

/* ─────────────────────────── Cómo se lee la lista ─────────────────────────── */

export type GrupoSinVenta = "nunca" | "dormido" | "poco";

/** Días sin venta desde los que un producto "se durmió". */
export const DIAS_DORMIDO = 30;

/**
 * En qué grupo cae un producto de la lista:
 *   · nunca   — Byte dice "Nunca vendido": está en el sistema y nadie lo pidió.
 *   · dormido — no se vendió en el rango y la última venta fue hace 30 días o más.
 *   · poco    — se vendió, pero muy poco (lo que Byte manda a esta lista).
 * null = no se vendió en el rango pero la última venta es reciente (sale a la otra semana).
 */
export function grupoSinVenta(p: ProductoMenorRotacion, hasta: string): GrupoSinVenta | null {
  if (p.nuncaVendido) return "nunca";
  if (p.vendido > 0) return "poco";
  if (!p.ultimaVenta) return "dormido";
  const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${p.ultimaVenta}T12:00:00Z`)) / 86_400_000);
  return dias >= DIAS_DORMIDO ? "dormido" : null;
}
