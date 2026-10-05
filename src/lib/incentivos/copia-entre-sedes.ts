/**
 * ¿El día que se va a guardar es idéntico al de otra sede? · MOTOR (puro).
 *
 * Caso real (3-oct-2026): Fonavi quedó con la venta, las personas, los
 * ítems y el NPS exactos de Centro (S/1,483.70 · 56 · 133 · 9.25) y el deck
 * de la reunión lo mostró como si fuera de Fonavi. Dos sedes distintas no
 * venden al céntimo lo mismo con las mismas personas el mismo día: si pasa,
 * casi seguro es un número copiado, y se pide confirmar antes de guardarlo.
 */

export type DiaDeOtraSede = { revenue: number | null; personas: number | null };

const centimos = (n: number) => Math.round(n * 100);

/** Cuántas otras sedes tienen, ese mismo día, la misma venta (al céntimo) y las mismas personas. */
export function sedesConLosMismosNumeros(
  nuevo: { revenue: number; personas: number },
  otras: DiaDeOtraSede[],
): number {
  return otras.filter((o) =>
    o.revenue !== null && o.personas !== null
    && centimos(o.revenue) === centimos(nuevo.revenue)
    && o.personas === nuevo.personas,
  ).length;
}

export const AVISO_COPIA_ENTRE_SEDES =
  "Otra sede tiene registrados exactamente la misma venta y las mismas personas ese día. Dos sedes casi nunca coinciden al céntimo: puede que hayas copiado los números de la otra sede.";
