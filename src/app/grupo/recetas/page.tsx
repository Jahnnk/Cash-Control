import { RecetasClient } from "./recetas-client";
import { PreciosInsumos } from "./precios-insumos";
import { CartaCafeterias } from "./carta-cafeterias";
import { BotonExcelCarta } from "./boton-excel-carta";

/**
 * Grupo → Recetas y costos (solo dirección: el middleware bloquea /grupo a
 * las sesiones con alcance y cada action re-verifica). El Excel maestro
 * de pricing se sube ahora en Productos → Cargas; acá solo están las recetas, que
 * se pueden crear o modificar sin volver a subir el Excel.
 */
export default function RecetasPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold text-gray-900">Recetas y costos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Los precios de insumos, la carta de las cafeterías y las recetas de Atelier. Lo que cambias aquí vale sin volver a subir el Excel.
        </p>
        </div>
        <BotonExcelCarta />
      </div>
      <PreciosInsumos />
      <CartaCafeterias />
      <RecetasClient />
    </div>
  );
}
