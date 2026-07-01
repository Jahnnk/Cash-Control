import { getDashboardData } from "@/app/actions/dashboard";
import { getCommandCenter, type CommandCenterData } from "@/app/actions/command-center";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ negocio: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ negocio }, sp] = await Promise.all([params, searchParams]);
  const mesParam = typeof sp.mes === "string" ? sp.mes : undefined;

  // El Centro de Comando siempre analiza el HOY (no el mes navegado). Si su
  // cálculo fallara por cualquier motivo, el dashboard clásico sigue vivo.
  const [data, command] = await Promise.all([
    getDashboardData(mesParam),
    getCommandCenter().catch((): CommandCenterData | null => null),
  ]);
  const isAtelier = negocio === "atelier";
  return (
    <DashboardClient data={data} command={command} negocio={negocio} isAtelier={isAtelier} />
  );
}
