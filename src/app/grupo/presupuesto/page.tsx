import { getPanelGasto } from "@/app/actions/puedo-gastar";
import { getFrescuraGrupo } from "@/app/actions/frescura";
import { PresupuestoClient } from "./presupuesto-client";

export const dynamic = "force-dynamic";

/**
 * Presupuesto del Grupo.
 *
 * Jahnn (10-sep-2026), sobre el panel "¿Podemos asumir este gasto?":
 * "no debería estar como protagonista en el dashboard, esto es algo
 * excepcional, tendríamos que tener sí un apartado de presupuestos y
 * ponerlo por ahí".
 *
 * Tiene razón: el dashboard responde "¿cómo vamos?" todos los días, y
 * un gasto imprevisto es una pregunta que aparece dos veces al año. Una
 * tarjeta que ocupa el lugar de honor para un caso excepcional le quita
 * sitio a lo que sí se mira a diario.
 */
export default async function GrupoPresupuestoPage() {
  const [panel, frescura] = await Promise.all([getPanelGasto(), getFrescuraGrupo()]);
  return (
    <PresupuestoClient
      panel={panel.ok ? panel.data : null}
      error={panel.ok ? null : panel.error}
      frescura={frescura}
    />
  );
}
