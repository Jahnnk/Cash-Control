import Link from "next/link";
import { MatrizDecisionClient } from "./matriz-decision-client";
import { ControlMensualClient } from "./control-mensual-client";

export const dynamic = "force-dynamic";

const PESTANAS = [
  { id: "matriz", nombre: "Matriz de decisión" },
  { id: "control", nombre: "Control mensual" },
] as const;

/**
 * Grupo → Sistema de Dirección: dos pestañas.
 *   · Matriz de decisión: número → interpretación → acción para las preguntas del dueño.
 *   · Control mensual: la rutina semanal (lunes) y de cierre de mes, con su checklist.
 * Solo dirección: el middleware ya bloquea /grupo a las sesiones con alcance y cada
 * action re-verifica con requireFullSession.
 */
export default async function DireccionPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const activa = vista === "control" ? "control" : "matriz";
  return (
    <div className="space-y-5">
      <nav className="inline-flex rounded-xl bg-gray-100 p-1 gap-1" aria-label="Sistema de Dirección">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={p.id === "matriz" ? "/grupo/direccion" : "/grupo/direccion?vista=control"}
            aria-current={activa === p.id ? "page" : undefined}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activa === p.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
            {p.nombre}
          </Link>
        ))}
      </nav>
      {activa === "control" ? <ControlMensualClient /> : <MatrizDecisionClient />}
    </div>
  );
}
