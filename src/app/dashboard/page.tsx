import { getDashboardData } from "@/app/actions/dashboard";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  return <DashboardClient data={data} />;
}
