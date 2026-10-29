import { getGroupDashboard } from "@/app/actions/grupo";
import { getFrescuraGrupo } from "@/app/actions/frescura";
import { getLiquidezGrupo } from "@/app/actions/liquidez";
import { getGroupVentasComparison } from "@/app/actions/group-ventas";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { getVerificacionKelly } from "@/app/actions/verificacion-kelly";
import { getSeisCifras } from "@/app/actions/seis-cifras";
import { getResumenExtra } from "@/app/actions/resumen-grupo";
import { fijosDelPlanAprobado } from "@/lib/fijos-plan-sql";
import { GrupoDashboardClient } from "./grupo-dashboard-client";

export const dynamic = "force-dynamic";

export default async function GrupoDashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string; pestana?: string }> }) {
  // ?mes=2026-09 → cómo nos fue ese mes. Sin parámetro: el mes en curso.
  const { mes: pedido, pestana } = await searchParams;
  // El mes en curso según Lima (getGroupDashboard usa UTC y a las 7 pm del
  // último día del mes ya diría "el mes siguiente"). Un mes futuro no existe.
  const mesActual = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) && pedido <= mesActual ? pedido : mesActual;
  const data = await getGroupDashboard(mes);
  const [be, ventas, frescura, liquidez, cuadre, cifras, extra, planFijos] = await Promise.all([
    getGroupBreakeven(data.selectedMonth),
    getGroupVentasComparison(data.selectedMonth),
    getFrescuraGrupo(),
    getLiquidezGrupo(),
    getVerificacionKelly(),
    getSeisCifras(data.selectedMonth),
    getResumenExtra(data.selectedMonth),
    // Los fijos que espera el presupuesto aprobado: con ellos se estima el EBITDA del mes abierto (lib/cada-100.ts).
    data.selectedMonth === mesActual ? fijosDelPlanAprobado(data.selectedMonth) : Promise.resolve({}),
  ]);
  return (
    <GrupoDashboardClient
      selectedMonth={data.selectedMonth}
      mesActual={mesActual}
      isCurrentMonth={data.selectedMonth === mesActual}
      summaries={data.summaries}
      totals={data.totals}
      breakeven={be.ok ? be.data : null}
      frescura={frescura}
      liquidez={liquidez}
      ventas={ventas.ok ? ventas.sedes : null}
      cuadreKelly={cuadre.ok ? cuadre.items : null}
      cifras={cifras.ok ? cifras.data : null}
      extra={extra}
      planFijos={planFijos}
      pestanaInicial={pestana === "equipo" ? "equipo" : pestana === "datos" || pestana === "gastos" || pestana === "kelly" ? "datos" : "resumen"}
    />
  );
}
