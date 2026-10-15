/**
 * «Necesita tu atención» · MOTOR (puro). Rediseño UX del Resumen de Grupo (8-oct-2026).
 *
 * Pedido de Jahnn: que el dashboard se use sin pensar. En vez de tres avisos técnicos iguales
 * («Revisa el cuadre de Fonavi / Centro / Atelier con el Excel»), una lista corta de lo que de
 * verdad pide una acción suya, ordenada por urgencia, cada una con su botón:
 *   · Lo repetido se agrupa (las diferencias con el Excel son UN aviso, no tres).
 *   · Lo que no cambia ninguna decisión no entra (comparativos poco confiables, avisos de cobertura).
 *   · Si no hay nada, la tarjeta dice «Todo en orden»: un panel que inventa tareas enseña a ignorarlo.
 */

export type Nivel = "alto" | "medio";

export type Atencion = {
  id: string;
  nivel: Nivel;
  titulo: string;
  detalle: string;
  /** A dónde lleva el botón. «#excel» = pestaña Excel del mismo dashboard. */
  href: string;
  /** El texto del botón (verbo). */
  accion: string;
};

export type EntradaAtencion = {
  hoy: string;
  sedes: {
    nombre: string;
    code: string;
    deltaPct: number | null;
    diasComparados: number;
    coberturaBaja: boolean;
    /** Días de venta que faltan registrar (0 = al día hasta ayer). null = sin datos. */
    diasSinRegistrar: number | null;
    equilibrioEnRiesgo: boolean;
    equilibrioPct: number | null;
    /** Días del mes con ventas cargadas: con menos de una semana el ritmo engaña y no se alarma. */
    diasConDatos: number;
  }[];
  /** Diferencias del sistema con el Excel (verificación automática), por sede y mes. */
  cuadres: { sede: string; mes: string; alertas: number }[];
  /** Qué pedirle al Excel de Finanzas (null = está al día). */
  excelPendiente: string | null;
  /**
   * Sedes sin Highlight esta semana (el sistema lo comprueba: no hay casilla que marcar).
   * undefined/null = no aplica (p. ej. el dashboard de una sede).
   */
  highlightsSinAsignar?: string[] | null;
  /**
   * Presupuesto aprobado: de este mes y del siguiente (el sistema lo comprueba).
   * `diasRestantes` = días que faltan para fin de mes.
   */
  presupuesto?: { mesActualSinAprobar: number; siguienteSinAprobar: number; totalSedes: number; diasRestantes: number; mesSiguiente: string } | null;
  /** Cobros de Atelier: días desde la última carga del reporte de Byte. */
  cobrosAtelier: { diasDesdeCarga: number | null; porCobrar: number } | null;
};

/** Caída de ventas que amerita interrumpir: −15% con al menos una semana comparada. */
export const CAIDA_RELEVANTE_PCT = -15;
export const DIAS_MINIMOS_COMPARACION = 7;
/** Días sin registrar ventas a partir de los cuales se avisa (1 = solo falta ayer: normal). */
export const DIAS_SIN_REGISTRAR = 2;
export const DIAS_COBROS = 8;
/** Cuántos días antes de fin de mes avisa que falta aprobar el presupuesto del siguiente. */
export const DIAS_AVISO_PRESUPUESTO = 5;
/** Cuántos avisos se ven sin abrir «ver más». */
export const VISIBLES = 4;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

export function construirAtencion(e: EntradaAtencion): Atencion[] {
  const out: Atencion[] = [];

  for (const s of e.sedes) {
    if (s.deltaPct !== null && s.deltaPct <= CAIDA_RELEVANTE_PCT && !s.coberturaBaja && s.diasComparados >= DIAS_MINIMOS_COMPARACION) {
      out.push({
        id: `caida-${s.code}`, nivel: "alto",
        titulo: `${s.nombre} vende ${Math.abs(Math.round(s.deltaPct))}% menos que el mes pasado`,
        detalle: `En los mismos ${s.diasComparados} días del mes.`,
        href: `/${s.code}/dashboard`, accion: "Ver sede",
      });
    }
  }

  for (const s of e.sedes) {
    if (s.equilibrioEnRiesgo && s.equilibrioPct !== null && s.equilibrioPct < 100 && s.diasConDatos >= DIAS_MINIMOS_COMPARACION) {
      out.push({
        id: `equilibrio-${s.code}`, nivel: "alto",
        titulo: `${s.nombre} no llega a cubrir sus costos`,
        detalle: `Al ritmo actual no alcanza el punto de equilibrio este mes (va en ${Math.round(s.equilibrioPct)}%).`,
        href: "/grupo/reportes", accion: "Ver punto de equilibrio",
      });
    }
  }

  // Lo que el SISTEMA comprueba (15-oct-2026: se quitó la revisión del lunes y el checklist, que eran
  // casillas que uno mismo marca y no medían nada).
  if (e.highlightsSinAsignar && e.highlightsSinAsignar.length) {
    const n = e.highlightsSinAsignar;
    out.push({
      id: "highlight", nivel: "medio",
      titulo: "Asigna el Highlight de esta semana",
      detalle: n.length === 3 ? "Ninguna sede tiene su prioridad de la semana." : `Falta en ${n.join(" y ")}.`,
      href: "/grupo/highlight", accion: "Asignar",
    });
  }

  const pr = e.presupuesto;
  if (pr && pr.mesActualSinAprobar > 0) {
    out.push({
      id: "presupuesto-mes", nivel: "medio",
      titulo: "El presupuesto de este mes no está aprobado",
      detalle: `Falta en ${pr.mesActualSinAprobar} de ${pr.totalSedes} sedes: sin él, el control del mes no tiene contra qué comparar.`,
      href: "/grupo/presupuesto", accion: "Aprobar",
    });
  }
  if (pr && pr.siguienteSinAprobar > 0 && pr.diasRestantes <= DIAS_AVISO_PRESUPUESTO) {
    out.push({
      id: "presupuesto-siguiente", nivel: "medio",
      titulo: `Aprueba el presupuesto de ${MESES[Number(pr.mesSiguiente.slice(5, 7)) - 1]}`,
      detalle: `Faltan ${pr.diasRestantes} ${pr.diasRestantes === 1 ? "día" : "días"} para que empiece y no está aprobado en ${pr.siguienteSinAprobar} de ${pr.totalSedes} sedes.`,
      href: "/grupo/presupuesto", accion: "Aprobar",
    });
  }

  const atrasadas = e.sedes.filter((s) => (s.diasSinRegistrar ?? 0) >= DIAS_SIN_REGISTRAR);
  if (atrasadas.length) {
    out.push({
      id: "registro", nivel: "medio",
      titulo: atrasadas.length === 1
        ? `${atrasadas[0].nombre}: faltan registrar ${atrasadas[0].diasSinRegistrar} días de ventas`
        : `Faltan registrar ventas en ${atrasadas.map((s) => s.nombre).join(" y ")}`,
      detalle: atrasadas.length === 1 ? "Sin esos días, el ritmo del mes y el punto de equilibrio salen más bajos de lo real."
        : atrasadas.map((s) => `${s.nombre} ${s.diasSinRegistrar} días`).join(" · "),
      href: atrasadas.length === 1 ? `/${atrasadas[0].code}/dashboard` : "/grupo/dashboard#sedes", accion: "Ver",
    });
  }

  if (e.cobrosAtelier && (e.cobrosAtelier.diasDesdeCarga === null || e.cobrosAtelier.diasDesdeCarga > DIAS_COBROS)) {
    out.push({
      id: "cobros-atelier", nivel: "medio",
      titulo: "Pide a Luis el reporte de cobros de Atelier",
      detalle: e.cobrosAtelier.diasDesdeCarga === null
        ? "Nunca se subió: no se sabe quién le debe a Atelier."
        : `El último es de hace ${e.cobrosAtelier.diasDesdeCarga} días (decía ${soles(e.cobrosAtelier.porCobrar)} por cobrar).`,
      href: "/atelier/panel", accion: "Ver cobros",
    });
  }

  if (e.excelPendiente) {
    out.push({ id: "excel", nivel: "medio", titulo: "Falta el Excel de Finanzas", detalle: e.excelPendiente, href: "#excel", accion: "Ver cargas" });
  }

  // Las diferencias con el Excel: un solo aviso, contado en CARGAS (sede y mes), igual que la pestaña Excel.
  const conDiferencias = e.cuadres.filter((c) => c.alertas > 0);
  if (conDiferencias.length) {
    const n = conDiferencias.length;
    out.push({
      id: "cuadre", nivel: "medio",
      titulo: `${n} ${n === 1 ? "carga del Excel" : "cargas del Excel"} con diferencias`,
      detalle: `${conDiferencias.map((c) => `${c.sede} ${MESES[Number(c.mes.slice(5, 7)) - 1]}`).join(", ")}. Conviene aclararlas antes de confiar en el cierre.`,
      href: "#excel", accion: "Revisar",
    });
  }

  const orden: Record<Nivel, number> = { alto: 0, medio: 1 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}
