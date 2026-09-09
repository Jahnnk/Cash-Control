import { getGroupDashboard } from "@/app/actions/grupo";
import { getFrescuraGrupo } from "@/app/actions/frescura";
import { GrupoReportesClient } from "./grupo-reportes-client";

export const dynamic = "force-dynamic";

export default async function GrupoReportesPage() {
  // En paralelo: la frescura no debe retrasar el reporte, y si falla
  // la página sale igual (getFrescuraGrupo devuelve null, nunca lanza).
  const [data, frescura] = await Promise.all([getGroupDashboard(), getFrescuraGrupo()]);
  return (
    <GrupoReportesClient
      selectedMonth={data.selectedMonth}
      isCurrentMonth={data.isCurrentMonth}
      summaries={data.summaries}
      frescura={frescura}
    />
  );
}
