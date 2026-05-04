import { notFound } from "next/navigation";
import { getLoansSummary } from "@/app/actions/loans";
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
  const summary = await getLoansSummary();
  return <LoansClient summary={summary} />;
}
