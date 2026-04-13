import { getCategories } from "@/app/actions/categories";
import { getBudgets } from "@/app/actions/budgets";
import { CategoriesManager } from "./categories-manager";
import { BudgetConfig } from "./budget-config";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const [categories, budgets] = await Promise.all([
    getCategories(false),
    getBudgets(false),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
      <BudgetConfig budgets={budgets} />
      <CategoriesManager categories={categories} />
    </div>
  );
}
