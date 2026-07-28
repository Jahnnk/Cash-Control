import { UsersAdmin } from "./users-admin";
import { CutoffAdmin } from "./cutoff-admin";

/**
 * Grupo → Configuración: gestión de accesos del personal (solo
 * dirección — el middleware ya bloquea /grupo a las sesiones con
 * alcance, y cada action re-verifica con requireFullSession).
 */
export default function GrupoConfiguracionPage() {
  return (
    <div className="space-y-6">
      <UsersAdmin />
      <CutoffAdmin />
    </div>
  );
}
