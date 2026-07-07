/**
 * Tiempos de atención medidos · lógica PURA.
 *
 * Dos tipos de servicio, cada uno con su meta configurable (kpi_targets):
 *   - mostrador: comanda → despacho (meta por defecto <6 min)
 *   - mesa:      pedido  → servido  (meta por defecto <15 min)
 *
 * El cronómetro real vive en la base de datos (started_at/ended_at): el
 * tiempo se calcula contra el reloj del servidor, no del teléfono, así
 * el reporte es fiable aunque se recargue o bloquee la pantalla.
 *
 * El semáforo replica el del motor de KPIs (tiempoTraffic): verde ≤ meta,
 * ámbar ≤ 1.2× meta, rojo mayor — para que el color del cronómetro y el
 * del tablero cuenten la misma historia.
 */

export type ServiceKind = "mostrador" | "mesa";

export type TimingTraffic = "verde" | "ambar" | "rojo";

export type ServiceTiming = {
  id: string;
  kind: ServiceKind;
  label: string;
  startedAt: string;            // ISO
  endedAt: string | null;       // ISO o null (en curso)
  durationSeconds: number | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** "5:07" (m:ss). Para relojes largos usa mm:ss igual. */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

/**
 * Semáforo de un tiempo (en segundos) contra su meta (en minutos).
 * Sin meta configurada → siempre verde (no inventa un umbral).
 */
export function timingTraffic(seconds: number, metaMin: number | null): TimingTraffic {
  if (metaMin === null || metaMin <= 0) return "verde";
  const metaS = metaMin * 60;
  if (seconds <= metaS) return "verde";
  if (seconds <= metaS * 1.2) return "ambar";
  return "rojo";
}

export type KindSummary = {
  kind: ServiceKind;
  count: number;
  avgSeconds: number | null;
  avgMin: number | null;        // redondeado a 0.1 (lo que va al KPI)
  traffic: TimingTraffic;
  /** Cuántos superaron la meta (rojo) — el foco de mejora del encargado. */
  overMeta: number;
};

/** Resume los tiempos COMPLETOS de un tipo (los en curso no cuentan). */
export function summarizeKind(
  timings: ServiceTiming[],
  kind: ServiceKind,
  metaMin: number | null,
): KindSummary {
  const done = timings.filter((t) => t.kind === kind && t.durationSeconds !== null);
  const count = done.length;
  if (count === 0) {
    return { kind, count: 0, avgSeconds: null, avgMin: null, traffic: "verde", overMeta: 0 };
  }
  const totalS = done.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);
  const avgSeconds = totalS / count;
  const overMeta = metaMin !== null && metaMin > 0
    ? done.filter((t) => (t.durationSeconds ?? 0) > metaMin * 60).length
    : 0;
  return {
    kind,
    count,
    avgSeconds: Math.round(avgSeconds),
    avgMin: r1(avgSeconds / 60),
    traffic: timingTraffic(avgSeconds, metaMin),
    overMeta,
  };
}

/** Segundos transcurridos de un timer en curso, dado el "ahora". */
export function elapsedSeconds(startedAtISO: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(startedAtISO).getTime()) / 1000));
}
