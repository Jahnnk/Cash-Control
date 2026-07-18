import { GroupIncentivesClient } from "./group-incentives-client";

/**
 * Grupo → Bonos e Incentivos: el panel CENTRAL del programa de ticket
 * promedio (solo dirección — el middleware ya bloquea /grupo a las
 * sesiones con alcance, y la action re-verifica con requireFullSession).
 */
export default function GrupoIncentivosPage() {
  return <GroupIncentivesClient />;
}
