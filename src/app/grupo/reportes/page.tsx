import { getGroupDashboard } from "@/app/actions/grupo";
import { GrupoReportesClient } from "./grupo-reportes-client";

export const dynamic = "force-dynamic";

export default async function GrupoReportesPage() {
  const data = await getGroupDashboard();
  return (
    <GrupoReportesClient
      selectedMonth={data.selectedMonth}
      isCurrentMonth={data.isCurrentMonth}
      summaries={data.summaries}
    />
  );
}
