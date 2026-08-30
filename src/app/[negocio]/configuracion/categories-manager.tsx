"use client";

import { useState } from "react";
import { createCategory, updateCategory, deleteCategory } from "@/app/actions/categories";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, ToggleLeft, ToggleRight, AlertTriangle } from "lucide-react";
import { effectiveCostGroup, type CostGroup } from "@/lib/cost-group";

type Category = Record<string, unknown>;

export function CategoriesManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    await createCategory(newName);
    setNewName("");
    setSaving(false);
    router.refresh();
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    await updateCategory(id, { name: editName });
    setEditingId(null);
    setSaving(false);
    router.refresh();
  }

  async function handleToggle(id: string, currentActive: boolean) {
    await updateCategory(id, { isActive: !currentActive });
    router.refresh();
  }

  async function handleToggleEbitda(id: string, currentExclude: boolean) {
    await updateCategory(id, { excludeFromEbitda: !currentExclude });
    router.refresh();
  }

  async function handleCostGroup(id: string, value: string) {
    await updateCategory(id, { costGroup: value === "" ? null : (value as CostGroup) });
    router.refresh();
  }

  // Señalador: activas, operativas (no excluidas del EBITDA) y sin grupo
  const unclassified = categories.filter((c) =>
    (c.is_active as boolean) &&
    effectiveCostGroup({
      excludeFromEbitda: !!c.exclude_from_ebitda,
      costGroup: (c.cost_group as string) || null,
    }) === "sin_clasificar",
  );

  async function handleDelete(id: string) {
    await deleteCategory(id);
    router.refresh();
  }
  void handleDelete;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Categorías de egresos</h2>
        <p className="text-sm text-gray-500 mt-1">Administra las categorías disponibles en el registro de egresos</p>
      </div>

      {/* Señalador de categorías sin clasificar (análisis Fijo/Variable) */}
      {unclassified.length > 0 && (
        <div className="mx-6 mt-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <strong>{unclassified.length} {unclassified.length === 1 ? "categoría sin clasificar" : "categorías sin clasificar"}</strong> para
            el análisis Fijo/Variable (no cuentan en ese reporte hasta asignarles grupo):{" "}
            <span className="font-medium">{unclassified.map((c) => c.name as string).join(", ")}</span>
          </div>
        </div>
      )}

      {/* Add new */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nueva categoría..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || saving}
            className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-gray-100">
        {categories.map((cat) => {
          const isActive = cat.is_active as boolean;
          const id = cat.id as string;
          const name = cat.name as string;

          return (
            <div
              key={id}
              className={`px-6 py-3 flex items-center justify-between ${!isActive ? "opacity-50 bg-gray-50" : ""}`}
            >
              {editingId === id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUpdate(id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdate(id)}
                    className="text-primary-light hover:text-primary p-1"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900">{name}</span>
                    {(cat.exclude_from_ebitda as boolean) && (
                      <span className="text-[10px] uppercase font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5" title="Excluida del cálculo de EBITDA">
                        No EBITDA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Financiamiento también está excluido del EBITDA, pero
                        sigue mostrando el selector: es una clasificación que
                        se elige, no una consecuencia de tildar la casilla. */}
                    {(cat.exclude_from_ebitda as boolean) && (cat.cost_group as string) !== "financiamiento" ? (
                      <span className="text-[11px] text-gray-400 px-1.5" title="Las categorías excluidas del EBITDA son No-operativas: quedan fuera del análisis Fijo/Variable">
                        No operativo
                      </span>
                    ) : (
                      <select
                        value={(cat.cost_group as string) || ""}
                        onChange={(e) => handleCostGroup(id, e.target.value)}
                        className={`text-[11px] border rounded-md px-1.5 py-1 bg-white ${
                          (cat.cost_group as string) === "fijo"
                            ? "border-sky-200 text-sky-700"
                            : (cat.cost_group as string) === "variable"
                              ? "border-emerald-200 text-emerald-700"
                              : (cat.cost_group as string) === "financiamiento"
                                ? "border-violet-200 text-violet-700"
                                : "border-amber-300 text-amber-700 bg-amber-50"
                        }`}
                        title="Grupo de costo para el análisis Fijo/Variable"
                      >
                        <option value="">Sin clasificar</option>
                        <option value="fijo">Fijo</option>
                        <option value="variable">Variable</option>
                        <option value="financiamiento">Financiamiento</option>
                      </select>
                    )}
                    <label className="text-[11px] text-gray-500 flex items-center gap-1 cursor-pointer" title="Si está marcada, no se considera operativa para el EBITDA">
                      <input type="checkbox"
                        checked={!!cat.exclude_from_ebitda}
                        onChange={() => handleToggleEbitda(id, !!cat.exclude_from_ebitda)}
                        className="rounded text-amber-600" />
                      Excluir EBITDA
                    </label>
                    <button
                      onClick={() => {
                        setEditingId(id);
                        setEditName(name);
                      }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggle(id, isActive)}
                      className={`p-1 ${isActive ? "text-primary-light" : "text-gray-400"}`}
                      title={isActive ? "Desactivar" : "Activar"}
                    >
                      {isActive ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
