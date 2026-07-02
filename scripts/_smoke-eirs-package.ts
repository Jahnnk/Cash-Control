/**
 * Smoke-test del Board Meeting Package con DATOS REALES (solo lectura).
 * Compila el Story UNA vez y genera los 3 artefactos en ~/Downloads.
 *
 *   npx tsx scripts/_smoke-eirs-package.ts atelier 2026-06
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

async function main() {
  const { collectUnitFacts } = await import("../src/app/actions/report-facts");
  const { compileStory } = await import("../src/lib/report/story-compiler");
  const { renderPdf } = await import("../src/lib/report/renderers/pdf");
  const { renderPptx } = await import("../src/lib/report/renderers/pptx");
  const { renderXlsx } = await import("../src/lib/report/renderers/xlsx");

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

  const out = join(homedir(), "Downloads");
  const artifacts = [renderPdf(story), await renderPptx(story), await renderXlsx(story)];
  for (const a of artifacts) {
    const buf = Buffer.from(await a.blob.arrayBuffer());
    writeFileSync(join(out, a.filename), buf);
    console.log(`✓ ${a.filename} (${Math.round(buf.length / 1024)} KB)`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
