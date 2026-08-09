import { getGroupDashboard, getDataFreshness, getKellyLoadStatus } from "@/app/actions/grupo";
import { getGroupVentasComparison } from "@/app/actions/group-ventas";
import { listDataCutoffs } from "@/app/actions/data-cutoff";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { getClientSalesAnalisis } from "@/app/actions/client-sales";
import { GrupoDashboardClient } from "./grupo-dashboard-client";

export const dynamic = "force-dynamic";

export default async function GrupoDashboardPage() {
  const data = await getGroupDashboard();
  const [be, freshness, ventas, kellyLoads, clientes] = await Promise.all([
    getGroupBreakeven(data.selectedMonth),
    getDataFreshness(),
    getGroupVentasComparison(),
    getKellyLoadStatus(),
    getClientSalesAnalisis(),
  ]);
  const cutoffs = await listDataCutoffs();
  return (
    <GrupoDashboardClient
      selectedMonth={data.selectedMonth}
      isCurrentMonth={data.isCurrentMonth}
      summaries={data.summaries}
      totals={data.totals}
      breakeven={be.ok ? be.data : null}
      freshness={freshness}
      ventas={ventas.ok ? ventas.sedes : null}
      kellyLoads={kellyLoads}
      cutoffs={cutoffs.ok ? cutoffs.sedes : null}
      clientes={clientes}
    />
  );
}
