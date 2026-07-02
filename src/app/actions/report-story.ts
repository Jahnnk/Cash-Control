"use server";

/**
 * EIRS · Punto de entrada del Board Meeting Package: hechos → cerebro →
 * Story listo para los renderers del cliente. Una sola compilación por
 * generación — PDF/PPT/Excel siempre cuentan la misma historia.
 */

import { getReportFacts } from "./report-facts";
import { compileStory } from "@/lib/report/story-compiler";
import type { ReportStory } from "@/lib/report/types";

export async function getReportStory(input: {
  scope: "unit" | "group";
  unitId?: number;
  month: string; // YYYY-MM
}): Promise<ReportStory> {
  const facts = await getReportFacts(input);
  return compileStory(facts);
}
