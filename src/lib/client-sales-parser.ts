/**
 * Parser del "Reporte Ventas por Cliente" de Byte.
 *
 * Estructura del archivo (verificada contra el export real, ago-2026):
 *   Fila 1: título "Reporte Ventas por Cliente" (celdas combinadas A1:J1)
 *   Fila 2: encabezados
 *   Fila 3+: un cliente por fila
 *
 * Columnas: Documento · Tipo Doc. · Cliente · Total Pedidos ·
 *           Con Comprobante · Sin Comprobante · Total Ventas ·
 *           Ticket Promedio · Primera Compra · Última Compra
 *
 * OJO con los tipos: Byte exporta los montos como TEXTO ("S/ 68.55") y
 * las fechas como TEXTO ("2026-08-04"), no como número ni fecha de Excel.
 * Por eso `toNum` limpia el "S/" y `toDate` acepta el texto ISO además de
 * los formatos nativos.
 *
 * Las columnas se detectan leyendo el encabezado, nunca por posición fija
 * (convención del repo — ver AGENTS.md: el `!ref` de Excel cambia si la
 * columna A viene vacía y eso rompe los parsers posicionales).
 */

import * as XLSX from "xlsx";

/** RUC de las sedes del grupo. Confirmado por Jahnn el 09-ago-2026.
 *  Se identifican por RUC y no por nombre: la razón social puede venir
 *  escrita distinto entre exports, el RUC no cambia. */
export const SEDE_RUCS: Record<string, { sedeId: number; sede: string }> = {
  "20614333643": { sedeId: 3, sede: "Centro" },  // SERVICIOS GASTRONOMICOS YAYIS S.A.C.
  "20615473775": { sedeId: 2, sede: "Fonavi" },  // EXPERIENCIAS GASTRONOMICAS YAYIS S.R.L.
};

/** Respaldo por nombre, si algún export trajera el documento vacío. */
const SEDE_NOMBRES: { patron: RegExp; sedeId: number; sede: string }[] = [
  { patron: /SERVICIOS\s+GASTRONOMICOS\s+YAYIS/i, sedeId: 3, sede: "Centro" },
  { patron: /EXPERIENCIAS\s+GASTRONOMICAS\s+YAYIS/i, sedeId: 2, sede: "Fonavi" },
];

export type ClientSalesRow = {
  documento: string | null;
  tipoDoc: string | null;
  cliente: string;
  esSede: boolean;
  sedeId: number | null;
  totalPedidos: number;
  conComprobante: number;
  sinComprobante: number;
  totalVentas: number;
  ticketPromedio: number;
  primeraCompra: string | null;
  ultimaCompra: string | null;
};

export type ClientSalesParseResult = {
  filas: ClientSalesRow[];
  periodo: { inicio: string | null; fin: string | null };
  totales: {
    ventas: number;
    pedidos: number;
    clientes: number;
    ventasExternas: number;
    ventasSedes: number;
  };
  errores: string[];
  warnings: string[];
};

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const clean = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

/** "S/ 3,248.86" → 3248.86 · también acepta número nativo. */
function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = clean(v)
    .replace(/S\/\.?/gi, "")
    .replace(/\s/g, "")
    .replace(/,/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Acepta "2026-08-04" (lo que manda Byte), Date, y serial de Excel. */
function toDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const s = clean(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy por si Byte cambia el formato
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
  return null;
}

/** Normaliza para comparar encabezados: sin tildes, minúsculas, sin puntos. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.\s]+/g, " ")
    .trim();
}

/** Busca la columna cuyo encabezado contiene TODAS las palabras dadas. */
function findCol(header: unknown[], ...palabras: string[]): number {
  for (let c = 0; c < header.length; c++) {
    const h = norm(clean(header[c]));
    if (h && palabras.every((p) => h.includes(p))) return c;
  }
  return -1;
}

function detectarSede(documento: string | null, cliente: string) {
  if (documento && SEDE_RUCS[documento]) return SEDE_RUCS[documento];
  for (const s of SEDE_NOMBRES) {
    if (s.patron.test(cliente)) return { sedeId: s.sedeId, sede: s.sede };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────

export function parseClientSales(rows: unknown[][]): ClientSalesParseResult {
  const errores: string[] = [];
  const warnings: string[] = [];
  const vacio: ClientSalesParseResult = {
    filas: [],
    periodo: { inicio: null, fin: null },
    totales: { ventas: 0, pedidos: 0, clientes: 0, ventasExternas: 0, ventasSedes: 0 },
    errores,
    warnings,
  };

  if (!Array.isArray(rows) || rows.length < 3) {
    errores.push("El archivo está vacío o no tiene filas de clientes.");
    return vacio;
  }

  // La fila de encabezados es la que tiene "Cliente" — normalmente la 2,
  // pero se busca por contenido para no romper si Byte agrega una fila.
  let hIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    if (findCol(rows[r] ?? [], "cliente") >= 0 && findCol(rows[r] ?? [], "total", "ventas") >= 0) {
      hIdx = r;
      break;
    }
  }
  if (hIdx === -1) {
    errores.push(
      "No encontré la fila de encabezados. ¿Es el «Reporte Ventas por Cliente» de Byte?",
    );
    return vacio;
  }

  const header = rows[hIdx];
  const col = {
    documento: findCol(header, "documento"),
    tipoDoc: findCol(header, "tipo", "doc"),
    cliente: findCol(header, "cliente"),
    pedidos: findCol(header, "total", "pedidos"),
    conComp: findCol(header, "con", "comprobante"),
    sinComp: findCol(header, "sin", "comprobante"),
    ventas: findCol(header, "total", "ventas"),
    ticket: findCol(header, "ticket"),
    primera: findCol(header, "primera"),
    ultima: findCol(header, "ultima"),
  };
  console.log(
    `[client-sales-parser] headerRow=${hIdx} cols=${JSON.stringify(col)} filas=${rows.length}`,
  );

  if (col.cliente === -1 || col.ventas === -1) {
    errores.push("Faltan las columnas 'Cliente' y/o 'Total Ventas' en el archivo.");
    return vacio;
  }
  for (const [nombre, idx] of [
    ["Total Pedidos", col.pedidos],
    ["Ticket Promedio", col.ticket],
    ["Última Compra", col.ultima],
  ] as const) {
    if (idx === -1) warnings.push(`No encontré la columna '${nombre}'; se calculará o quedará vacía.`);
  }

  const filas: ClientSalesRow[] = [];
  const vistos = new Set<string>();

  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const cliente = clean(row[col.cliente]);
    if (!cliente) continue; // fila vacía o de totales

    const ventas = toNum(row[col.ventas]);
    const pedidos = col.pedidos >= 0 ? Math.round(toNum(row[col.pedidos])) : 0;
    // Si Byte no trae el ticket, se deriva. Nunca dividir entre cero.
    const ticket =
      col.ticket >= 0 && toNum(row[col.ticket]) > 0
        ? toNum(row[col.ticket])
        : pedidos > 0
          ? Math.round((ventas / pedidos) * 100) / 100
          : 0;

    const documento = col.documento >= 0 ? clean(row[col.documento]) || null : null;
    const sede = detectarSede(documento, cliente);

    const clave = documento || cliente.toUpperCase();
    if (vistos.has(clave)) {
      warnings.push(`«${cliente}» aparece más de una vez en el archivo; se sumaron sus filas.`);
      const previa = filas.find((f) => (f.documento || f.cliente.toUpperCase()) === clave)!;
      previa.totalPedidos += pedidos;
      previa.totalVentas = Math.round((previa.totalVentas + ventas) * 100) / 100;
      previa.conComprobante += col.conComp >= 0 ? Math.round(toNum(row[col.conComp])) : 0;
      previa.sinComprobante += col.sinComp >= 0 ? Math.round(toNum(row[col.sinComp])) : 0;
      previa.ticketPromedio =
        previa.totalPedidos > 0
          ? Math.round((previa.totalVentas / previa.totalPedidos) * 100) / 100
          : 0;
      continue;
    }
    vistos.add(clave);

    filas.push({
      documento,
      tipoDoc: col.tipoDoc >= 0 ? clean(row[col.tipoDoc]) || null : null,
      cliente,
      esSede: sede !== null,
      sedeId: sede?.sedeId ?? null,
      totalPedidos: pedidos,
      conComprobante: col.conComp >= 0 ? Math.round(toNum(row[col.conComp])) : 0,
      sinComprobante: col.sinComp >= 0 ? Math.round(toNum(row[col.sinComp])) : 0,
      totalVentas: ventas,
      ticketPromedio: ticket,
      primeraCompra: col.primera >= 0 ? toDate(row[col.primera]) : null,
      ultimaCompra: col.ultima >= 0 ? toDate(row[col.ultima]) : null,
    });
  }

  if (filas.length === 0) {
    errores.push("No encontré ningún cliente en el archivo.");
    return vacio;
  }

  // El período sale del propio archivo: la compra más antigua y la más
  // reciente de todo el reporte.
  const fechas = filas
    .flatMap((f) => [f.primeraCompra, f.ultimaCompra])
    .filter((d): d is string => Boolean(d))
    .sort();
  const inicio = fechas[0] ?? null;
  const fin = fechas[fechas.length - 1] ?? null;
  if (!inicio || !fin) {
    errores.push(
      "El archivo no trae fechas de compra, así que no puedo saber qué semana cubre.",
    );
    return vacio;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const ventasSedes = r2(filas.filter((f) => f.esSede).reduce((s, f) => s + f.totalVentas, 0));
  const ventasTotal = r2(filas.reduce((s, f) => s + f.totalVentas, 0));

  if (!filas.some((f) => f.esSede)) {
    warnings.push(
      "No detecté ventas a Fonavi ni a Centro en este archivo. Si esperabas verlas, avísame.",
    );
  }

  return {
    filas,
    periodo: { inicio, fin },
    totales: {
      ventas: ventasTotal,
      pedidos: filas.reduce((s, f) => s + f.totalPedidos, 0),
      clientes: filas.length,
      ventasExternas: r2(ventasTotal - ventasSedes),
      ventasSedes,
    },
    errores,
    warnings,
  };
}
