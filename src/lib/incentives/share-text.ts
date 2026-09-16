/**
 * Resumen COMPARTIBLE del programa de incentivos — lógica PURA.
 *
 * Una sola fuente del mensaje: el panel central del Grupo (dirección) y
 * el Panel de Sede (admins, que son la cara del programa ante los
 * asesores) generan EXACTAMENTE el mismo texto para su alcance. Si el
 * mensaje del admin y el de Jahnn dijeran cosas distintas, la
 * transparencia se rompe — que es justo lo que el bloque combate.
 */

export type SedeShareInput = {
  sede: string;
  daysLoaded: number;
  ticketActual: number | null;
  ticketBase: number;
  nivelAlcanzado: string | null;
  proximoNivel: { nombre: string; faltaSoles: number } | null;
  /** null = la política del mes no tiene piso de tráfico. */
  trafficFloor: number | null;
  personasPorDia: number | null;
  trafficCumple: boolean;
  /** Candado de ventas del mes (desde octubre 2026). null = no aplica. */
  candadoVentas?: { meta: number | null; ventas: number; proyeccion: number | null; cumple: boolean; enCamino: boolean; provisional: boolean; vinculante?: boolean } | null;
  /**
   * Supervisiones de Juani del mes (tercer activador desde octubre 2026).
   * null = no aplica / sin datos.
   */
  supervision?: { estado: "sin_visitas" | "al_dia" | "pendiente" | "incumplido"; visitas: number; enPlazo: number; porConfirmar: number; fueraDePlazo: number } | null;
  /**
   * true = el mes todavía se paga con las reglas anteriores y ventas y
   * supervisiones se muestran como práctica (setiembre 2026).
   */
  practica?: boolean;
  /** Ganador del mejor vendedor (el del desayuno) — null sin ranking. */
  mejorVendedor: string | null;
  /** Fin del periodo del ranking (YYYY-MM-DD) para fechar el podio. */
  mvPeriodEnd: string | null;
};

const ddmm = (iso: string | null): string => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

/** Líneas de UNA sede (sin encabezado ni cierre). */
export function buildSedeShareLines(s: SedeShareInput): string[] {
  if (s.ticketActual === null) {
    return [`${s.sede.toUpperCase()}: aún sin días registrados este mes.`];
  }
  const lines: string[] = [];
  lines.push(`${s.sede.toUpperCase()} (${s.daysLoaded} día${s.daysLoaded === 1 ? "" : "s"} registrado${s.daysLoaded === 1 ? "" : "s"})`);
  lines.push(`• Ticket promedio: S/${s.ticketActual.toFixed(2)} — base S/${s.ticketBase.toFixed(2)}`);
  if (s.nivelAlcanzado) {
    lines.push(`• 🎉 Nivel alcanzado: ${s.nivelAlcanzado}`);
  }
  if (s.proximoNivel) {
    lines.push(`• Para ${s.proximoNivel.nombre}: faltan S/${s.proximoNivel.faltaSoles.toFixed(2)} de ticket (¡se puede!)`);
  }
  if (s.trafficFloor !== null) {
    lines.push(
      `• Piso de tráfico (${s.trafficFloor}/día): ${
        s.trafficCumple
          ? `✓ cumpliendo (${s.personasPorDia}/día)`
          : `✗ vamos en ${s.personasPorDia ?? 0}/día — sin el piso, la meta no cuenta`
      }`,
    );
  }
  const cv = s.candadoVentas;
  if (cv && cv.meta !== null) {
    const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
    lines.push(
      `• Meta de ventas del mes${cv.provisional ? " (provisional)" : ""}: ${soles(cv.meta)} — vamos ${soles(cv.ventas)}${
        cv.cumple
          ? " ✓ cubierta"
          : cv.enCamino
            ? ` (al ritmo actual cerramos en ${soles(cv.proyeccion ?? 0)} ✓)`
            : ` (al ritmo actual cerramos en ${soles(cv.proyeccion ?? 0)}: hay que acelerar${s.practica ? "" : " — sin esta meta no hay bono"})`
      }${s.practica ? " · práctica: cuenta desde octubre" : ""}`,
    );
  }
  const sup = s.supervision;
  if (sup) {
    const practica = s.practica ? " · práctica: cuenta desde octubre" : "";
    const texto =
      sup.estado === "sin_visitas" ? "sin visitas este mes ✓"
      : sup.estado === "al_dia" ? `al día ✓ (${sup.visitas} visita${sup.visitas === 1 ? "" : "s"})`
      : sup.estado === "pendiente"
        ? [sup.enPlazo > 0 ? `${sup.enPlazo} crítica(s) por corregir en 24 h` : null, sup.porConfirmar > 0 ? `${sup.porConfirmar} esperando confirmación de Juani` : null].filter(Boolean).join(" · ")
        : `✗ ${sup.fueraDePlazo} crítica(s) no se corrigieron a tiempo${s.practica ? "" : " — este mes no hay bono"}`;
    lines.push(`• Supervisiones de Juani: ${texto}${practica}`);
  }
  if (s.mejorVendedor) {
    lines.push(`• ☕ Mejor vendedor (va ganando el desayuno): ${s.mejorVendedor}${s.mvPeriodEnd ? ` (al ${ddmm(s.mvPeriodEnd)})` : ""}`);
  }
  return lines;
}

/** Cierre común: fija la cultura del programa. */
export const SHARE_FOOTER =
  "Los bonos se calculan con estos mismos números y se pagan con la liquidación del cierre de mes. Cualquier duda, pregunten — aquí no hay letra chica. 💪";

export function buildShareHeader(monthLabelText: string, corteDdmm: string): string {
  return `🏆 Avance de Bonos e Incentivos · ${monthLabelText} (corte ${corteDdmm})`;
}
