/**
 * Incentivos · Parsers de los reportes de CONTROL de Byte (PUROS).
 * Estructuras reales verificadas (jun-2026, Fonavi y Centro):
 *  - Pedidos Anulados (HISTÓRICO — Byte lo eliminó en jul-2026; se
 *    acepta para re-importar exports antiguos):
 *                        COD | ID Venta | Cant | Pedido | Fecha Pedido | Fecha Anulación | Total | Motivo | Pedido por | Anulado por
 *  - Cortesías:          Pedido | Cortesía | Usuario | Precio Original | Fecha | Motivo
 *  - Cambios de precio:  Pedido | Plato | Precio Anterior | Precio Nuevo | Diferencia | Usuario | Caja | Fecha (dd/mm/yyyy hh:mm:ss)
 *  - Ventas por trabajador: DNI | Nombres Y Apellidos | Mesas Atendidas | Total (S/)  (primera fila de datos = TOTAL sin nombre)
 * Convención del repo: columnas por header dinámico, nunca offsets fijos.
 */

export type ParsedEvent = {
  kind: "anulacion" | "cortesia" | "cambio_precio";
  eventAt: string;      // ISO "YYYY-MM-DD HH:mm:ss"
  usuario: string | null;
  producto: string | null;
  amount: number | null;
  motivo: string | null;
};

export type ParsedWorkerSales = { dni: string | null; nombre: string; mesas: number; total: number };

export type ControlParseResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      kind: "anulaciones" | "cortesias" | "cambios_precio" | "ventas_trabajador";
      events: ParsedEvent[];
      workers: ParsedWorkerSales[];
      periodStart: string | null;
      periodEnd: string | null;
      warnings: string[];
    };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/S\/\s*/i, "").replace(/[+]/g, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
  return s || null;
};

/** Normaliza fechas de Byte: ISO "2026-06-07 11:03:51" o "22/06/2026 19:29:37". */
export function normalizeByteDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}(:\d{2})?)/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4].length === 5 ? iso[4] + ":00" : iso[4]}`;
  const lat = /^(\d{2})\/(\d{2})\/(\d{4})[ T]?(\d{2}:\d{2}(:\d{2})?)?/.exec(s);
  if (lat) return `${lat[3]}-${lat[2]}-${lat[1]} ${lat[4] ? (lat[4].length === 5 ? lat[4] + ":00" : lat[4]) : "00:00:00"}`;
  return null;
}

function findHeader(rows: unknown[][], required: RegExp[]): { idx: number; cols: number[] } | null {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const row = rows[i] ?? [];
    const cols = required.map((re) =>
      row.findIndex((c) => typeof c === "string" && re.test(c as string)),
    );
    if (cols.every((c) => c !== -1)) return { idx: i, cols };
  }
  return null;
}

function periodOf(events: { eventAt: string }[]): { periodStart: string | null; periodEnd: string | null } {
  const dates = events.map((e) => e.eventAt.slice(0, 10)).sort();
  return { periodStart: dates[0] ?? null, periodEnd: dates[dates.length - 1] ?? null };
}

/**
 * Detecta el tipo de reporte por su header y lo parsea. Un solo punto de
 * entrada: el modal sube varios archivos y cada uno se auto-clasifica.
 */
export function parseControlReport(rows: unknown[][]): ControlParseResult {
  const warnings: string[] = [];

  // — Pedidos anulados —
  const anul = findHeader(rows, [/fecha anulaci/i, /^motivo$/i, /pedido por/i, /^total$/i, /^pedido$/i]);
  if (anul) {
    const [fAnul, motivo, pedidoPor, total, producto] = anul.cols;
    const events: ParsedEvent[] = [];
    for (const row of rows.slice(anul.idx + 1)) {
      const eventAt = normalizeByteDate(row?.[fAnul]);
      if (!eventAt) continue;
      events.push({
        kind: "anulacion",
        eventAt,
        usuario: str(row[pedidoPor]),
        producto: str(row[producto]),
        amount: num(row[total]),
        motivo: str(row[motivo]),
      });
    }
    if (events.length === 0) return { ok: false, errors: ["Reporte de anulados sin filas legibles."] };
    return { ok: true, kind: "anulaciones", events, workers: [], ...periodOf(events), warnings };
  }

  // — Cortesías —
  const cort = findHeader(rows, [/^cortes/i, /^usuario$/i, /precio original/i, /^fecha$/i]);
  if (cort) {
    const [producto, usuario, precio, fecha] = cort.cols;
    const motivoIdx = (rows[cort.idx] ?? []).findIndex((c) => typeof c === "string" && /^motivo$/i.test(c as string));
    const events: ParsedEvent[] = [];
    for (const row of rows.slice(cort.idx + 1)) {
      const eventAt = normalizeByteDate(row?.[fecha]);
      if (!eventAt) continue;
      events.push({
        kind: "cortesia",
        eventAt,
        usuario: str(row[usuario]),
        producto: str(row[producto]),
        amount: num(row[precio]),
        motivo: motivoIdx !== -1 ? str(row[motivoIdx]) : null,
      });
    }
    if (events.length === 0) return { ok: false, errors: ["Reporte de cortesías sin filas legibles."] };
    return { ok: true, kind: "cortesias", events, workers: [], ...periodOf(events), warnings };
  }

  // — Cambios de precio —
  const camb = findHeader(rows, [/precio anterior/i, /precio nuevo/i, /^usuario$/i, /^fecha$/i, /^plato$/i]);
  if (camb) {
    const [pAnt, pNvo, usuario, fecha, producto] = camb.cols;
    const events: ParsedEvent[] = [];
    for (const row of rows.slice(camb.idx + 1)) {
      const eventAt = normalizeByteDate(row?.[fecha]);
      if (!eventAt) continue;
      const antes = num(row[pAnt]);
      const despues = num(row[pNvo]);
      events.push({
        kind: "cambio_precio",
        eventAt,
        usuario: str(row[usuario]),
        producto: str(row[producto]),
        amount: antes !== null && despues !== null ? Math.round((despues - antes) * 100) / 100 : null,
        motivo: antes !== null && despues !== null ? `S/${antes.toFixed(2)} → S/${despues.toFixed(2)}` : null,
      });
    }
    if (events.length === 0) return { ok: false, errors: ["Reporte de cambios de precio sin filas legibles."] };
    return { ok: true, kind: "cambios_precio", events, workers: [], ...periodOf(events), warnings };
  }

  // — Ventas por trabajador —
  const vt = findHeader(rows, [/^dni$/i, /nombres/i, /mesas/i, /^total/i]);
  if (vt) {
    const [dni, nombre, mesas, total] = vt.cols;
    // Rango de fechas del título ("Ventas por trabajador del X al Y").
    let periodStart: string | null = null, periodEnd: string | null = null;
    for (let i = 0; i < vt.idx; i++) {
      for (const cell of rows[i] ?? []) {
        const m = typeof cell === "string" && /del\s+(\d{4}-\d{2}-\d{2})\s+al\s+(\d{4}-\d{2}-\d{2})/i.exec(cell);
        if (m) { periodStart = m[1]; periodEnd = m[2]; }
      }
    }
    const workers: ParsedWorkerSales[] = [];
    for (const row of rows.slice(vt.idx + 1)) {
      const name = str(row?.[nombre]);
      if (!name) continue; // la fila TOTAL de Byte viene sin nombre
      workers.push({
        dni: str(row[dni]),
        nombre: name,
        mesas: num(row[mesas]) ?? 0,
        total: num(row[total]) ?? 0,
      });
    }
    if (workers.length === 0) return { ok: false, errors: ["Reporte de ventas por trabajador sin filas legibles."] };
    if (!periodStart) warnings.push("No pude leer el rango de fechas del título — se usará el mes del tablero.");
    return { ok: true, kind: "ventas_trabajador", events: [], workers, periodStart, periodEnd, warnings };
  }

  return {
    ok: false,
    errors: [
      "No reconozco este archivo. Reportes aceptados: Cortesías, Cambios de Precio y Ventas por Trabajador (exports de Byte); también Pedidos Anulados antiguos como histórico.",
    ],
  };
}
