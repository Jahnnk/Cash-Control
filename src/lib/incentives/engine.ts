/**
 * Incentivos por Upselling · MOTOR (lógica PURA — política jun-2026).
 *
 * Implementa la política al pie de la letra:
 * - Pozo = (ticket real − base) × transacciones × margen × pool% (TECHO).
 * - Se paga la TABLA FIJA por rol (nunca el pozo dividido): TC/MT/admin
 *   + premio al mejor vendedor. El colchón = pozo − suma de la tabla.
 * - Piso de tráfico: si personas/día < piso, la meta NO cuenta.
 * - Banderas anti-trampa (sección 10) medidas por TASA sobre las ventas
 *   del usuario, nunca por conteo bruto.
 */

export type IncentiveLevel = {
  nombre: string;
  delta: number;       // +S/ sobre el ticket base
  bono_tc: number;
  bono_mt: number;
  bono_admin: number;
  premio_mv: number;
};

export type IncentiveConfigT = {
  ticketBase: number;
  marginPct: number;   // 0-1
  trafficFloor: number; // personas/día mínimas
  poolPct: number;     // 0-1 (0.40)
  levels: IncentiveLevel[]; // orden ascendente por delta
};

export type StaffMember = {
  name: string;
  jornada: "tiempo_completo" | "medio_turno" | "administrador";
  area: string;
  active: boolean;
};

export type DailyEntry = { date: string; personas: number | null; revenue: number | null; items: number | null };

export type ControlEvent = {
  kind: "anulacion" | "cortesia" | "cambio_precio";
  eventAt: string;
  usuario: string | null;
  producto: string | null;
  amount: number | null;
  motivo: string | null;
};

export type WorkerSales = { nombre: string; mesas: number; total: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Suma de la tabla de bonos para un nivel, según el roster activo. */
export function bonusTableSum(staff: StaffMember[], level: IncentiveLevel): number {
  const active = staff.filter((s) => s.active);
  const tc = active.filter((s) => s.jornada === "tiempo_completo").length;
  const mt = active.filter((s) => s.jornada === "medio_turno").length;
  const admin = active.filter((s) => s.jornada === "administrador").length;
  return r2(tc * level.bono_tc + mt * level.bono_mt + admin * level.bono_admin + level.premio_mv);
}

export type IncentiveProgress = {
  daysLoaded: number;
  personas: number;
  revenue: number;
  items: number | null;
  ticketActual: number | null;
  deltaActual: number | null;          // ticket − base
  itemsPorPersona: number | null;
  /** Nivel alcanzado con el ticket del periodo (null = debajo del Nivel 1). */
  nivelAlcanzado: IncentiveLevel | null;
  proximoNivel: { level: IncentiveLevel; faltaSoles: number } | null;
  /** Personas proyectadas al cierre (ritmo actual × días del mes). */
  personasProyectadas: number | null;
  /** Pozo proyectado al cierre con el delta actual (el TECHO de pago). */
  pozoProyectado: number | null;
  /** Tabla de pago por nivel: suma de bonos y colchón vs pozo. */
  porNivel: { level: IncentiveLevel; sumaBonos: number; pozoNivel: number | null; colchon: number | null }[];
  /** Piso de tráfico (sin él, la meta no cuenta). */
  traffic: { personasPorDia: number | null; floor: number; cumple: boolean };
};

export function computeProgress(
  config: IncentiveConfigT,
  staff: StaffMember[],
  dailies: DailyEntry[],
  daysInMonth: number,
): IncentiveProgress {
  const withData = dailies.filter((d) => (d.personas ?? 0) > 0 && (d.revenue ?? 0) > 0);
  const personas = withData.reduce((s, d) => s + (d.personas ?? 0), 0);
  const revenue = r2(withData.reduce((s, d) => s + (d.revenue ?? 0), 0));
  const itemsDays = withData.filter((d) => d.items !== null);
  const items = itemsDays.length > 0 ? itemsDays.reduce((s, d) => s + (d.items ?? 0), 0) : null;

  const ticketActual = personas > 0 ? r2(revenue / personas) : null;
  const deltaActual = ticketActual !== null ? r2(ticketActual - config.ticketBase) : null;
  // items/persona solo sobre los días que registraron items (coherencia).
  const personasItemsDays = itemsDays.reduce((s, d) => s + (d.personas ?? 0), 0);
  const itemsPorPersona =
    items !== null && personasItemsDays > 0 ? r2(items / personasItemsDays) : null;

  const sorted = [...config.levels].sort((a, b) => a.delta - b.delta);
  const nivelAlcanzado =
    deltaActual === null ? null : [...sorted].reverse().find((l) => deltaActual >= l.delta) ?? null;
  const next = deltaActual === null ? null : sorted.find((l) => deltaActual < l.delta) ?? null;
  const proximoNivel =
    next && deltaActual !== null ? { level: next, faltaSoles: r2(next.delta - deltaActual) } : null;

  const personasProyectadas =
    withData.length > 0 ? Math.round((personas / withData.length) * daysInMonth) : null;
  const pozoProyectado =
    deltaActual !== null && deltaActual > 0 && personasProyectadas !== null
      ? r2(deltaActual * personasProyectadas * config.marginPct * config.poolPct)
      : null;

  const porNivel = sorted.map((level) => {
    const pozoNivel =
      personasProyectadas !== null
        ? r2(level.delta * personasProyectadas * config.marginPct * config.poolPct)
        : null;
    const sumaBonos = bonusTableSum(staff, level);
    return {
      level,
      sumaBonos,
      pozoNivel,
      colchon: pozoNivel !== null ? r2(pozoNivel - sumaBonos) : null,
    };
  });

  const personasPorDia = withData.length > 0 ? r1(personas / withData.length) : null;
  return {
    daysLoaded: withData.length,
    personas,
    revenue,
    items,
    ticketActual,
    deltaActual,
    itemsPorPersona,
    nivelAlcanzado,
    proximoNivel,
    personasProyectadas,
    pozoProyectado,
    porNivel,
    traffic: {
      personasPorDia,
      floor: config.trafficFloor,
      cumple: personasPorDia !== null && personasPorDia >= config.trafficFloor,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// BANDERAS ANTI-TRAMPA (sección 10) — por tasa, no por conteo bruto.
// ─────────────────────────────────────────────────────────────────

export type ControlFlag = {
  id: string;
  severity: "alta" | "media";
  usuario: string | null;
  title: string;
  detail: string;
};

export function computeFlags(
  events: ControlEvent[],
  workerSales: WorkerSales[],
): ControlFlag[] {
  const flags: ControlFlag[] = [];
  const salesByUser = new Map(workerSales.map((w) => [w.nombre.trim().toUpperCase(), w.total]));

  // 1) Anulaciones sin motivo — regla dura de la política.
  const sinMotivo = events.filter((e) => e.kind === "anulacion" && !e.motivo?.trim());
  if (sinMotivo.length > 0) {
    const byUser = new Map<string, number>();
    for (const e of sinMotivo) byUser.set(e.usuario ?? "(sin usuario)", (byUser.get(e.usuario ?? "(sin usuario)") ?? 0) + 1);
    for (const [usuario, n] of byUser) {
      flags.push({
        id: `sin-motivo-${usuario}`,
        severity: "alta",
        usuario,
        title: `${n} anulación(es) SIN MOTIVO`,
        detail: "La política exige motivo obligatorio en toda anulación. Sin motivo, descuenta del bono individual.",
      });
    }
  }

  // 2) Tasa de anulaciones sobre las ventas del usuario (>5% = bandera).
  const anuladoByUser = new Map<string, number>();
  for (const e of events.filter((e) => e.kind === "anulacion")) {
    const u = (e.usuario ?? "").trim().toUpperCase();
    if (u) anuladoByUser.set(u, (anuladoByUser.get(u) ?? 0) + (e.amount ?? 0));
  }
  for (const [usuario, anulado] of anuladoByUser) {
    const ventas = salesByUser.get(usuario);
    if (ventas && ventas > 0) {
      const tasa = (anulado / ventas) * 100;
      if (tasa > 5) {
        flags.push({
          id: `tasa-anulaciones-${usuario}`,
          severity: "alta",
          usuario,
          title: `Anulaciones = ${r1(tasa)}% de sus ventas (S/${r2(anulado)})`,
          detail: "Tasa fuera del patrón (>5% de sus propias ventas). Revisar caso por caso antes del bono.",
        });
      }
    }
  }

  // 3) Cortesías por usuario (tasa >3% o sin motivo).
  const cortesiaByUser = new Map<string, { total: number; sinMotivo: number }>();
  for (const e of events.filter((e) => e.kind === "cortesia")) {
    const u = (e.usuario ?? "").trim().toUpperCase();
    if (!u) continue;
    const agg = cortesiaByUser.get(u) ?? { total: 0, sinMotivo: 0 };
    agg.total += e.amount ?? 0;
    if (!e.motivo?.trim()) agg.sinMotivo += 1;
    cortesiaByUser.set(u, agg);
  }
  for (const [usuario, agg] of cortesiaByUser) {
    const ventas = salesByUser.get(usuario);
    const tasa = ventas && ventas > 0 ? (agg.total / ventas) * 100 : null;
    if ((tasa !== null && tasa > 3) || agg.sinMotivo >= 3) {
      flags.push({
        id: `cortesias-${usuario}`,
        severity: "media",
        usuario,
        title: `Cortesías por S/${r2(agg.total)}${tasa !== null ? ` (${r1(tasa)}% de sus ventas)` : ""}${agg.sinMotivo ? ` · ${agg.sinMotivo} sin motivo` : ""}`,
        detail: "Patrón de cortesías a revisar (umbral 3% de sus ventas o 3+ sin motivo).",
      });
    }
  }

  // 4) Cambios de precio: concentración por usuario (≥10 en el periodo).
  const cambiosByUser = new Map<string, number>();
  for (const e of events.filter((e) => e.kind === "cambio_precio")) {
    const u = (e.usuario ?? "").trim().toUpperCase();
    if (u) cambiosByUser.set(u, (cambiosByUser.get(u) ?? 0) + 1);
  }
  for (const [usuario, n] of cambiosByUser) {
    if (n >= 10) {
      flags.push({
        id: `cambios-precio-${usuario}`,
        severity: "media",
        usuario,
        title: `${n} cambios de precio manuales en el periodo`,
        detail: "Los precios deben salir de productos/combos configurados, no de ajustes manuales — revisar el origen (pendiente de la política, sección 13).",
      });
    }
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "alta" ? -1 : 1));
}
