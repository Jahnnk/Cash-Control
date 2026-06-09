/**
 * Reparto de un gasto compartido (Atelier ↔ Fonavi) entre los dos negocios.
 *
 * Dos modos:
 * - "percentage": como siempre, atelier = round(monto × %Atelier)/100 y Fonavi
 *   se lleva el resto. Puede perder/ganar 1 céntimo por redondeo (ej. 33.33% de
 *   2700 = 899.91, no 900).
 * - "fixed": montos fijos por negocio. La parte de Atelier es fija; Fonavi se
 *   lleva el resto del monto registrado. Con monto 2700 y Atelier fijo 1800 ⇒
 *   Fonavi 900.00 EXACTO. Si un mes el monto varía, Fonavi absorbe la diferencia
 *   (y el usuario puede ajustar a mano al registrar).
 *
 * Garantía en ambos modos: atelier + fonavi === monto, al céntimo.
 */
export type SharedSplitMode = "percentage" | "fixed";

export type SharedSplitRule = {
  splitMode: SharedSplitMode;
  atelierPercentage: number;
  fonaviPercentage: number;
  atelierFixed: number | null;
  fonaviFixed: number | null;
};

export type SharedSplitResult = { atelier: number; fonavi: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeSharedSplit(
  rule: Pick<SharedSplitRule, "splitMode" | "atelierPercentage" | "atelierFixed">,
  amount: number,
): SharedSplitResult {
  if (!Number.isFinite(amount) || amount <= 0) return { atelier: 0, fonavi: 0 };

  if (rule.splitMode === "fixed" && rule.atelierFixed != null) {
    // La parte de Atelier es fija (acotada a [0, monto]); Fonavi = resto.
    let atelier = round2(rule.atelierFixed);
    if (atelier < 0) atelier = 0;
    if (atelier > amount) atelier = round2(amount);
    const fonavi = round2(amount - atelier);
    return { atelier, fonavi };
  }

  // percentage (default) — idéntico al cálculo histórico.
  const atelier = Math.round(amount * rule.atelierPercentage) / 100;
  const fonavi = round2(amount - atelier);
  return { atelier, fonavi };
}

/**
 * Porcentajes implícitos a partir de montos fijos, para guardar en las columnas
 * atelier_percentage/fonavi_percentage (NOT NULL) cuando el modo es "fixed" y así
 * mantener compatibilidad con cualquier lectura legacy. Si el total es 0, cae a 50/50.
 */
export function impliedPercentagesFromFixed(
  atelierFixed: number,
  fonaviFixed: number,
): { atelierPercentage: number; fonaviPercentage: number } {
  const total = atelierFixed + fonaviFixed;
  if (total <= 0) return { atelierPercentage: 50, fonaviPercentage: 50 };
  const atelierPercentage = round2((atelierFixed / total) * 100);
  const fonaviPercentage = round2(100 - atelierPercentage);
  return { atelierPercentage, fonaviPercentage };
}
