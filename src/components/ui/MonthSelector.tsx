"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export type MonthValue = string; // "YYYY-MM"

function shiftMonth(month: MonthValue, delta: number): MonthValue {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: MonthValue): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_ES[m - 1]} ${y}`;
}

function getCurrentMonth(): MonthValue {
  return new Date().toISOString().substring(0, 7);
}

function buildMonthOptions(min: MonthValue, max: MonthValue): MonthValue[] {
  const out: MonthValue[] = [];
  let cur = min;
  // safety guard para no entrar en loops infinitos por inputs raros
  for (let i = 0; i < 600; i++) {
    out.push(cur);
    if (cur === max) break;
    cur = shiftMonth(cur, 1);
  }
  return out.reverse(); // mes más reciente primero
}

export interface MonthSelectorProps {
  /** Mes seleccionado en formato "YYYY-MM". */
  value: MonthValue;
  onChange: (next: MonthValue) => void;
  /** Tope inferior del selector. Default: 36 meses atrás del mes actual. */
  minMonth?: MonthValue;
  /** Tope superior del selector. Default: 12 meses adelante del mes actual. */
  maxMonth?: MonthValue;
  /** Mes calendario "actual" (para badge / botón "Mes actual"). Default: hoy. */
  currentMonth?: MonthValue;
  /** Bloquea interacciones durante una transición externa. */
  loading?: boolean;
}

/**
 * Selector unificado de mes — patrón Apple HIG:
 *   [← Mes anterior] [Mes actual] [Siguiente →]      Otro mes: [▼]
 *
 * - "Mes actual" se muestra activo (verde primary) cuando `value === currentMonth`.
 * - "Mes anterior" se deshabilita en `minMonth`.
 * - "Mes siguiente" se deshabilita en `maxMonth`.
 * - El dropdown lista todos los meses entre min y max, más reciente primero,
 *   etiquetando el mes actual con "(actual)".
 */
export function MonthSelector({
  value,
  onChange,
  minMonth,
  maxMonth,
  currentMonth,
  loading = false,
}: MonthSelectorProps) {
  const cur = currentMonth ?? getCurrentMonth();
  const minM = minMonth ?? shiftMonth(cur, -36);
  const maxM = maxMonth ?? shiftMonth(cur, 12);

  const prev = shiftMonth(value, -1);
  const next = shiftMonth(value, 1);
  const canPrev = value > minM;
  const canNext = value < maxM;
  const isCurrent = value === cur;

  const options = buildMonthOptions(minM, maxM);

  const baseBtn =
    "px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors";
  const navBtn = `${baseBtn} flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`;
  const currentBtn = isCurrent
    ? "px-3 py-1.5 text-sm rounded-md border bg-primary text-white border-primary"
    : baseBtn;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(prev)}
        disabled={!canPrev || loading}
        className={navBtn}
      >
        <ChevronLeft className="w-4 h-4" /> Mes anterior
      </button>
      <button
        type="button"
        onClick={() => onChange(cur)}
        disabled={loading}
        className={currentBtn}
      >
        Mes actual
      </button>
      <button
        type="button"
        onClick={() => onChange(next)}
        disabled={!canNext || loading}
        className={navBtn}
      >
        Mes siguiente <ChevronRight className="w-4 h-4" />
      </button>
      <div className="ml-auto flex items-center gap-2">
        <label className="text-xs text-gray-500">Otro mes:</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
          className="border border-gray-200 rounded-md px-2 py-1.5 text-sm text-gray-700 bg-white"
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {m === cur ? " (actual)" : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Helpers exportados por si algún consumer los necesita
export { monthLabel, shiftMonth, getCurrentMonth };
