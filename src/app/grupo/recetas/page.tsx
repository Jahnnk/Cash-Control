import { RecetasClient } from "./recetas-client";
import Link from "next/link";
import { CartaCafeterias } from "./carta-cafeterias";
import { BotonExcelCarta } from "./boton-excel-carta";
import { ProduccionVsExcel } from "./produccion-vs-excel";
import { NuevaReceta } from "./nueva-receta";
import { RecetasCafeteria } from "./recetas-cafeteria";

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
          La carta de las cafeterías, las recetas de Atelier y las de las cafeterías. Lo que cambias aquí vale sin volver a subir el Excel.
        </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotonExcelCarta />
          <NuevaReceta />
        </div>
      </div>
      {/* Los precios de insumos y la conexión con Producción viven en su propia pantalla desde el 24-nov-2026. */}
      <Link href="/grupo/insumos" className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3 hover:bg-gray-50 sm:px-6">
        <span>
          <span className="block text-[15px] font-semibold text-gray-900">Insumos y packaging</span>
          <span className="block text-xs text-gray-500">Precios, categorías, críticos y conexión con Producción están ahora en Grupo → Insumos y packaging.</span>
        </span>
        <span className="text-sm font-medium text-primary">Abrir →</span>
      </Link>
      <CartaCafeterias />
      <RecetasClient />
      <RecetasCafeteria />
      <ProduccionVsExcel />
    </div>
  );
}
