import { getDashboardData } from "@/app/actions/dashboard";
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
  const data = await getDashboardData(mesParam);
  const isAtelier = negocio === "atelier";
  return <DashboardClient data={data} negocio={negocio} isAtelier={isAtelier} />;
}
