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
  trafficFloor: number;
  personasPorDia: number | null;
  trafficCumple: boolean;
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
  lines.push(
    `• Piso de tráfico (${s.trafficFloor}/día): ${
      s.trafficCumple
        ? `✓ cumpliendo (${s.personasPorDia}/día)`
        : `✗ vamos en ${s.personasPorDia ?? 0}/día — sin el piso, la meta no cuenta`
    }`,
  );
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
