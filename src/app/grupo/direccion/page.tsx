import Link from "next/link";
import { MatrizDecisionClient } from "./matriz-decision-client";
import { PreciosClient } from "./precios-client";

export const dynamic = "force-dynamic";

const PESTANAS = [
  { id: "matriz", nombre: "Matriz de decisión" },
  { id: "precios", nombre: "Precios" },
] as const;

/**
 * Grupo → Sistema de Dirección: dos pestañas («Control mensual» se quitó el 18-nov-2026, pedido de Jahnn;
 * sus datos siguen en la base).
 *   · Matriz de decisión: número → interpretación → acción para las preguntas del dueño.
 *   · Precios: la subida de precios en tres pasos (¿ya toca?, qué subir, prueba en una sede).
 * Solo dirección: el middleware ya bloquea /grupo a las sesiones con alcance y cada
 * action re-verifica con requireFullSession.
 */
export default async function DireccionPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const activa = vista === "precios" ? "precios" : "matriz";
  return (
    <div className="space-y-5">
      <nav className="inline-flex rounded-xl bg-gray-100 p-1 gap-1" aria-label="Sistema de Dirección">
        {PESTANAS.map((p) => (
          <Link key={p.id} href={p.id === "matriz" ? "/grupo/direccion" : `/grupo/direccion?vista=${p.id}`}
            aria-current={activa === p.id ? "page" : undefined}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activa === p.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
            {p.nombre}
          </Link>
        ))}
      </nav>
      {activa === "precios" ? <PreciosClient /> : <MatrizDecisionClient />}
    </div>
  );
}
