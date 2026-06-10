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
// ───────────────────────── Reparto a 3 locales ─────────────────────────

export type ThreeWayRule = {
  splitMode: SharedSplitMode;
  atelierPercentage: number;
  fonaviPercentage: number;
  /** 0 = Centro no participa (reglas históricas quedan idénticas). */
  centroPercentage: number;
  atelierFixed: number | null;
  fonaviFixed: number | null;
  /** null = Centro no participa en modo fijo. */
  centroFixed: number | null;
};

export type ThreeWaySplit = { atelier: number; fonavi: number; centro: number };

/**
 * Reparto entre Atelier/Fonavi/Centro (cualquier combinación).
 *
 * Garantía: atelier + fonavi + centro === monto, al céntimo. El ÚLTIMO
 * participante (Centro si participa; si no, Fonavi) absorbe el residuo
 * de redondeo — con Centro sin participar el resultado es IDÉNTICO al
 * reparto a 2 vías histórico (computeSharedSplit).
 *
 * - percentage: Atelier y Fonavi por su %, el absorbedor toma el resto.
 * - fixed: Atelier fijo; Fonavi fijo (si Centro participa); el absorbedor
 *   toma el resto del monto registrado.
 */
export function computeThreeWaySplit(rule: ThreeWayRule, amount: number): ThreeWaySplit {
  if (!Number.isFinite(amount) || amount <= 0) return { atelier: 0, fonavi: 0, centro: 0 };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

  const centroParticipates =
    rule.splitMode === "fixed" ? rule.centroFixed != null : rule.centroPercentage > 0;
  const fonaviParticipates =
    rule.splitMode === "fixed" ? rule.fonaviFixed != null : rule.fonaviPercentage > 0;

  // Parte de Atelier (misma fórmula histórica en ambos modos)
  let atelier: number;
  if (rule.splitMode === "fixed" && rule.atelierFixed != null) {
    atelier = clamp(r2(rule.atelierFixed), r2(amount));
  } else {
    atelier = Math.round(amount * rule.atelierPercentage) / 100;
  }

  let fonavi = 0;
  let centro = 0;
  if (centroParticipates && fonaviParticipates) {
    fonavi = rule.splitMode === "fixed"
      ? clamp(r2(rule.fonaviFixed ?? 0), r2(amount - atelier))
      : Math.round(amount * rule.fonaviPercentage) / 100;
    centro = r2(amount - atelier - fonavi); // Centro absorbe el residuo
  } else if (centroParticipates) {
    centro = r2(amount - atelier);          // solo Centro: absorbe todo el resto
  } else {
    fonavi = r2(amount - atelier);          // histórico: Fonavi absorbe (2 vías)
  }
  if (centro < 0) centro = 0;
  if (fonavi < 0) fonavi = 0;

  return { atelier, fonavi, centro };
}

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
