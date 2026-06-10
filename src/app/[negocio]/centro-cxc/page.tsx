import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getFonaviReceivables } from "@/app/actions/fonavi-receivables";
import { FonaviClient } from "../fonavi/fonavi-client";

export const dynamic = "force-dynamic";

/**
 * Cuentas por cobrar a CENTRO — exclusiva de Atelier, sección separada de
 * Fonavi (decisión de Jahnn). Reusa el cliente generalizado del patrón
 * Fonavi con deudor = Centro (id 3).
 */
export default async function CentroCxcPage({
  params,
}: {
  params: Promise<{ negocio: string }>;
}) {
  const { negocio } = await params;
  if (negocio !== "atelier") notFound();
  const receivables = await getFonaviReceivables(true, 3);
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>}>
      <FonaviClient initialReceivables={receivables} debtor={{ id: 3, name: "Centro" }} />
    </Suspense>
  );
}
