import { getHighlightGrupo } from "@/app/actions/highlight";
import { getHighlightActivo } from "@/app/actions/ajustes";
import { getSessionRole } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import { HighlightConsole } from "./highlight-console";
import { InterruptorHighlight } from "./interruptor-highlight";
import { AvisoMisAcuerdos } from "@/components/acuerdos/aviso-mis-acuerdos";

export const dynamic = "force-dynamic";

export default async function HighlightPage() {
  const hoy = getToday();
  const [data, activo, role] = await Promise.all([getHighlightGrupo(hoy), getHighlightActivo(), getSessionRole()]);
  // Juani entra aquí: sus avisos de acuerdos (vencidos, por confirmar) arriba, sin tener que ir a buscarlos.
  // Archivado (20-nov-2026): el aviso va arriba y la consola queda para consultar el historial.
  return (
    <div className="space-y-4">
      <AvisoMisAcuerdos />
      <InterruptorHighlight activo={activo} puedeCambiar={role?.kind === "full"} />
      <HighlightConsole inicial={data} hoy={hoy} />
    </div>
  );
}
