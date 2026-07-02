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

  // Movimiento (una cláusula, sin repetir los chips de variación)
  const d = deltaDay ?? 0;
  const w = deltaWeek ?? 0;
  let move: string;
  if (deltaWeek !== null && Math.abs(w) >= 1) {
    const dirW = w > 0 ? "subió" : "cayó";
    if (deltaDay !== null && Math.abs(d) >= 1 && (d > 0) !== (w > 0)) {
      move = `${d > 0 ? "Subió" : "Cayó"} ${fmt(d)} hoy, pero en la semana ${dirW} ${fmt(w)}`;
    } else {
      move = `${dirW === "subió" ? "Subió" : "Cayó"} ${fmt(w)} en la semana`;
    }
  } else if (deltaDay !== null && Math.abs(d) >= 1) {
    move = `${d > 0 ? "Subió" : "Cayó"} ${fmt(d)} hoy`;
  } else {
    move = "Estable";
  }

  // Posición vs objetivo (el juicio) — una sola frase total.
  if (minSoles > 0 && liquid < minSoles * 0.5) {
    return { tone: "riesgo", text: `${move} — muy por debajo del objetivo (${fmt(minSoles)}).` };
  }
  if (minSoles > 0 && liquid < minSoles) {
    return { tone: "atencion", text: `${move} — por debajo del objetivo (${fmt(minSoles)}).` };
  }
  return {
    tone: w < -1 ? "neutro" : "bien",
    text: minSoles > 0 ? `${move} — dentro del objetivo.` : `${move}.`,
  };
}

/** Veredicto de DÍAS DE COBERTURA: tranquilidad o urgencia, en una frase. */
export function runwayVerdict(days: number | null, minDays: number): Verdict {
  if (days === null) {
    return { tone: "neutro", text: "Aún no hay historial de gasto suficiente para medir la cobertura." };
  }
  if (days < 3) {
    return { tone: "riesgo", text: `Situación crítica: ~${days} día(s) sin ventas. Cobra hoy y frena gastos no esenciales.` };
  }
  if (days < 7) {
    return { tone: "riesgo", text: `Muy corta: ~${days} días. Refuerza caja esta semana.` };
  }
  if (days < minDays) {
    return { tone: "atencion", text: `Ajustada: ~${days} días (objetivo ≥${minDays}). Margen delgado.` };
  }
  return { tone: "bien", text: `Tranquilo: operas ~${days} días aunque no vendas.` };
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
      text: "Inconsistencia interna en la cadena de saldos: corrígela antes de decidir con estas cifras.",
    };
  }
  if (lastCheckDiff === null) {
    return {
      tone: "atencion",
      label: "Sin cuadre",
      text: "Registra el saldo real del BCP para validar los números.",
    };
  }
  const abs = Math.abs(lastCheckDiff);
  const verif = verifiedPct !== null ? ` Verificado del mes: ${verifiedPct}%.` : "";
  if (abs < 1) {
    return { tone: "bien", label: "Confiable", text: `Cuadra con el banco (< S/1).${verif}` };
  }
  if (abs <= 50) {
    return { tone: "atencion", label: "Diferencia menor", text: `${fmt(lastCheckDiff)} de diferencia — ubícala antes del cierre.${verif}` };
  }
  return { tone: "riesgo", label: "Revisar", text: `${fmt(lastCheckDiff)} de diferencia — revísala antes de decidir con estas cifras.${verif}` };
}

// ─────────────────────────────────────────────────────────────────
// Copiloto: proyección de cierre, rachas y simulaciones "¿Y si...?"
// Reglas simples y auditables — nada de cajas negras.
// ─────────────────────────────────────────────────────────────────

/**
 * RACHA de la serie de liquidez: cuántos días consecutivos viene subiendo
 * o bajando (cambios de menos de S/1 se consideran estables y cortan la
 * racha). Detecta el patrón que una comparación puntual no ve.
 */
export function liquidityStreak(series: DayPoint[]): {
  direction: "sube" | "baja" | "estable";
  days: number;
  text: string | null; // solo si la racha es significativa (>= 3 días)
} {
  let days = 0;
  let direction: "sube" | "baja" | "estable" = "estable";
  for (let i = series.length - 1; i > 0; i--) {
    const diff = series[i].value - series[i - 1].value;
    const dir = diff > 1 ? "sube" : diff < -1 ? "baja" : "estable";
    if (dir === "estable") break;
    if (days === 0) direction = dir;
    else if (dir !== direction) break;
    days++;
  }
  if (days < 3 || direction === "estable") return { direction, days, text: null };
  return {
    direction,
    days,
    text: direction === "baja"
      ? `La liquidez viene deteriorándose hace ${days} días consecutivos.`
      : `La liquidez viene recuperándose hace ${days} días consecutivos.`,
  };
}

export type ProjectionConfidence = {
  level: "alta" | "media" | "baja";
  reason: string;
};

/**
 * CONFIANZA de la proyección: compara el ritmo reciente (14 días) con el
 * ritmo histórico (8 semanas). Regla auditable:
 *  - direcciones OPUESTAS y ambas significativas → baja
 *  - misma dirección y magnitud similar (±50%) → alta
 *  - resto → media
 * Muchos días restantes también degradan alta → media (más futuro = más
 * incertidumbre).
 */
export function projectionConfidence(input: {
  netDaily8w: number;
  netDaily14: number | null; // (último − primero de la serie 14d) / (n−1)
  daysRemaining: number;
}): ProjectionConfidence {
  const { netDaily8w, netDaily14, daysRemaining } = input;
  if (netDaily14 === null) {
    return { level: "media", reason: "Sin serie reciente completa para contrastar el ritmo." };
  }
  const bothMeaningful = Math.abs(netDaily8w) >= 5 && Math.abs(netDaily14) >= 5;
  if (bothMeaningful && Math.sign(netDaily14) !== Math.sign(netDaily8w)) {
    return {
      level: "baja",
      reason: `Tu ritmo reciente (${fmt(netDaily14)}/día en 14 días) va en dirección contraria al histórico (${fmt(netDaily8w)}/día en 8 semanas).`,
    };
  }
  const similar = Math.abs(netDaily14 - netDaily8w) <= Math.max(Math.abs(netDaily8w) * 0.5, 20);
  if (similar && daysRemaining <= 20) {
    return {
      level: "alta",
      reason: "El ritmo reciente (14 días) coincide con el histórico (8 semanas).",
    };
  }
  return {
    level: "media",
    reason: similar
      ? "El ritmo es consistente, pero falta mucho mes por delante."
      : "El ritmo reciente difiere del histórico en magnitud.",
  };
}

/**
 * PROYECCIÓN de cierre de mes: si el ritmo real de las últimas 8 semanas
 * continúa (variación neta diaria de la liquidez), ¿con cuánto cierras?
 */
export function monthEndProjection(input: {
  liquid: number;
  netDaily8w: number;    // (liquidez hoy − liquidez hace 56 días) / 56
  daysRemaining: number; // días que faltan del mes (sin contar hoy)
  minSoles: number;      // objetivo mínimo de liquidez
  netDaily14?: number | null; // ritmo reciente, para el nivel de confianza
}): { value: number; belowTarget: boolean; verdict: Verdict; confidence: ProjectionConfidence } {
  const value = Math.round((input.liquid + input.netDaily8w * input.daysRemaining) * 100) / 100;
  const belowTarget = input.minSoles > 0 && value < input.minSoles;
  const confidence = projectionConfidence({
    netDaily8w: input.netDaily8w,
    netDaily14: input.netDaily14 ?? null,
    daysRemaining: input.daysRemaining,
  });
  const base = `Si el ritmo de tus últimas 8 semanas continúa, cerrarías el mes con ~${fmt(value)}.`;
  let verdict: Verdict;
  if (value < 0) {
    verdict = { tone: "riesgo", text: `${base} Es decir: te quedarías sin caja antes del cierre. Actúa esta semana.` };
  } else if (belowTarget) {
    verdict = { tone: "atencion", text: `${base} Quedarías por debajo del objetivo (${fmt(input.minSoles)}).` };
  } else {
    verdict = { tone: "bien", text: `${base} Dentro del objetivo de liquidez.` };
  }
  return { value, belowTarget, verdict, confidence };
}

/** SIMULACIÓN: ¿y si cobro hoy todo lo pendiente? */
export function simulateCollect(input: {
  liquid: number;
  receivablesTotal: number;
  dailyExpense: number;
}): { newLiquid: number; extraDays: number; text: string } {
  const newLiquid = Math.round((input.liquid + input.receivablesTotal) * 100) / 100;
  const extraDays = input.dailyExpense > 0
    ? Math.round((input.receivablesTotal / input.dailyExpense) * 10) / 10
    : 0;
  return {
    newLiquid,
    extraDays,
    text: `Cobrar los ${fmt(input.receivablesTotal)} pendientes hoy sube tu liquidez a ${fmt(newLiquid)} (+${extraDays} día(s) de cobertura).`,
  };
}

/** SIMULACIÓN: ¿y si recorto el gasto operativo X% el resto del mes? */
export function simulateCutSpending(input: {
  dailyExpense: number;
  daysRemaining: number;
  pct: number; // 0.15 = 15%
  projectedClose: number;
}): { savings: number; newClose: number; text: string } {
  const savings = Math.round(input.dailyExpense * input.daysRemaining * input.pct * 100) / 100;
  const newClose = Math.round((input.projectedClose + savings) * 100) / 100;
  return {
    savings,
    newClose,
    text: `Reducir el gasto ${Math.round(input.pct * 100)}% el resto del mes ahorra ~${fmt(savings)}: cerrarías con ~${fmt(newClose)}.`,
  };
}

/** SIMULACIÓN: ¿y si congelo compras N días? (no suma plata: evita que salga) */
export function simulateFreeze(input: {
  dailyExpense: number;
  days: number;
  liquid: number;
}): { savings: number; text: string } {
  const savings = Math.round(input.dailyExpense * input.days * 100) / 100;
  const without = Math.round((input.liquid - savings) * 100) / 100;
  return {
    savings,
    text: `Congelar compras ${input.days} días evita ~${fmt(savings)} de salida: en ${input.days} días tendrías ~${fmt(input.liquid)} en vez de ~${fmt(without)}.`,
  };
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
    ? ` Cobrarlo hoy = ~${daysGained} día(s) más de cobertura.`
    : "";
  if (overdue > 0) {
    return {
      tone: "atencion",
      text: `${fmt(overdue)} vencidos (lo más antiguo: ${oldestDays} días).${gain}`,
    };
  }
  return { tone: "neutro", text: `Todo en plazo.${gain}` };
}
