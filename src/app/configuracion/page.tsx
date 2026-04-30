import { getCategories } from "@/app/actions/categories";
import { getBudgets } from "@/app/actions/budgets";
import { getSharedRules } from "@/app/actions/shared-expense-rules";
import { CategoriesManager } from "./categories-manager";
import { BudgetConfig } from "./budget-config";
import { SharedExpensesSection } from "./shared-expenses-section";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const [categories, budgets, sharedRules] = await Promise.all([
    getCategories(false),
    getBudgets(false),
    getSharedRules(),
  ]);

  const activeCategories = (categories as Array<{ id: string; name: string; is_active?: boolean }>)
    .filter((c) => c.is_active !== false)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
      <SharedExpensesSection rules={sharedRules} categories={activeCategories} />
      <BudgetConfig budgets={budgets} />
      <CategoriesManager categories={categories} />
    </div>
  );
}
