import { getGroupDashboard, getDataFreshness } from "@/app/actions/grupo";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { GrupoDashboardClient } from "./grupo-dashboard-client";

export const dynamic = "force-dynamic";

export default async function GrupoDashboardPage() {
  const data = await getGroupDashboard();
  const [be, freshness] = await Promise.all([
    getGroupBreakeven(data.selectedMonth),
    getDataFreshness(),
  ]);
  return (
    <GrupoDashboardClient
      selectedMonth={data.selectedMonth}
      isCurrentMonth={data.isCurrentMonth}
      summaries={data.summaries}
      totals={data.totals}
      breakeven={be.ok ? be.data : null}
      freshness={freshness}
    />
  );
}
