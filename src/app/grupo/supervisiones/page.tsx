import { getConsolaSupervision } from "@/app/actions/supervisiones";
import { getToday } from "@/lib/utils";
import { SupervisionesConsole } from "./supervisiones-console";

export const dynamic = "force-dynamic";

export default async function SupervisionesPage() {
  const hoy = getToday();
  const r = await getConsolaSupervision(hoy.slice(0, 7));
  if (!r.ok) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">{r.error}</div>
    );
  }
  return <SupervisionesConsole inicial={r.data} hoy={hoy} />;
}
