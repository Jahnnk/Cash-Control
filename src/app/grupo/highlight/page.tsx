import { getHighlightGrupo } from "@/app/actions/highlight";
import { getToday } from "@/lib/utils";
import { HighlightConsole } from "./highlight-console";

export const dynamic = "force-dynamic";

export default async function HighlightPage() {
  const hoy = getToday();
  const data = await getHighlightGrupo(hoy);
  return <HighlightConsole inicial={data} hoy={hoy} />;
}
