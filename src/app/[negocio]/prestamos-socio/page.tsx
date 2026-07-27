import { notFound } from "next/navigation";
import { getLoansSummary } from "@/app/actions/loans";
import { getCapitalInjections } from "@/app/actions/capital";
import { LoansClient } from "./loans-client";

export const dynamic = "force-dynamic";

/**
 * Mini-feature exclusiva de Atelier — registro de préstamos personales
 * de Jahnn al negocio (caso aislado, no operación regular).
 */
export default async function PrestamosSocioPage({
  params,
}: {
  params: Promise<{ negocio: string }>;
}) {
  const { negocio } = await params;
  if (negocio !== "atelier") notFound();
  const [summary, capital] = await Promise.all([getLoansSummary(), getCapitalInjections()]);
  // Mismo cerebro que la tarjeta Capital del Dashboard (getCapitalInjections):
  // el total reconocido en acta jamás puede diferir entre pantallas.
  const capitalReconocido = capital.ok ? capital.data.totalTuyo : null;
  return <LoansClient summary={summary} capitalReconocido={capitalReconocido} />;
}
