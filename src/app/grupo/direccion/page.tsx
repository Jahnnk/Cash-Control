import { MatrizDecisionClient } from "./matriz-decision-client";

export const dynamic = "force-dynamic";

/**
 * Grupo → Sistema de Dirección: la matriz de decisión (número → interpretación → acción).
 * Solo dirección: el middleware ya bloquea /grupo a las sesiones con alcance y cada
 * action re-verifica con requireFullSession.
 */
export default function DireccionPage() {
  return <MatrizDecisionClient />;
}
