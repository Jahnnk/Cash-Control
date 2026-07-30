import { DireccionClient } from "./direccion-client";

export const dynamic = "force-dynamic";

/**
 * Grupo → Sistema de Dirección (ASDR CORE). Solo dirección: el
 * middleware ya bloquea /grupo a las sesiones con alcance y cada
 * action re-verifica con requireFullSession.
 */
export default function DireccionPage() {
  return <DireccionClient />;
}
