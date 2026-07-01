/**
 * Parser del Excel de "Gastos Pendientes por Reponer" (reposición de caja
 * chica del administrador). Función PURA y testeable: recibe las filas de la
 * hoja (string[][]) y devuelve los gastos listos para registrar.
 *
 * Estructura del archivo (constante semana a semana):
 *   - Cabecera: "Yayi's", "Gastos Pendientes por Reponer",
 *     "Periodo: Junio 2026", "Generado: 2026-07-01", (fila vacía)
 *   - Fila de encabezados: N° | Descripcion | Fecha | Metodo de pago | Monto
 *   - Bloques por categoría:
 *       [Categoría]            (solo la 1ra columna, ej. "Insumos")
 *       1 | Picador... | fecha | Cuentas | 299.00
 *       ...
 *       (vacío) x3 | Subtotal Insumos | 661.65
 *   - Cierre: (vacío) x3 | TOTAL GENERAL | 1,051.65
 *
 * Columnas detectadas dinámicamente por el header (nunca offsets fijos: el
 * !ref cambia si la columna A tiene o no datos — ver convención del proyecto).
 */

export type CajaChicaItem = {
  /** Categoría del bloque (Insumos, Deliverys, …). */
  category: string;
  /** Descripción del gasto. */
  concept: string;
  /** Fecha original del gasto en el Excel (YYYY-MM-DD si se pudo normalizar). */
  itemDate: string;
  /** Monto exacto. */
  amount: number;
  /** Método tal cual viene en el Excel (ej. "Cuentas"). */
  rawMethod: string;
};

export type CajaChicaParse =
  | {
      ok: true;
      generado: string | null; // "Generado:" — firma de la reposición (anti-duplicados)
      periodo: string | null;  // "Periodo:"
      items: CajaChicaItem[];
      total: number;           // suma real de los ítems
      declaredTotal: number | null; // "TOTAL GENERAL" del Excel
      warnings: string[];
    }
  | { ok: false; errors: string[] };

const toStr = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

/** "1,051.65" → 1051.65 ; "299.00" → 299 ; inválido → NaN */
export function parseAmount(raw: unknown): number {
  const s = toStr(raw).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (s === "") return NaN;
  return Number(s);
}

/** Normaliza fecha a YYYY-MM-DD si es posible; si no, devuelve el texto crudo. */
function normalizeDate(raw: unknown): string {
  const s = toStr(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

/** Extrae el valor tras "Etiqueta:" en las primeras filas (Generado, Periodo). */
function findLabelValue(rows: unknown[][], label: RegExp): string | null {
  for (const row of rows.slice(0, 8)) {
    for (const cell of row) {
      const s = toStr(cell);
      const m = label.exec(s);
      if (m) return s.slice(m.index + m[0].length).trim() || null;
    }
  }
  return null;
}

export function parseCajaChica(rows: unknown[][]): CajaChicaParse {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1) Localizar la fila de encabezados (tiene "Descripcion" y "Monto").
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].map(toStr).join(" | ").toLowerCase();
    if (/descrip/.test(joined) && /monto/.test(joined)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { ok: false, errors: ["No encontré la fila de encabezados (Descripción / Monto). ¿Es el archivo de reposición correcto?"] };
  }

  const header = rows[headerIdx].map(toStr);
  const findCol = (re: RegExp) => header.findIndex((h) => re.test(h.toLowerCase()));
  const numCol = Math.max(findCol(/^n[°º.]?$/), 0);
  const descCol = findCol(/descrip/);
  const dateCol = findCol(/fecha/);
  const methodCol = findCol(/m[eé]todo/);
  const amountCol = findCol(/monto/);
  console.log(`[caja-chica-parser] headerIdx=${headerIdx} desc=${descCol} fecha=${dateCol} metodo=${methodCol} monto=${amountCol}`);

  if (descCol === -1 || amountCol === -1) {
    return { ok: false, errors: ["El archivo no tiene columnas de Descripción y/o Monto reconocibles."] };
  }

  const generado = findLabelValue(rows, /generado\s*:/i);
  const periodo = findLabelValue(rows, /periodo\s*:/i);

  // 2) Recorrer bloques por categoría.
  const items: CajaChicaItem[] = [];
  const declaredSubtotals: Record<string, number> = {};
  let declaredTotal: number | null = null;
  let currentCategory: string | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i].map(toStr);
    if (cells.every((c) => c === "")) continue;

    const method = cells[methodCol] ?? "";
    const desc = cells[descCol] ?? "";
    const amountRaw = cells[amountCol] ?? "";
    // La categoría y el N° comparten la primera columna de datos (numCol),
    // que puede no ser la col 0 si el Excel tiene una columna A vacía.
    const firstCell = cells[numCol] ?? "";

    // Subtotal por categoría → guardar para validar, no es ítem.
    const sub = /^subtotal\s+(.*)$/i.exec(method);
    if (sub) {
      declaredSubtotals[sub[1].trim()] = parseAmount(amountRaw);
      continue;
    }
    // Total general → cierre.
    if (/total\s*general/i.test(method) || /total\s*general/i.test(cells.join(" "))) {
      declaredTotal = parseAmount(amountRaw);
      continue;
    }
    // Encabezado de categoría: solo la 1ra columna con texto no numérico
    // (sin descripción ni monto en su fila).
    if (desc === "" && amountRaw === "" && firstCell !== "" && Number.isNaN(parseAmount(firstCell))) {
      currentCategory = firstCell;
      continue;
    }
    // Ítem: tiene descripción y monto.
    if (desc !== "" && amountRaw !== "") {
      const amount = parseAmount(amountRaw);
      if (Number.isNaN(amount) || amount <= 0) {
        errors.push(`Fila ${i + 1}: monto inválido ("${amountRaw}") en "${desc}".`);
        continue;
      }
      if (!currentCategory) {
        errors.push(`Fila ${i + 1}: el gasto "${desc}" no está debajo de ninguna categoría.`);
        continue;
      }
      items.push({
        category: currentCategory,
        concept: desc,
        itemDate: normalizeDate(cells[dateCol]),
        amount: Math.round(amount * 100) / 100,
        rawMethod: method,
      });
    }
  }

  if (errors.length) return { ok: false, errors };
  if (items.length === 0) {
    return { ok: false, errors: ["No encontré ningún gasto en el archivo."] };
  }

  const total = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100;

  // Validación suave: la suma de ítems debe coincidir con el TOTAL GENERAL.
  if (declaredTotal !== null && Math.abs(total - declaredTotal) > 0.01) {
    warnings.push(`La suma de los gastos (S/${total.toFixed(2)}) no coincide con el TOTAL GENERAL del Excel (S/${declaredTotal.toFixed(2)}).`);
  }
  // Y cada subtotal por categoría.
  for (const [cat, declared] of Object.entries(declaredSubtotals)) {
    const real = Math.round(items.filter((it) => it.category === cat).reduce((s, it) => s + it.amount, 0) * 100) / 100;
    if (Math.abs(real - declared) > 0.01) {
      warnings.push(`Subtotal ${cat}: la suma real (S/${real.toFixed(2)}) no coincide con el Excel (S/${declared.toFixed(2)}).`);
    }
  }

  return { ok: true, generado, periodo, items, total, declaredTotal, warnings };
}
