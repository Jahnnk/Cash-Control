import { getDashboardData } from "@/app/actions/dashboard";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const mesParam = typeof sp.mes === "string" ? sp.mes : undefined;
  const data = await getDashboardData(mesParam);
  return <DashboardClient data={data} />;
}
