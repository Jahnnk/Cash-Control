import { getGroupDashboard, getKellyLoadStatus } from "@/app/actions/grupo";
import { getFrescuraGrupo } from "@/app/actions/frescura";
import { getLiquidezGrupo } from "@/app/actions/liquidez";
import { getGroupVentasComparison } from "@/app/actions/group-ventas";
import { getGroupBreakeven } from "@/app/actions/breakeven";
import { getAtelierB2BResumen } from "@/app/actions/atelier-b2b";
import { getVerificacionKelly } from "@/app/actions/verificacion-kelly";
import { getSeisCifras } from "@/app/actions/seis-cifras";
import { GrupoDashboardClient } from "./grupo-dashboard-client";

export const dynamic = "force-dynamic";

export default async function GrupoDashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  // ?mes=2026-09 → cómo nos fue ese mes. Sin parámetro: el mes en curso.
  const { mes: pedido } = await searchParams;
  // El mes en curso según Lima (getGroupDashboard usa UTC y a las 7 pm del
  // último día del mes ya diría "el mes siguiente"). Un mes futuro no existe.
  const mesActual = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) && pedido <= mesActual ? pedido : mesActual;
  const data = await getGroupDashboard(mes);
  const [be, ventas, kellyLoads, atelierB2B, frescura, liquidez, cuadre, cifras] = await Promise.all([
    getGroupBreakeven(data.selectedMonth),
    getGroupVentasComparison(data.selectedMonth),
    getKellyLoadStatus(),
    getAtelierB2BResumen(),
    getFrescuraGrupo(),
    getLiquidezGrupo(),
    getVerificacionKelly(),
    getSeisCifras(data.selectedMonth),
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
      kellyLoads={kellyLoads}
      atelierB2B={atelierB2B}
      cuadreKelly={cuadre.ok ? cuadre.items : null}
      cifras={cifras.ok ? cifras.data : null}
    />
  );
}
