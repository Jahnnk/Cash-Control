import { getCategories } from "@/app/actions/categories";
import { CategoriesManager } from "./categories-manager";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const categories = await getCategories(false);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
      <CategoriesManager categories={categories} />
    </div>
  );
}
