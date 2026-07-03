/**
 * PIC · Matching de nombres de venta (Byte) contra el catálogo canónico
 * (lógica PURA). Los sistemas usan nombres distintos ("Y-EMPANADA MIXTA"
 * vs "Empanada mixta"): se normaliza fuerte y se compara exacto. Lo que
 * no matchea NO se pierde — queda con product_id NULL y sale en el
 * reporte de calidad de datos (regla BKE: ninguna venta se inventa ni
 * se descarta en silencio).
 */

/** Normalización fuerte: mayúsculas, sin tildes, sin prefijos de línea
 *  ("Y-", "P-"), sin etiquetas de estado de Byte ("[ELIMINADO …]"), sin
 *  sufijo de sede entre paréntesis ("(Fonavi)"), espacios colapsados y
 *  sin signos. Casos observados en los exports reales de jun-2026. */
export function normalizeProductName(name: string): string {
  return name
    .replace(/^\s*\[[^\]]*\]\s*/, "")      // "[ELIMINADO 2026-06-24 …] X" → "X"
    .replace(/\s*\([^)]*\)\s*$/, "")       // "Café Americano (Fonavi)" → "Café Americano"
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes fuera
    .toUpperCase()
    .replace(/^\s*[A-Z]\s*-\s*/, "") // prefijo de línea "Y-", "P- "
    .replace(/[^A-Z0-9]+/g, " ")     // signos → espacio
    .replace(/\s+/g, " ")
    .trim();
}

export type CatalogEntry = { id: string; name: string };

export type MatchResult<T extends { name: string }> = {
  matched: (T & { productId: string })[];
  unmatched: T[];
  /** Nombres del catálogo que colisionan tras normalizar (ambigüedad). */
  ambiguous: string[];
};

/**
 * Empareja items de venta contra el catálogo por nombre normalizado.
 * Los ALIAS (vínculos manuales del dueño) tienen prioridad sobre el
 * match automático y resuelven incluso los nombres ambiguos.
 */
export function matchSalesToCatalog<T extends { name: string }>(
  items: T[],
  catalog: CatalogEntry[],
  aliases?: Map<string, string>, // alias_normalized → productId
): MatchResult<T> {
  const byNorm = new Map<string, string | "AMBIGUO">();
  const ambiguous: string[] = [];
  for (const c of catalog) {
    const key = normalizeProductName(c.name);
    if (!key) continue;
    if (byNorm.has(key) && byNorm.get(key) !== c.id) {
      byNorm.set(key, "AMBIGUO");
      if (!ambiguous.includes(key)) ambiguous.push(key);
    } else {
      byNorm.set(key, c.id);
    }
  }

  const matched: (T & { productId: string })[] = [];
  const unmatched: T[] = [];
  for (const it of items) {
    const norm = normalizeProductName(it.name);
    const viaAlias = aliases?.get(norm);
    if (viaAlias) {
      matched.push({ ...it, productId: viaAlias });
      continue;
    }
    const hit = byNorm.get(norm);
    if (hit && hit !== "AMBIGUO") matched.push({ ...it, productId: hit });
    else unmatched.push(it);
  }
  return { matched, unmatched, ambiguous };
}

/**
 * Sugerencias para vincular un nombre sin match: similitud por tokens
 * (Jaccard) sobre los nombres normalizados. Devuelve el top ordenado.
 * Puro y determinista — la decisión final siempre es del dueño.
 */
export function suggestMatches(
  rawName: string,
  catalog: CatalogEntry[],
  top = 3,
): { id: string; name: string; score: number }[] {
  const tokens = new Set(normalizeProductName(rawName).split(" ").filter(Boolean));
  if (tokens.size === 0) return [];
  return catalog
    .map((c) => {
      const cTokens = new Set(normalizeProductName(c.name).split(" ").filter(Boolean));
      let inter = 0;
      for (const t of tokens) if (cTokens.has(t)) inter++;
      const union = tokens.size + cTokens.size - inter;
      return { id: c.id, name: c.name, score: union > 0 ? inter / union : 0 };
    })
    .filter((s) => s.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}
