import { Suspense } from "react";
import { getFonaviReceivables } from "@/app/actions/fonavi-receivables";
import { FonaviClient } from "./fonavi-client";

export const dynamic = "force-dynamic";

export default async function FonaviPage() {
  const receivables = await getFonaviReceivables(true);
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>}>
      <FonaviClient initialReceivables={receivables} />
    </Suspense>
  );
}
