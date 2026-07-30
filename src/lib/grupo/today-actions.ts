/**
 * "¿Qué debo hacer hoy?" — el cuarto bloque del Command Center.
 *
 * Convierte el estado del grupo en, como mucho, TRES frases accionables
 * ordenadas por urgencia. Si no hay nada que hacer, devuelve lista
 * vacía y la tarjeta se reemplaza por un "todo en orden": un panel que
 * inventa tareas para no verse vacío entrena al CEO a ignorarlo.
 *
 * Función PURA: recibe el estado y devuelve texto; no toca la BD.
 */

export type ActionSeverity = "critico" | "atencion" | "info";

export type TodayAction = {
  id: string;
  severity: ActionSeverity;
  /** Frase corta en imperativo — lo que hay que hacer. */
  title: string;
  /** Una línea de porqué, con el número que lo justifica. */
  detail: string;
  /** Ruta a la pantalla donde se resuelve. */
  href: string;
};

export type ActionsInput = {
  cargas: { nombre: string; nivel: "verde" | "ambar" | "rojo"; diasDesdeCarga: number | null }[];
  sedes: {
    nombre: string;
    code: string;
    deltaPct: number | null;
    diasComparados: number;
    coberturaBaja: boolean;
    /** % del equilibrio cubierto; null sin base. */
    equilibrioPct: number | null;
    /** true = el mes ya cerró o el ritmo no alcanza a cubrir costos. */
    equilibrioEnRiesgo: boolean;
  }[];
};

const ORDEN: Record<ActionSeverity, number> = { critico: 0, atencion: 1, info: 2 };

/** Caída de ventas a partir de la cual vale interrumpir al CEO. */
export const CAIDA_RELEVANTE_PCT = -15;

export function buildTodayActions(input: ActionsInput): TodayAction[] {
  const out: TodayAction[] = [];

  // 1. Sin carga de datos: todo lo demás se decide a ciegas.
  for (const c of input.cargas) {
    if (c.nivel === "rojo") {
      out.push({
        id: `carga-${c.nombre}`,
        severity: "critico",
        title: `Pide la carga de ${c.nombre}`,
        detail: c.diasDesdeCarga === null
          ? "Nunca se ha subido su Excel."
          : `Última carga hace ${c.diasDesdeCarga} días.`,
        href: "/grupo/dashboard",
      });
    }
  }

  // 2. Caída de ventas real (solo si el comparativo es confiable).
  for (const s of input.sedes) {
    if (s.deltaPct !== null && s.deltaPct <= CAIDA_RELEVANTE_PCT && !s.coberturaBaja) {
      out.push({
        id: `caida-${s.code}`,
        severity: "critico",
        title: `Revisa las ventas de ${s.nombre}`,
        detail: `${s.deltaPct.toFixed(1)}% vs el mes pasado en ${s.diasComparados} días comparados.`,
        href: `/${s.code}/dashboard`,
      });
    }
  }

  // 3. Sede que no llega a cubrir sus costos.
  for (const s of input.sedes) {
    if (s.equilibrioEnRiesgo && s.equilibrioPct !== null && s.equilibrioPct < 100) {
      out.push({
        id: `equilibrio-${s.code}`,
        severity: "atencion",
        title: `${s.nombre} no cubre sus costos`,
        detail: `Va en ${Math.round(s.equilibrioPct)}% del punto de equilibrio.`,
        href: `/${s.code}/dashboard`,
      });
    }
  }

  // 4. Comparativo poco confiable: falta historia del mes pasado.
  for (const s of input.sedes) {
    if (s.coberturaBaja) {
      out.push({
        id: `cobertura-${s.code}`,
        severity: "info",
        title: `Completa el mes pasado de ${s.nombre}`,
        detail: `Solo ${s.diasComparados} días comparables: el % aún no es confiable.`,
        href: "/grupo/dashboard",
      });
    }
  }

  return out.sort((a, b) => ORDEN[a.severity] - ORDEN[b.severity]).slice(0, 3);
}
