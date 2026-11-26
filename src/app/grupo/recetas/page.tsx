import { CartaCafeterias } from "./carta-cafeterias";
import { BotonExcelCarta } from "./boton-excel-carta";
import { ProduccionVsExcel } from "./produccion-vs-excel";
import { NuevaReceta } from "./nueva-receta";
import { SelectorRecetas } from "./selector-recetas";

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
          Las recetas de Atelier y de las cafeterías, y la carta. Lo que cambias aquí vale sin volver a subir el Excel.
        </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotonExcelCarta />
          <NuevaReceta />
        </div>
      </div>
      {/* Insumos y packaging tiene su propia pantalla (Grupo → Insumos): ya no se enlaza aquí (26-nov-2026). */}
      <SelectorRecetas />
      <CartaCafeterias />
      <ProduccionVsExcel />
    </div>
  );
}
