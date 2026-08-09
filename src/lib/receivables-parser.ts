/**
 * Parsers de los dos reportes de Byte que alimentan cuentas por cobrar.
 *
 * 1) "Reporte de Ventas"          → toda la venta + el estado de cobro
 * 2) "Consolidado de Facturas"    → el RUC del cliente, el IGV y si la
 *                                    factura sigue viva o fue anulada
 *
 * Estructura verificada contra los exports reales del 01–09 ago-2026:
 *   Fila 1: título en celdas combinadas
 *   Fila 2: encabezados
 *   Fila 3+: un documento por fila
 *
 * Las columnas se detectan leyendo el encabezado, nunca por posición
 * fija (convención del repo — ver AGENTS.md).
 *
 * EL DATO ESCONDIDO: en el reporte de ventas, la columna "Medios" trae
 * el estado de cobranza dentro del texto:
 *     "CREDITOCuota 1: 728.55 - 2026-08-08 [PENDIENTE]"
 * De ahí salen el vencimiento y si está pagada. Byte ya sabe quién
 * pagó; nadie tiene que marcarlo a mano.
 */

import * as XLSX from "xlsx";
import { SEDE_RUCS } from "./client-sales-parser";

/** Respaldo por nombre: el reporte de ventas NO trae el RUC. */
const SEDE_NOMBRES: { patron: RegExp; sedeId: number }[] = [
  { patron: /SERVICIOS\s+GASTRONOMICOS\s+YAYIS/i, sedeId: 3 },   // Centro
  { patron: /EXPERIENCIAS\s+GASTRONOMICAS\s+YAYIS/i, sedeId: 2 }, // Fonavi
];

export type EstadoCuota = "PENDIENTE" | "PAGADA" | "SIN_CUOTA";
export type TipoReporte = "ventas" | "facturas";

/** Un documento tal como sale de cualquiera de los dos archivos. */
export type DocumentoParseado = {
  docKey: string;
  tipo: "FACTURA" | "BOLETA" | "TICKET";
  serie: string | null;
  fecha: string;
  cliente: string;
  documento: string | null;
  tipoDoc: string | null;
  esSede: boolean;
  sedeId: number | null;
  total: number;
  igv: number | null;
  gravado: number | null;
  credito: number;
  cobradoPos: number;
  estadoCuota: EstadoCuota;
  vencimiento: string | null;
  estadoFactura: "EMITIDO" | "ANULADO" | null;
};

export type ReceivablesParseResult = {
  tipoReporte: TipoReporte;
  docs: DocumentoParseado[];
  periodo: { inicio: string | null; fin: string | null };
  totales: {
    total: number;
    documentos: number;
    porTipo: { FACTURA: number; BOLETA: number; TICKET: number };
    pendiente: number;
    pagado: number;
    anulado: number;
  };
  errores: string[];
  warnings: string[];
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const clean = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Byte manda los montos como texto ("358.32", "S/ 1,620.75") o como número. */
function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = clean(v).replace(/S\/\.?/gi, "").replace(/\s/g, "").replace(/,/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Acepta "2026-08-04" (lo que manda Byte), Date y serial de Excel. */
function toDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(
      v.getUTCDate(),
    ).padStart(2, "0")}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const s = clean(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  return null;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s]+/g, " ")
    .trim();
}

/** Columna cuyo encabezado contiene TODAS las palabras dadas. */
function findCol(header: unknown[], ...palabras: string[]): number {
  for (let c = 0; c < header.length; c++) {
    const h = norm(clean(header[c]));
    if (h && palabras.every((p) => h.includes(p))) return c;
  }
  return -1;
}

/** Columna cuyo encabezado es EXACTAMENTE el texto dado (sin tildes ni puntos). */
function findColExacta(header: unknown[], texto: string): number {
  const t = norm(texto);
  for (let c = 0; c < header.length; c++) {
    if (norm(clean(header[c])) === t) return c;
  }
  return -1;
}

function buscarHeader(rows: unknown[][], test: (h: unknown[]) => boolean): number {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    if (test(rows[r] ?? [])) return r;
  }
  return -1;
}

/**
 * Llave estable del documento. Los dos archivos escriben la misma
 * factura distinto ("FB02-001242" vs SERIE "FB02" + NUMERO "00001242"),
 * así que se normaliza quitando los ceros a la izquierda.
 */
export function docKeyDe(serie: string | null, numero: string | null, tipo: string): string {
  const s = clean(serie);
  const n = clean(numero);
  if (s && n) return `${s.toUpperCase()}-${n.replace(/^0+/, "") || "0"}`;
  const m = s.match(/^([A-Za-z]+\d*)[-\s]*0*(\d+)$/);
  if (m) return `${m[1].toUpperCase()}-${m[2]}`;
  // Los tickets no tienen serie fiscal: Byte pone el correlativo de venta.
  return `${tipo.toUpperCase()}-${(s || n).toUpperCase()}`;
}

function detectarSede(documento: string | null, cliente: string): number | null {
  if (documento && SEDE_RUCS[documento]) return SEDE_RUCS[documento].sedeId;
  for (const s of SEDE_NOMBRES) if (s.patron.test(cliente)) return s.sedeId;
  return null;
}

/**
 * Lee el estado de cobranza escondido en la columna "Medios".
 *
 * Formatos vistos:
 *   "EFECTIVO"                                       → sin cuotas, cobrado al toque
 *   "CREDITO"                                        → sin cuotas (huérfano: nadie lo está cobrando)
 *   "CREDITOCuota 1: 358.32 - 2026-08-09 [PENDIENTE]"
 *   "...[PAGADA]Cuota 2: ... [PENDIENTE]"            → varias cuotas
 *
 * Con varias cuotas: basta una PENDIENTE para que el documento lo esté,
 * y el vencimiento es el de la cuota pendiente más antigua.
 */
export function leerMedios(medios: unknown): { estado: EstadoCuota; vencimiento: string | null } {
  const s = clean(medios);
  if (!s) return { estado: "SIN_CUOTA", vencimiento: null };

  const cuotas = [...s.matchAll(/cuota\s*\d+\s*:\s*[\d.,]+\s*-\s*(\d{4}-\d{2}-\d{2})\s*\[([A-Za-zÁÉÍÓÚáéíóú]+)\]/gi)];
  if (cuotas.length === 0) return { estado: "SIN_CUOTA", vencimiento: null };

  const pendientes = cuotas
    .filter((c) => !/^pagad/i.test(c[2]))
    .map((c) => c[1])
    .sort();

  return pendientes.length > 0
    ? { estado: "PENDIENTE", vencimiento: pendientes[0] }
    : { estado: "PAGADA", vencimiento: cuotas.map((c) => c[1]).sort().pop() ?? null };
}

/** "FACTURA Canjear" → "FACTURA". */
function normalizarTipo(v: unknown): "FACTURA" | "BOLETA" | "TICKET" {
  const t = norm(clean(v));
  if (t.includes("factura")) return "FACTURA";
  if (t.includes("boleta")) return "BOLETA";
  return "TICKET";
}

// ─────────────────────────────────────────────────────────────────
// Detectar de cuál de los dos archivos se trata
// ─────────────────────────────────────────────────────────────────

/**
 * Luis suelta los dos archivos juntos y el sistema decide cuál es cuál,
 * para que no tenga que acordarse de subirlos en un orden.
 */
export function detectarTipoReporte(rows: unknown[][]): TipoReporte | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const h = rows[r] ?? [];
    // El consolidado es el único con ESTADO + NUMERO + EMISOR.
    if (findColExacta(h, "estado") >= 0 && findColExacta(h, "numero") >= 0) return "facturas";
    // El de ventas es el único con "Medios" (donde viven las cuotas).
    if (findColExacta(h, "medios") >= 0 && findColExacta(h, "total") >= 0) return "ventas";
  }
  return null;
}

function vacio(tipo: TipoReporte, errores: string[], warnings: string[]): ReceivablesParseResult {
  return {
    tipoReporte: tipo,
    docs: [],
    periodo: { inicio: null, fin: null },
    totales: {
      total: 0, documentos: 0,
      porTipo: { FACTURA: 0, BOLETA: 0, TICKET: 0 },
      pendiente: 0, pagado: 0, anulado: 0,
    },
    errores,
    warnings,
  };
}

function resumir(
  tipo: TipoReporte,
  docs: DocumentoParseado[],
  errores: string[],
  warnings: string[],
): ReceivablesParseResult {
  const fechas = docs.map((d) => d.fecha).sort();
  const porTipo = { FACTURA: 0, BOLETA: 0, TICKET: 0 };
  for (const d of docs) if (d.estadoFactura !== "ANULADO") porTipo[d.tipo] = r2(porTipo[d.tipo] + d.total);

  const vivos = docs.filter((d) => d.estadoFactura !== "ANULADO");
  return {
    tipoReporte: tipo,
    docs,
    periodo: { inicio: fechas[0] ?? null, fin: fechas[fechas.length - 1] ?? null },
    totales: {
      total: r2(vivos.reduce((s, d) => s + d.total, 0)),
      documentos: docs.length,
      porTipo,
      pendiente: r2(vivos.filter((d) => d.estadoCuota === "PENDIENTE").reduce((s, d) => s + d.total, 0)),
      pagado: r2(vivos.filter((d) => d.estadoCuota === "PAGADA").reduce((s, d) => s + d.total, 0)),
      anulado: r2(docs.filter((d) => d.estadoFactura === "ANULADO").reduce((s, d) => s + d.total, 0)),
    },
    errores,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────
// Reporte de Ventas
// ─────────────────────────────────────────────────────────────────

export function parseVentasReport(rows: unknown[][]): ReceivablesParseResult {
  const errores: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(rows) || rows.length < 3) {
    errores.push("El archivo está vacío o no tiene filas de ventas.");
    return vacio("ventas", errores, warnings);
  }

  const hIdx = buscarHeader(
    rows,
    (h) => findColExacta(h, "medios") >= 0 && findColExacta(h, "total") >= 0,
  );
  if (hIdx === -1) {
    errores.push("No encontré los encabezados. ¿Es el «Reporte de Ventas» de Byte?");
    return vacio("ventas", errores, warnings);
  }

  const h = rows[hIdx];
  const col = {
    tipo: findColExacta(h, "tipo"),
    serie: findColExacta(h, "serie"),
    cliente: findColExacta(h, "cliente"),
    fecha: findColExacta(h, "fecha"),
    medios: findColExacta(h, "medios"),
    total: findColExacta(h, "total"),
    credito: findColExacta(h, "credito"),
    efectivo: findCol(h, "efectivo"),
    tarjeta: findCol(h, "tarjeta"),
    yape: findCol(h, "yape"),
    plin: findCol(h, "plin"),
    transferencia: findCol(h, "transferencia"),
  };
  console.log(`[receivables-parser:ventas] headerRow=${hIdx} cols=${JSON.stringify(col)}`);

  if (col.cliente === -1 || col.total === -1 || col.fecha === -1) {
    errores.push("Faltan las columnas 'Cliente', 'Fecha' y/o 'TOTAL' en el archivo.");
    return vacio("ventas", errores, warnings);
  }

  const docs: DocumentoParseado[] = [];
  const vistos = new Set<string>();

  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const cliente = clean(row[col.cliente]);
    const fecha = toDate(row[col.fecha]);
    if (!cliente || !fecha) continue; // fila vacía o de totales

    const tipo = normalizarTipo(row[col.tipo]);
    const serie = col.serie >= 0 ? clean(row[col.serie]) || null : null;
    const docKey = docKeyDe(serie, null, tipo);
    if (vistos.has(docKey)) {
      warnings.push(`El documento ${serie ?? docKey} aparece dos veces; me quedé con el primero.`);
      continue;
    }
    vistos.add(docKey);

    const { estado, vencimiento } = leerMedios(row[col.medios]);
    const cobradoPos = r2(
      [col.efectivo, col.tarjeta, col.yape, col.plin, col.transferencia]
        .filter((c) => c >= 0)
        .reduce((s, c) => s + toNum(row[c]), 0),
    );

    docs.push({
      docKey,
      tipo,
      serie,
      fecha,
      cliente,
      documento: null,             // el reporte de ventas no trae el RUC
      tipoDoc: null,
      esSede: detectarSede(null, cliente) !== null,
      sedeId: detectarSede(null, cliente),
      total: r2(toNum(row[col.total])),
      igv: null,
      gravado: null,
      credito: col.credito >= 0 ? r2(toNum(row[col.credito])) : 0,
      cobradoPos,
      estadoCuota: estado,
      vencimiento,
      estadoFactura: null,         // solo lo sabe el consolidado
    });
  }

  if (docs.length === 0) {
    errores.push("No encontré ninguna venta en el archivo.");
    return vacio("ventas", errores, warnings);
  }

  const huerfanos = docs.filter((d) => d.estadoCuota === "SIN_CUOTA" && d.cobradoPos === 0);
  if (huerfanos.length > 0) {
    warnings.push(
      `${huerfanos.length} venta(s) por ${r2(huerfanos.reduce((s, d) => s + d.total, 0)).toFixed(2)} ` +
        `quedaron a crédito pero SIN cuota de cobro en Byte: no figuran como deuda de nadie.`,
    );
  }

  return resumir("ventas", docs, errores, warnings);
}

// ─────────────────────────────────────────────────────────────────
// Consolidado de Facturas
// ─────────────────────────────────────────────────────────────────

export function parseFacturasReport(rows: unknown[][]): ReceivablesParseResult {
  const errores: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(rows) || rows.length < 3) {
    errores.push("El archivo está vacío o no tiene filas de facturas.");
    return vacio("facturas", errores, warnings);
  }

  const hIdx = buscarHeader(
    rows,
    (h) => findColExacta(h, "estado") >= 0 && findColExacta(h, "numero") >= 0,
  );
  if (hIdx === -1) {
    errores.push("No encontré los encabezados. ¿Es el «Consolidado de Facturas» de Byte?");
    return vacio("facturas", errores, warnings);
  }

  const h = rows[hIdx];
  const col = {
    serie: findColExacta(h, "serie"),
    numero: findColExacta(h, "numero"),
    fecha: findColExacta(h, "fecha"),
    // OJO: exacta y no "contiene" — "T DOC. CLTE." contiene "doc clte",
    // así que buscar por contenido devolvía el tipo (6) en vez del RUC.
    tipoDoc: findColExacta(h, "t doc clte"),
    docCliente: findColExacta(h, "doc clte"),
    cliente: findColExacta(h, "cliente"),
    gravado: findColExacta(h, "grav"),
    igv: findColExacta(h, "igv"),
    total: findColExacta(h, "total"),
    estado: findColExacta(h, "estado"),
  };
  console.log(`[receivables-parser:facturas] headerRow=${hIdx} cols=${JSON.stringify(col)}`);

  if (col.cliente === -1 || col.total === -1 || col.fecha === -1 || col.numero === -1) {
    errores.push("Faltan columnas obligatorias ('Cliente', 'Fecha', 'NUMERO', 'TOTAL').");
    return vacio("facturas", errores, warnings);
  }

  const docs: DocumentoParseado[] = [];
  const vistos = new Set<string>();

  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const cliente = clean(row[col.cliente]);
    const fecha = toDate(row[col.fecha]);
    const numero = clean(row[col.numero]);
    if (!cliente || !fecha || !numero) continue;

    const serie = col.serie >= 0 ? clean(row[col.serie]) || null : null;
    const docKey = docKeyDe(serie, numero, "FACTURA");
    if (vistos.has(docKey)) {
      warnings.push(`La factura ${docKey} aparece dos veces; me quedé con la primera.`);
      continue;
    }
    vistos.add(docKey);

    const documento = col.docCliente >= 0 ? clean(row[col.docCliente]) || null : null;
    const sedeId = detectarSede(documento, cliente);
    const estadoTxt = col.estado >= 0 ? norm(clean(row[col.estado])) : "";

    docs.push({
      docKey,
      tipo: "FACTURA",
      serie: serie && numero ? `${serie}-${numero}` : serie,
      fecha,
      cliente,
      documento,
      tipoDoc: col.tipoDoc >= 0 ? clean(row[col.tipoDoc]) || null : null,
      esSede: sedeId !== null,
      sedeId,
      total: r2(toNum(row[col.total])),
      igv: col.igv >= 0 ? r2(toNum(row[col.igv])) : null,
      gravado: col.gravado >= 0 ? r2(toNum(row[col.gravado])) : null,
      credito: 0,
      cobradoPos: 0,
      // El consolidado NO dice si se cobró; eso solo lo sabe el reporte
      // de ventas. Se deja sin tocar para no pisar el estado real.
      estadoCuota: "SIN_CUOTA",
      vencimiento: null,
      estadoFactura: estadoTxt.includes("anulad") ? "ANULADO" : "EMITIDO",
    });
  }

  if (docs.length === 0) {
    errores.push("No encontré ninguna factura en el archivo.");
    return vacio("facturas", errores, warnings);
  }

  const anuladas = docs.filter((d) => d.estadoFactura === "ANULADO");
  if (anuladas.length > 0) {
    warnings.push(
      `${anuladas.length} factura(s) anulada(s) por ${r2(
        anuladas.reduce((s, d) => s + d.total, 0),
      ).toFixed(2)}. No cuentan como venta ni como deuda.`,
    );
  }

  return resumir("facturas", docs, errores, warnings);
}

/** Punto de entrada del modal: detecta y parsea. */
export function parseReceivablesFile(rows: unknown[][]): ReceivablesParseResult {
  const tipo = detectarTipoReporte(rows);
  if (tipo === null) {
    return vacio(
      "ventas",
      [
        "No reconozco este archivo. Debe ser el «Reporte de Ventas» o el " +
          "«Consolidado de Facturas» que descargas de Byte.",
      ],
      [],
    );
  }
  return tipo === "ventas" ? parseVentasReport(rows) : parseFacturasReport(rows);
}
