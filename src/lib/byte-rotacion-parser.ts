/**
 * PIC · Parser del reporte de Byte "Productos con mayor rotación" (PURO).
 *
 * Este es el reporte CANÓNICO de ventas por producto: cuadra con el total
 * de ventas del mes (verificado con junio 2026 de Atelier: S/41,425.80 vs
 * S/41,045.32 de Byte diario — 99.1%). El reporte "Rentabilidad por
 * producto" de Byte NO se usa: cubre solo productos con receta en Byte
 * (~47% de la venta) y su costo no es la fuente oficial (pricing-engine).
 *
 * Estructura real observada:
 *   fila 0: "Platos con mayor rotacion del 2026-06-01 al 2026-06-30"
 *   fila 1: Plato | Precio Unitario (S/) | Vendido | Por Cobrar | Total Vendido (S/) | Total Por Cobrar (S/)
 *   filas:  datos · última fila TOTAL sin nombre: [null,null,7918,0,"TOTAL",41425.8]
 *
 * Convención del repo: columnas detectadas dinámicamente por header,
 * nunca offsets fijos (ver AGENTS.md).
 */

export type ByteRotacionItem = {
  name: string;
  units: number;
  revenue: number;
  unitPrice: number | null;
};

export type ByteRotacionResult =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      items: ByteRotacionItem[];
      /** YYYY-MM derivado del rango del título (null si no se encontró). */
      month: string | null;
      periodStart: string | null;
      periodEnd: string | null;
      /** Total S/ declarado por Byte en la fila TOTAL (si existe). */
      declaredTotal: number | null;
      /** Formato detectado: rotación (canónico, cuadra ~99%) o
       *  rentabilidad (aceptado para HISTORIA: cubre solo productos con
       *  receta en Byte — 87-94% en cafeterías, medido jun-2026). */
      format: "rotacion" | "rentabilidad";
      warnings: string[];
    };

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function parseByteRotacion(rows: unknown[][]): ByteRotacionResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1) Header dinámico: la fila que contiene "Plato" y "Vendido".
  //    Distingue el formato: "Rentabilidad por Plato" trae además la
  //    columna "Utilidad Total" (y "Precio Venta" en vez de unitario).
  let headerIdx = -1;
  let colPlato = -1, colPrecio = -1, colVendido = -1, colTotal = -1;
  let format: "rotacion" | "rentabilidad" = "rotacion";
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] ?? [];
    let plato = -1, precio = -1, vendido = -1, total = -1, utilidad = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = typeof row[c] === "string" ? (row[c] as string) : "";
      if (/^\s*plato\s*$/i.test(cell)) plato = c;
      else if (/precio\s+(unitario|venta)/i.test(cell)) precio = c;
      else if (/^\s*vendido s?\s*$/i.test(cell) || /^\s*vendidos?\s*$/i.test(cell)) vendido = c;
      else if (/total\s+vendido/i.test(cell)) total = c;
      else if (/utilidad\s+total/i.test(cell)) utilidad = c;
    }
    if (plato !== -1 && vendido !== -1 && total !== -1) {
      headerIdx = i; colPlato = plato; colPrecio = precio; colVendido = vendido; colTotal = total;
      format = utilidad !== -1 ? "rentabilidad" : "rotacion";
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      ok: false,
      errors: [
        "No encontré las columnas 'Plato', 'Vendido' y 'Total Vendido'. ¿Es el reporte de Byte \"Productos con mayor rotación\" (.xlsx)?",
      ],
    };
  }
  console.log(
    `[byte-rotacion-parser] headerIdx=${headerIdx} colPlato=${colPlato} colVendido=${colVendido} colTotal=${colTotal} rows=${rows.length}`,
  );

  // 2) Rango de fechas del título (filas antes del header).
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  for (let i = 0; i <= headerIdx; i++) {
    for (const cell of rows[i] ?? []) {
      if (typeof cell !== "string") continue;
      const m = /del\s+(\d{4}-\d{2}-\d{2})\s+al\s+(\d{4}-\d{2}-\d{2})/i.exec(cell);
      if (m) { periodStart = m[1]; periodEnd = m[2]; }
    }
  }
  const month = periodStart ? periodStart.slice(0, 7) : null;
  if (!month) {
    warnings.push("No pude leer el rango de fechas del título; confirma el mes manualmente.");
  } else {
    if (periodEnd && periodEnd.slice(0, 7) !== month) {
      errors.push(`El reporte cruza dos meses (${periodStart} → ${periodEnd}). Exporta de Byte un mes calendario completo.`);
    }
    const [y, mo] = month.split("-").map(Number);
    const lastDay = new Date(y, mo, 0).getDate();
    if (periodStart!.slice(8) !== "01" || (periodEnd && Number(periodEnd.slice(8)) !== lastDay)) {
      warnings.push(`El rango ${periodStart} → ${periodEnd} no cubre el mes completo: el análisis del mes quedaría parcial.`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  // 3) Filas de datos. La fila TOTAL no tiene nombre → captura el declarado.
  const byName = new Map<string, ByteRotacionItem>();
  const dups: string[] = [];
  let declaredTotal: number | null = null;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const rawName = row[colPlato];
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name) {
      // Fila TOTAL de Byte: pone la palabra "TOTAL" en la columna del
      // monto y el número en la SIGUIENTE (observado en el export real).
      const labelIdx = row.findIndex((c) => typeof c === "string" && /^\s*total\s*$/i.test(c));
      let t: number | null = null;
      if (labelIdx !== -1) {
        for (let c = labelIdx + 1; c < row.length; c++) {
          const v = num(row[c]);
          if (v !== null) { t = v; break; }
        }
      }
      t ??= num(row[colTotal]);
      if (t !== null) declaredTotal = t;
      continue;
    }
    const units = num(row[colVendido]);
    const revenue = num(row[colTotal]);
    if (units === null || revenue === null) {
      warnings.push(`"${name}": vendido o total no numérico — fila omitida.`);
      continue;
    }
    if (units < 0 || revenue < 0) {
      warnings.push(`"${name}": valores negativos — fila omitida.`);
      continue;
    }
    // El formato rentabilidad lista TODO el catálogo (incluye filas con
    // venta 0): no aportan y se omiten en silencio (no es un error).
    if (units === 0 && revenue === 0) continue;
    const unitPrice = colPrecio !== -1 ? num(row[colPrecio]) : null;
    const prev = byName.get(name);
    if (prev) {
      // Byte repite nombres cuando existen variantes con el mismo display:
      // se agregan sumando (la venta es la misma realidad).
      prev.units = r2(prev.units + units);
      prev.revenue = r2(prev.revenue + revenue);
      if (!dups.includes(name)) dups.push(name);
    } else {
      byName.set(name, { name, units, revenue, unitPrice });
    }
  }
  if (dups.length > 0) {
    warnings.push(`Nombres repetidos en el export (se sumaron): ${dups.join(", ")}.`);
  }

  const items = [...byName.values()];
  if (items.length === 0) return { ok: false, errors: ["El reporte no tiene filas de productos."] };

  // 4) Integridad del parseo: Σ filas vs TOTAL declarado por Byte.
  const sum = r2(items.reduce((s, it) => s + it.revenue, 0));
  if (declaredTotal !== null && Math.abs(sum - declaredTotal) > 0.01) {
    warnings.push(
      `La suma de las filas (S/${sum.toFixed(2)}) no coincide con el TOTAL del reporte (S/${declaredTotal.toFixed(2)}).`,
    );
  }
  if (format === "rentabilidad") {
    warnings.push(
      "Reporte de Rentabilidad: cubre solo productos con receta en Byte (87-94% de la venta en cafeterías). Útil para historia y tendencias; para el mes corriente prefiere el de Rotación.",
    );
  }

  return { ok: true, items, month, periodStart, periodEnd, declaredTotal, format, warnings };
}
