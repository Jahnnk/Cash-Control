import { getHighlightGrupo } from "@/app/actions/highlight";
import { getToday } from "@/lib/utils";
import { HighlightConsole } from "./highlight-console";
import { AvisoMisAcuerdos } from "@/components/acuerdos/aviso-mis-acuerdos";

export const dynamic = "force-dynamic";

export default async function HighlightPage() {
  const hoy = getToday();
  const data = await getHighlightGrupo(hoy);
  // Juani entra aquí: sus avisos de acuerdos (vencidos, por confirmar) arriba, sin tener que ir a buscarlos.
  return (
    <div className="space-y-4">
      <AvisoMisAcuerdos />
      <HighlightConsole inicial={data} hoy={hoy} />
    </div>
  );
}
