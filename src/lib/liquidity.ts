/**
 * Helpers PUROS del Panel Ejecutivo de Liquidez (sección Saldos del
 * Dashboard). La server action liquidity-panel.ts arma los datos crudos
 * (saldos conocidos por día, netos de efectivo) y estas funciones producen
 * la serie continua, las variaciones y la cobertura. Testeable sin BD.
 */

export type DayPoint = { date: string; value: number };

/** Rango continuo de fechas YYYY-MM-DD, ambos extremos incluidos. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const stop = new Date(end + "T00:00:00Z");
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Serie del BANCO: para cada día, el último saldo conocido (forward-fill).
 * `seed` es el último saldo conocido ANTES del rango (0 si no hay).
 */
export function forwardFill(
  dates: string[],
  known: Map<string, number>,
  seed: number,
): number[] {
  let last = seed;
  return dates.map((d) => {
    if (known.has(d)) last = known.get(d)!;
    return last;
  });
}

/**
 * Serie de la CAJA: acumulado día a día de los netos de efectivo,
 * partiendo de `base` (acumulado histórico antes del rango).
 */
export function cumulate(
  dates: string[],
  dailyNets: Map<string, number>,
  base: number,
): number[] {
  let acc = base;
  return dates.map((d) => {
    acc += dailyNets.get(d) ?? 0;
    return Math.round(acc * 100) / 100;
  });
}

/** Días de cobertura: liquidez / gasto operativo diario. null si no hay gasto histórico. */
export function runwayDays(liquid: number, dailyExpense: number): number | null {
  if (dailyExpense <= 0) return null;
  return Math.max(0, Math.floor(liquid / dailyExpense));
}

/**
 * Variaciones de la serie (último punto vs ayer y vs hace 7 días).
 * null si la serie no alcanza.
 */
export function seriesDeltas(series: DayPoint[]): { day: number | null; week: number | null } {
  const n = series.length;
  if (n < 2) return { day: null, week: null };
  const last = series[n - 1].value;
  const day = Math.round((last - series[n - 2].value) * 100) / 100;
  const week = n >= 8 ? Math.round((last - series[n - 8].value) * 100) / 100 : null;
  return { day, week };
}

/** Nivel de salud de la liquidez frente al objetivo mínimo (en días). */
export function liquidityLevel(days: number | null): "verde" | "ambar" | "rojo" | "sin-datos" {
  if (days === null) return "sin-datos";
  if (days >= 15) return "verde";
  if (days >= 7) return "ambar";
  return "rojo";
}

// ─────────────────────────────────────────────────────────────────
// Veredictos: el sistema interpreta — el gerente no descifra números.
// Frases cortas en lenguaje natural, derivadas SOLO de los datos.
// ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `S/${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type Verdict = {
  tone: "bien" | "neutro" | "atencion" | "riesgo";
  text: string;
};

/**
 * Veredicto de la tarjeta LIQUIDEZ: interpreta las variaciones y la
 * posición frente al objetivo. Ej.: "La liquidez cayó S/69.00 vs ayer y
 * S/4,977.00 en 7 días — tendencia a la baja. Estás por debajo del
 * objetivo recomendado (S/19,063)."
 */
export function liquidityVerdict(input: {
  liquid: number;
  deltaDay: number | null;
  deltaWeek: number | null;
  minSoles: number; // objetivo mínimo (15 días de gasto)
}): Verdict {
  const { liquid, deltaDay, deltaWeek, minSoles } = input;
  const parts: string[] = [];

  const d = deltaDay ?? 0;
  const w = deltaWeek ?? 0;
  if (deltaWeek !== null && Math.abs(w) >= 1) {
    const dirW = w > 0 ? "subió" : "cayó";
    if (deltaDay !== null && Math.abs(d) >= 1) {
      const dirD = d > 0 ? "subió" : "cayó";
      parts.push(
        dirD === dirW
          ? `La liquidez ${dirD} ${fmt(d)} vs ayer y ${fmt(w)} en 7 días.`
          : `La liquidez ${dirD} ${fmt(d)} vs ayer, aunque en 7 días ${dirW} ${fmt(w)}.`,
      );
    } else {
      parts.push(`La liquidez ${dirW} ${fmt(w)} en los últimos 7 días.`);
    }
  } else if (deltaDay !== null && Math.abs(d) >= 1) {
    parts.push(`La liquidez ${d > 0 ? "subió" : "cayó"} ${fmt(d)} vs ayer.`);
  } else {
    parts.push("La liquidez está estable.");
  }

  let tone: Verdict["tone"];
  if (minSoles > 0 && liquid < minSoles * 0.5) {
    tone = "riesgo";
    parts.push(`Estás muy por debajo del objetivo recomendado (${fmt(minSoles)}).`);
  } else if (minSoles > 0 && liquid < minSoles) {
    tone = "atencion";
    parts.push(`Estás por debajo del objetivo recomendado (${fmt(minSoles)}).`);
  } else {
    tone = w < -1 ? "neutro" : "bien";
    if (minSoles > 0) parts.push("Estás dentro del objetivo de liquidez.");
  }
  if (tone !== "riesgo" && w < -1 && d < -1) {
    parts.push("La tendencia sigue a la baja: vale vigilarla.");
  }
  return { tone, text: parts.join(" ") };
}

/** Veredicto de DÍAS DE COBERTURA: tranquilidad o urgencia, en una frase. */
export function runwayVerdict(days: number | null, minDays: number): Verdict {
  if (days === null) {
    return { tone: "neutro", text: "Aún no hay historial de gasto suficiente para medir la cobertura." };
  }
  if (days < 3) {
    return { tone: "riesgo", text: `Situación crítica: sin ventas, el dinero alcanza ~${days} día(s). Prioriza cobrar y frena gastos no esenciales.` };
  }
  if (days < 7) {
    return { tone: "riesgo", text: `Cobertura muy corta: ~${days} días sin vender. Conviene reforzar caja esta semana.` };
  }
  if (days < minDays) {
    return { tone: "atencion", text: `Cobertura ajustada: ~${days} días (objetivo ≥${minDays}). Sin urgencia, pero con margen delgado.` };
  }
  return { tone: "bien", text: `Tranquilo: aunque hoy no vendas nada, operas ~${days} días. Objetivo ≥${minDays} cumplido.` };
}

/**
 * Veredicto de CONCILIACIÓN BANCARIA: ¿puedo confiar en los números?
 * Tolerancia: |dif| < S/1 = cuadrado; ≤ S/50 = diferencia menor; > S/50 =
 * revisar antes de decidir con estas cifras.
 */
export function reconciliationVerdict(input: {
  lastCheckDiff: number | null;
  hasDiscrepancy: boolean;
  verifiedPct: number | null;
}): Verdict & { label: string } {
  const { lastCheckDiff, hasDiscrepancy, verifiedPct } = input;
  if (hasDiscrepancy) {
    return {
      tone: "riesgo",
      label: "No confiable",
      text: "Hay una inconsistencia interna en la cadena de saldos: corrígela antes de tomar decisiones con estas cifras.",
    };
  }
  if (lastCheckDiff === null) {
    return {
      tone: "atencion",
      label: "Sin cuadre",
      text: "No hay un cuadre reciente contra el banco real. Registra el saldo del BCP para validar los números.",
    };
  }
  const abs = Math.abs(lastCheckDiff);
  const verif = verifiedPct !== null ? ` Movimientos del mes verificados: ${verifiedPct}%.` : "";
  if (abs < 1) {
    return { tone: "bien", label: "Confiable", text: `El sistema cuadra con el banco (tolerancia < S/1). Puedes confiar en estas cifras.${verif}` };
  }
  if (abs <= 50) {
    return { tone: "atencion", label: "Diferencia menor", text: `Diferencia de ${fmt(lastCheckDiff)} con el banco — pequeña, pero conviene ubicarla antes del cierre.${verif}` };
  }
  return { tone: "riesgo", label: "Revisar", text: `Diferencia de ${fmt(lastCheckDiff)} con el banco. Revísala antes de decidir con estas cifras.${verif}` };
}

/**
 * Veredicto de POR COBRAR, orientado a la acción: cuánta caja ganas al
 * cobrar y qué tan añejo está lo pendiente.
 */
export function receivablesVerdict(input: {
  total: number;
  overdue: number;
  oldestDays: number;
  dailyExpense: number;
}): Verdict {
  const { total, overdue, oldestDays, dailyExpense } = input;
  if (total <= 0) {
    return { tone: "bien", text: "No tienes cuentas por cobrar pendientes." };
  }
  const daysGained = dailyExpense > 0 ? Math.floor(total / dailyExpense) : null;
  const gain = daysGained !== null && daysGained >= 1
    ? ` Cobrarlo hoy te daría ~${daysGained} día(s) más de cobertura.`
    : "";
  if (overdue > 0) {
    return {
      tone: "atencion",
      text: `${fmt(overdue)} ya están vencidos (lo más antiguo lleva ${oldestDays} días).${gain}`,
    };
  }
  return { tone: "neutro", text: `Todo dentro de plazo.${gain}` };
}
