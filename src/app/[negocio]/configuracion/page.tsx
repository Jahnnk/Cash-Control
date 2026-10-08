import { getCategories } from "@/app/actions/categories";
import { getSharedRules } from "@/app/actions/shared-expense-rules";
import { getBusinessInitialConfig } from "@/app/actions/business-config";
import { CategoriesManager } from "./categories-manager";
import { SharedExpensesSection } from "./shared-expenses-section";
import { InitialConfigSection } from "./initial-config-section";
import { ExcelImportButton } from "./excel-import-button";
import { SeccionDesplegable } from "@/components/productos/ui";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage({
  params,
}: {
  params: Promise<{ negocio: string }>;
}) {
  const { negocio } = await params;
  const isAtelier = negocio === "atelier";

  const [categories, sharedRules, initialConfig] = await Promise.all([
    getCategories(false),
    // Reglas compartidas solo aplican a Atelier; evitamos cargarlas en otro negocio.
    isAtelier ? getSharedRules() : Promise.resolve([]),
    // Configuración inicial NO aplica a Atelier — guard de servidor también.
    isAtelier ? Promise.resolve(null) : getBusinessInitialConfig(),
  ]);

  const activeCategories = (categories as Array<{ id: string; name: string; is_active?: boolean }>)
    .filter((c) => c.is_active !== false)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
      {/* Importación del Excel de Kelly: solo Fonavi/Centro (Atelier usa Byte POS). */}
      {!isAtelier && <ExcelImportButton negocio={negocio} />}
      {/* Rara vez se toca y mueve los saldos de apertura: plegada (UX, 8-oct-2026). */}
      {!isAtelier && initialConfig && (
        <SeccionDesplegable titulo="Configuración inicial del sistema" subtitulo="Fecha de inicio y saldos de apertura. Casi nunca se cambia.">
          <InitialConfigSection initial={initialConfig} />
        </SeccionDesplegable>
      )}
      {isAtelier && (
        <SharedExpensesSection rules={sharedRules} categories={activeCategories} />
      )}
      <CategoriesManager categories={categories} />
    </div>
  );
}
