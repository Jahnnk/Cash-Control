import { notFound } from "next/navigation";
import { PresupuestoVista } from "@/components/presupuesto/presupuesto-vista";

export const dynamic = "force-dynamic";

const SEDE: Record<string, number> = { atelier: 1, fonavi: 2, centro: 3 };

/** Presupuesto de una sede: su parte del presupuesto de la empresa (Grupo → Presupuesto tiene las tres). */
export default async function PresupuestoPage({ params }: { params: Promise<{ negocio: string }> }) {
  const { negocio } = await params;
  const id = SEDE[negocio];
  if (!id) notFound();
  return <PresupuestoVista sedeFija={id} />;
}
