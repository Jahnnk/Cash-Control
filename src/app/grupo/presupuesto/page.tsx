import { getPanelGasto } from "@/app/actions/puedo-gastar";
import { getFrescuraGrupo } from "@/app/actions/frescura";
import { BandaFrescura } from "@/components/banda-frescura";
import { SeccionDesplegable } from "@/components/productos/ui";
import { PresupuestoVista } from "@/components/presupuesto/presupuesto-vista";
import { PanelGastoCard } from "./panel-gasto";

export const dynamic = "force-dynamic";

/**
 * Grupo → Presupuesto (rediseño del 6-oct-2026, capítulo «El presupuesto»): empresa → sede →
 * área → categoría, Presupuestado / Real / Variación / % de ejecución, y el plan del mes.
 *
 * Abajo, plegado, sigue el panel «¿Podemos asumir este gasto?» (la refrigeradora de Atelier,
 * 9-sep-2026): es para un gasto imprevisto, no para el plan del mes.
 */
export default async function GrupoPresupuestoPage() {
  const [panel, frescura] = await Promise.all([getPanelGasto(), getFrescuraGrupo()]);
  return (
    <div className="space-y-5">
      {frescura && <BandaFrescura frescura={frescura} />}
      <PresupuestoVista />
      <div className="max-w-6xl">
        <SeccionDesplegable
          titulo="¿Podemos asumir un gasto que no estaba en el plan?"
          subtitulo="Para una urgencia (un equipo que se malogra): cuánta plata hay, cuánto entra y si alcanza."
        >
          {panel.ok ? <PanelGastoCard inicial={panel.data} /> : <p className="text-sm text-red-700">{panel.error}</p>}
        </SeccionDesplegable>
      </div>
    </div>
  );
}
