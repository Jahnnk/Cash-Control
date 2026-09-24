import { RecetasClient } from "./recetas-client";

/**
 * Grupo → Recetas y costos (solo dirección: el middleware bloquea /grupo a
 * las sesiones con alcance y cada action re-verifica). Arriba el Excel
 * maestro de pricing; abajo las recetas, que se pueden crear o modificar
 * sin volver a subir el Excel.
 */
export default function RecetasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recetas y costos</h1>
        <p className="text-sm text-gray-500 mt-1">
          El costo en insumos de cada producto, preparación e insumo de Atelier. Es lo que usa el detalle de mermas.
        </p>
      </div>
      <RecetasClient />
    </div>
  );
}
