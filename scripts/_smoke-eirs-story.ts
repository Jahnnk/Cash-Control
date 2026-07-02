/**
 * Smoke-test del cerebro EIRS con DATOS REALES (solo lectura).
 * Imprime la narrativa del Story de una unidad y mes dados.
 *
 *   npx tsx scripts/_smoke-eirs-story.ts atelier 2026-06
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { collectUnitFacts } = await import("../src/app/actions/report-facts");
  const { compileStory } = await import("../src/lib/report/story-compiler");

  const code = process.argv[2] ?? "atelier";
  const month = process.argv[3] ?? "2026-06";
  const units: Record<string, { id: number; code: string; name: string }> = {
    atelier: { id: 1, code: "atelier", name: "Yayi's Atelier" },
    fonavi: { id: 2, code: "fonavi", name: "Yayi's Fonavi" },
    centro: { id: 3, code: "centro", name: "Yayi's Centro" },
  };
  const unit = units[code];
  if (!unit) throw new Error(`unidad desconocida: ${code}`);

  const facts = await collectUnitFacts(unit, month);
  const story = compileStory({
    scope: { kind: "unit", unit },
    month,
    monthLabel: month,
    generatedAt: new Date().toISOString(),
    units: [facts],
  });

  const n = story.narrative;
  const i = story.intelligence.units[0];
  const line = (s: string) => console.log(s);

  line(`\n════════ ${story.meta.title} · ${month} · CONFIDENCIAL ════════`);
  line(`Portada: ${n.cover.statusLine}`);
  line(`\n— EXECUTIVE SUMMARY —`);
  line(`Cierre: ${n.executiveSummary.closing.text}`);
  if (n.executiveSummary.achievement) line(`Logro: ${n.executiveSummary.achievement.text}`);
  if (n.executiveSummary.problem) line(`Problema: ${n.executiveSummary.problem.text}`);
  if (n.executiveSummary.risk) line(`Riesgo: ${n.executiveSummary.risk.text}`);
  if (n.executiveSummary.opportunity) line(`Oportunidad: ${n.executiveSummary.opportunity.text}`);
  line(`\n— DECISIONES CLAVE —`);
  for (const d of n.executiveSummary.keyDecisions) line(d.text);
  line(`\n— ANÁLISIS DEL MES —`);
  for (const p of n.sections["month-analysis"]) line(`· ${p.text}`);
  line(`\n— RIESGOS (${i.risks.length}) —`);
  for (const p of n.sections.risks) line(`· ${p.text}`);
  line(`\n— PRESUPUESTO —`);
  for (const p of n.sections.budget) line(`· ${p.text}`);
  line(`\n— PROYECCIONES —`);
  for (const p of n.sections.projections) line(`· ${p.text}`);
  line(`\n— SCORECARD (${i.kpis.length} KPIs) —`);
  for (const k of i.kpis) {
    line(`  ${k.label}: ${k.value} ${k.unitSuffix} [${k.traffic}] — ${n.kpiComments[k.id]}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
