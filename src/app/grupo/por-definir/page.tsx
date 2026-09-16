import { getPorDefinir } from "@/app/actions/por-definir";
import { PorDefinirClient } from "./por-definir-client";

export const dynamic = "force-dynamic";

export default async function PorDefinirPage() {
  const r = await getPorDefinir();
  if (!r.ok) {
    return <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">{r.error}</div>;
  }
  return <PorDefinirClient inicial={r.data} />;
}
