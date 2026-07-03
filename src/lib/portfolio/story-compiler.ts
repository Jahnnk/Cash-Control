/**
 * PIC · Compilador del PortfolioStory — UNA sola compilación por consulta.
 * Facts → Intelligence → Narrative (la firma fuerza la separación:
 * buildPortfolioNarrative recibe SOLO la inteligencia).
 */

import type { PortfolioFacts, PortfolioStory } from "./types";
import { compilePortfolioIntelligence } from "./intelligence";
import { buildPortfolioNarrative } from "./narrative";

export function compilePortfolioStory(facts: PortfolioFacts): PortfolioStory {
  const intelligence = compilePortfolioIntelligence(facts);
  const narrative = buildPortfolioNarrative(intelligence);
  return {
    meta: {
      title: facts.scope.businessName,
      month: facts.month,
      monthLabel: facts.monthLabel,
      generatedAt: facts.generatedAt,
      confidential: true,
    },
    facts,
    intelligence,
    narrative,
  };
}
