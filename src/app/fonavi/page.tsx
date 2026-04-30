import { getFonaviReceivables } from "@/app/actions/fonavi-receivables";
import { FonaviClient } from "./fonavi-client";

export const dynamic = "force-dynamic";

export default async function FonaviPage() {
  const receivables = await getFonaviReceivables(true);
  return <FonaviClient initialReceivables={receivables} />;
}
