import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getFonaviReceivables } from "@/app/actions/fonavi-receivables";
import { ReceivablesTabs } from "./receivables-tabs";

export const dynamic = "force-dynamic";

/**
 * "Por cobrar" — exclusiva de Atelier. Un solo ítem de menú con pestañas
 * Fonavi | Centro (cada local es una sección independiente con el mismo
 * patrón completo: marcar cobrado, reembolso en efectivo/transferencia/
 * yape, historial).
 */
export default async function PorCobrarPage({
  params,
}: {
  params: Promise<{ negocio: string }>;
}) {
  const { negocio } = await params;
  if (negocio !== "atelier") notFound();
  const [fonavi, centro] = await Promise.all([
    getFonaviReceivables(true, 2),
    getFonaviReceivables(true, 3),
  ]);
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>}>
      <ReceivablesTabs fonaviReceivables={fonavi} centroReceivables={centro} />
    </Suspense>
  );
}
