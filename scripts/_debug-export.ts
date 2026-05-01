// Reproduce el error de getReportData ejecutándola directamente.
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import Module from "module";
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load = function (request: string, ...rest: unknown[]) {
  if (request === "next/cache") return { revalidatePath: () => {}, revalidateTag: () => {} };
  return originalLoad.call(this, request, ...rest);
};

async function main() {
  const { getReportData } = await import("../src/app/actions/export-report");
  const period = { start: "2026-04-01", end: "2026-04-30", label: "Abril 2026", isMonth: true };
  console.log("Llamando getReportData…");
  console.time("total");
  try {
    const data = await getReportData(period);
    console.timeEnd("total");
    console.log("✅ OK");
    console.log("hasData:", data.hasData);
    console.log("incomes:", data.incomes.length);
    console.log("expenses:", data.expenses.length);
    console.log("byCategory:", data.byCategory.length);
    console.log("cashFlow:", data.cashFlow.length);
    console.log("comparePrev:", !!data.comparePrev);
    console.log("summary:", data.summary);
  } catch (e) {
    console.timeEnd("total");
    console.error("❌ ERROR:", e);
    if (e instanceof Error) {
      console.error("stack:", e.stack);
    }
  }
}

main();
