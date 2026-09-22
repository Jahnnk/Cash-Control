import { getGroupDashboard, getKellyLoadStatus } from "@/app/actions/grupo";
import { getFrescuraGrupo } from "@/app/actions/frescura";
import { getLiquidezGrupo } from "@/app/actions/liquidez";
import { getGroupVentasComparison } from "@/app/actions/group-ventas";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { getAtelierB2BResumen } from "@/app/actions/atelier-b2b";
import { GrupoDashboardClient } from "./grupo-dashboard-client";

export const dynamic = "force-dynamic";

export default async function GrupoDashboardPage() {
  const data = await getGroupDashboard();
  const [be, ventas, kellyLoads, atelierB2B, frescura, liquidez] = await Promise.all([
    getGroupBreakeven(data.selectedMonth),
    getGroupVentasComparison(),
    getKellyLoadStatus(),
    getAtelierB2BResumen(),
    getFrescuraGrupo(),
    getLiquidezGrupo(),
  ]);
  return (
    <GrupoDashboardClient
      selectedMonth={data.selectedMonth}
      isCurrentMonth={data.isCurrentMonth}
      summaries={data.summaries}
      totals={data.totals}
      breakeven={be.ok ? be.data : null}
      frescura={frescura}
      liquidez={liquidez}
      ventas={ventas.ok ? ventas.sedes : null}
      kellyLoads={kellyLoads}
      atelierB2B={atelierB2B}
    />
  );
}
