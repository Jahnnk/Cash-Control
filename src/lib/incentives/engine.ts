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

export type DailyEntry = {
  date: string;
  personas: number | null;
  revenue: number | null;
  items: number | null;
  /** Pedidos por delivery del día (dentro de `personas`). Opcional:
   * null/ausente = 0. Desde ago-2026 SÍ cuentan para el ticket, así que
   * se EXCLUYEN del ticket del programa (feedback admins jul-2026).
   * Mostrador y mesa NO se separan: ambos mueven el bono. */
  deliveryPedidos?: number | null;
  /** Venta por delivery del día (dentro de `revenue`). */
  deliveryVenta?: number | null;
  /** Consumo del PERSONAL del día (20% dscto, se descuenta del sueldo;
   * dentro de personas/revenue). A un compañero nadie le hace
   * upselling → también se EXCLUYE del ticket del programa
   * (observación de Chari, jul-2026). */
  personalPedidos?: number | null;
  personalVenta?: number | null;
};

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
  /** Piso de tráfico (sin él, la meta no cuenta) — sobre personas TOTALES. */
  traffic: { personasPorDia: number | null; floor: number; cumple: boolean };
  /** Delivery del periodo (informativo — desde ago-2026 SÍ entra al
   * ticket del programa). null si no se registró. */
  delivery: { pedidos: number; venta: number; ticket: number | null } | null;
  /** Consumo del personal del periodo (informativo — también excluido:
   * al 20% de descuento y sin upselling posible). null si no se registró. */
  personal: { pedidos: number; venta: number; ticket: number | null } | null;
};

/**
 * Ticket que cuenta para el programa, de un solo día — misma fórmula
 * que `computeProgress` pero fila por fila, para el detalle diario de
 * los reportes exportables. El "lujo de detalle" que pidió Jahnn no
 * puede usar una fórmula distinta a la del agregado.
 */
export function dailyPresencial(d: DailyEntry): { personas: number; venta: number; ticket: number | null } {
  const personalPedidos = Math.max(0, d.personalPedidos ?? 0);
  const personalVenta = Math.max(0, d.personalVenta ?? 0);
  const personas = Math.max(0, (d.personas ?? 0) - personalPedidos);
  const venta = r2(Math.max(0, (d.revenue ?? 0) - personalVenta));
  return { personas, venta, ticket: personas > 0 ? r2(venta / personas) : null };
}

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

  // ── Qué entra al ticket del programa ──────────────────────────────
  //
  // DELIVERY: SÍ cuenta desde ago-2026. Antes se excluía por una razón
  // que resultó no aplicar acá: "en un pedido de app nadie puede
  // sugerir extras". Pero en Fonavi el delivery entra por WhatsApp y
  // teléfono, y lo atiende el equipo — o sea que el upselling depende
  // de ellos igual que en mostrador (Chari vía Jahnn, ago-2026). Y no
  // es marginal: 65 pedidos en agosto con un ticket de S/46.12, el
  // DOBLE del presencial (S/23.06). Dejarlos fuera les quitaba la
  // oportunidad más rentable que tienen.
  //
  // CONSUMO DEL PERSONAL: sigue fuera (Chari, jul-2026). Compran al 20%
  // de descuento y no hay upselling posible; incluirlo haría que un
  // beneficio para el equipo le baje la meta al equipo.
  //
  // OJO al cambiar esto: la BASE del ticket tiene que medirse con el
  // MISMO criterio. Si se mide con delivery contra una base calculada
  // sin él, el ticket sube solo por el cambio de regla y el bono se
  // regala (en Fonavi eran S/1.23, el 82% del primer nivel). Por eso
  // `getBaseEditor` usa esta misma fórmula.
  const personalPedidos = withData.reduce((s, d) => s + Math.max(0, d.personalPedidos ?? 0), 0);
  const personalVenta = r2(withData.reduce((s, d) => s + Math.max(0, d.personalVenta ?? 0), 0));
  const personasPresencial = Math.max(0, personas - personalPedidos);
  const ventaPresencial = r2(Math.max(0, revenue - personalVenta));

  // Delivery: solo informativo, para poder verlo aparte en el panel.
  const deliveryPedidos = withData.reduce((s, d) => s + Math.max(0, d.deliveryPedidos ?? 0), 0);
  const deliveryVenta = r2(withData.reduce((s, d) => s + Math.max(0, d.deliveryVenta ?? 0), 0));

  const ticketActual = personasPresencial > 0 ? r2(ventaPresencial / personasPresencial) : null;
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

  // Proyección para el POZO con los clientes que cuentan (mostrador,
  // mesa y delivery): la utilidad nueva (delta × clientes) se genera
  // donde sí se pudo hacer upselling.
  const personasProyectadas =
    withData.length > 0 ? Math.round((personasPresencial / withData.length) * daysInMonth) : null;
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
    delivery:
      deliveryPedidos > 0
        ? {
            pedidos: deliveryPedidos,
            venta: deliveryVenta,
            ticket: r2(deliveryVenta / deliveryPedidos),
          }
        : null,
    personal:
      personalPedidos > 0
        ? {
            pedidos: personalPedidos,
            venta: personalVenta,
            ticket: r2(personalVenta / personalPedidos),
          }
        : null,
  };
}

// ─────────────────────────────────────────────────────────────────
// LIQUIDACIÓN DEL MES — el acta que congela el resultado y el pago.
// Candados de la política: piso de tráfico (sin él, la meta NO cuenta),
// observaciones del verificador resueltas, mes terminado.
// ─────────────────────────────────────────────────────────────────

/**
 * Rotación diaria del foco de upselling (feedback del admin de Fonavi,
 * jul-2026: "las sugerencias son siempre las mismas"). De un pozo de
 * buenos candidatos se muestran `size` por día, girando la ventana con
 * la fecha — determinista (mismo día = misma lista, sin Math.random)
 * para que admin y dirección vean lo mismo. Si el pozo no da para
 * rotar (≤ size), se devuelve entero.
 */
export function pickDailyFocus<T>(pool: T[], size: number, dateISO: string): T[] {
  if (pool.length <= size) return pool;
  const [y, m, d] = dateISO.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, (m ?? 1) - 1, d ?? 1) / 86400000);
  const offset = ((dayNumber % pool.length) + pool.length) % pool.length;
  return Array.from({ length: size }, (_, i) => pool[(offset + i) % pool.length]);
}

export type LiquidationLine = { name: string; jornada: StaffMember["jornada"]; bono: number; premioMv: number };

export type LiquidationResult = {
  month: string;
  ticketFinal: number | null;
  ticketBase: number;
  personas: number;
  revenue: number;
  deltaFinal: number | null;
  nivel: IncentiveLevel | null;      // null = sin nivel (o piso incumplido)
  trafficOk: boolean;
  personasPorDia: number | null;
  /** Pozo REAL del mes: delta × personas reales × margen × pool. */
  pozo: number | null;
  lines: LiquidationLine[];
  totalBonos: number;
  /** Impiden cerrar (se resuelven primero). */
  blockers: string[];
  /** No impiden cerrar, pero quedan en el acta. */
  warnings: string[];
};

export function computeLiquidation(input: {
  month: string;                      // YYYY-MM
  todayISO: string;                   // para validar mes terminado
  config: IncentiveConfigT;
  staff: StaffMember[];
  dailies: DailyEntry[];
  /** Días con registro y SIN segunda firma (pasados). */
  unverifiedDays: number;
  /** Días observados por el verificador sin re-confirmar. */
  observedDays: { date: string; nota: string | null }[];
  /** Mejor vendedor elegido (opcional — Fase B lo automatiza). */
  mejorVendedor: string | null;
}): LiquidationResult {
  const { config, staff, dailies } = input;
  const [y, m] = input.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthEnd = `${input.month}-${String(daysInMonth).padStart(2, "0")}`;

  const withData = dailies.filter((d) => (d.personas ?? 0) > 0 && (d.revenue ?? 0) > 0);
  const personas = withData.reduce((s, d) => s + (d.personas ?? 0), 0);
  const revenue = r2(withData.reduce((s, d) => s + (d.revenue ?? 0), 0));
  const ticketFinal = personas > 0 ? r2(revenue / personas) : null;
  const deltaFinal = ticketFinal !== null ? r2(ticketFinal - config.ticketBase) : null;
  const personasPorDia = withData.length > 0 ? r1(personas / withData.length) : null;
  const trafficOk = personasPorDia !== null && personasPorDia >= config.trafficFloor;

  const sorted = [...config.levels].sort((a, b) => a.delta - b.delta);
  // El piso de tráfico es candado de la POLÍTICA: sin él, la meta no cuenta.
  const nivel =
    !trafficOk || deltaFinal === null
      ? null
      : [...sorted].reverse().find((l) => deltaFinal >= l.delta) ?? null;

  const pozo =
    deltaFinal !== null && deltaFinal > 0
      ? r2(deltaFinal * personas * config.marginPct * config.poolPct)
      : null;

  const active = staff.filter((s) => s.active);
  const lines: LiquidationLine[] = active.map((s) => {
    const bono = nivel
      ? s.jornada === "tiempo_completo" ? nivel.bono_tc
        : s.jornada === "medio_turno" ? nivel.bono_mt
        : nivel.bono_admin
      : 0;
    const premioMv =
      nivel && input.mejorVendedor && s.name.trim().toUpperCase() === input.mejorVendedor.trim().toUpperCase()
        ? nivel.premio_mv
        : 0;
    return { name: s.name, jornada: s.jornada, bono, premioMv };
  });
  const totalBonos = r2(lines.reduce((s, l) => s + l.bono + l.premioMv, 0));

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (input.todayISO <= monthEnd) {
    blockers.push(`El mes aún no termina (cierra el ${monthEnd}). La liquidación se hace con el mes completo.`);
  }
  for (const o of input.observedDays) {
    blockers.push(
      `Día ${o.date.slice(8)}/${o.date.slice(5, 7)} OBSERVADO por el verificador${o.nota ? ` ("${o.nota}")` : ""} — corrige el registro y que el verificador re-confirme.`,
    );
  }
  if (withData.length === 0) blockers.push("Sin registros diarios en el mes.");
  if (input.unverifiedDays > 0) {
    warnings.push(`${input.unverifiedDays} día(s) con registro sin la segunda firma del verificador.`);
  }
  if (!trafficOk && personasPorDia !== null) {
    warnings.push(
      `Piso de tráfico incumplido (${personasPorDia} < ${config.trafficFloor} personas/día): por política, la meta NO cuenta — se cierra sin bonos.`,
    );
  }
  if (nivel && !input.mejorVendedor) {
    warnings.push("Sin mejor vendedor asignado: el premio no se paga este mes (Fase B lo calculará automático).");
  }
  if (nivel && pozo !== null && totalBonos > pozo) {
    warnings.push(`La suma de bonos (S/${totalBonos.toFixed(2)}) excede el pozo real (S/${pozo.toFixed(2)}) — revisar antes de pagar.`);
  }

  return {
    month: input.month,
    ticketFinal,
    ticketBase: config.ticketBase,
    personas,
    revenue,
    deltaFinal,
    nivel,
    trafficOk,
    personasPorDia,
    pozo,
    lines,
    totalBonos,
    blockers,
    warnings,
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
