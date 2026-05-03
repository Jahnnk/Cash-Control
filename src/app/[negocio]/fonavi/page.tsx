import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getFonaviReceivables } from "@/app/actions/fonavi-receivables";
import { FonaviClient } from "./fonavi-client";

export const dynamic = "force-dynamic";

export default async function FonaviPage({
  params,
}: {
  params: Promise<{ negocio: string }>;
}) {
  const { negocio } = await params;
  // Cuentas por cobrar a Fonavi son exclusivas de Atelier.
  if (negocio !== "atelier") notFound();
  const receivables = await getFonaviReceivables(true);
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>}>
      <FonaviClient initialReceivables={receivables} />
    </Suspense>
  );
}
