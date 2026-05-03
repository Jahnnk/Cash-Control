"use client";

import { useState } from "react";
import { updateBudget, createBudget } from "@/app/actions/budgets";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, ToggleLeft, ToggleRight } from "lucide-react";

type Budget = Record<string, unknown>;

const COST_TYPES = [
  { value: "fijo", label: "Fijo" },
  { value: "semi_fijo", label: "Semi-fijo" },
  { value: "variable", label: "Variable" },
];

export function BudgetConfig({ budgets }: { budgets: Budget[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ pct: "", green: "", yellow: "", type: "", desc: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [newData, setNewData] = useState({ name: "", pct: "0", type: "variable", traffic: true, desc: "" });
  const [saving, setSaving] = useState(false);

  const totalPct = budgets
    .filter((b) => b.is_active && b.has_traffic_light)
    .reduce((s, b) => s + parseFloat((b.budget_percentage as string) || "0"), 0);

  function startEdit(b: Budget) {
    setEditingId(b.id as string);
    setEditData({
      pct: String(b.budget_percentage),
      green: String(b.threshold_green),
      yellow: String(b.threshold_yellow),
      type: b.cost_type as string,
      desc: (b.description as string) || "",
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    await updateBudget(id, {
      budgetPercentage: parseFloat(editData.pct) || 0,
      thresholdGreen: parseInt(editData.green) || 70,
      thresholdYellow: parseInt(editData.yellow) || 90,
      costType: editData.type,
      description: editData.desc,
    });
    setEditingId(null);
    setSaving(false);
    router.refresh();
  }

  async function toggleActive(id: string, current: boolean) {
    await updateBudget(id, { isActive: !current });
    router.refresh();
  }

  async function handleCreate() {
    if (!newData.name.trim()) return;
    setSaving(true);
    await createBudget({
      categoryName: newData.name.trim(),
      budgetPercentage: parseFloat(newData.pct) || 0,
      costType: newData.type,
      hasTrafficLight: newData.traffic,
      description: newData.desc,
    });
    setNewData({ name: "", pct: "0", type: "variable", traffic: true, desc: "" });
    setShowAdd(false);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Presupuesto por categoría</h2>
          <p className="text-xs text-gray-500 mt-1">
            Total operativo: <span className={`font-bold ${totalPct > 100 ? "text-red-600" : "text-primary-light"}`}>{totalPct}%</span>
            {totalPct > 100 && <span className="text-red-600 ml-2">Excede 100%</span>}
            {totalPct <= 100 && <span className="text-gray-400 ml-2">→ Utilidad objetivo: {(100 - totalPct).toFixed(1)}%</span>}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-primary text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-primary/90 flex items-center gap-1"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? "Cancelar" : "Agregar"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <input type="text" value={newData.name} onChange={(e) => setNewData({ ...newData, name: e.target.value })}
              placeholder="Nombre categoría" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="number" value={newData.pct} onChange={(e) => setNewData({ ...newData, pct: e.target.value })}
              placeholder="Tope %" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <select value={newData.type} onChange={(e) => setNewData({ ...newData, type: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {COST_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
            <button onClick={handleCreate} disabled={!newData.name.trim() || saving}
              className="bg-primary text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-left">
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium text-center">Tope %</th>
              <th className="px-4 py-3 font-medium text-center">Tipo</th>
              <th className="px-4 py-3 font-medium text-center">Verde</th>
              <th className="px-4 py-3 font-medium text-center">Amarillo</th>
              <th className="px-4 py-3 font-medium text-center">Semáforo</th>
              <th className="px-4 py-3 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {budgets.map((b) => {
              const id = b.id as string;
              const isActive = b.is_active as boolean;
              const isEditing = editingId === id;

              return (
                <tr key={id} className={`${!isActive ? "opacity-40 bg-gray-50" : "hover:bg-gray-50"}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{b.category_name as string}</div>
                    {isEditing ? (
                      <input type="text" value={editData.desc} onChange={(e) => setEditData({ ...editData, desc: e.target.value })}
                        placeholder="Descripción" className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs" />
                    ) : (
                      <div className="text-xs text-gray-500">{(b.description as string) || "—"}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <input type="number" value={editData.pct} onChange={(e) => setEditData({ ...editData, pct: e.target.value })}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center" />
                    ) : (
                      <span className="font-medium">{b.has_traffic_light ? `${b.budget_percentage}%` : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing ? (
                      <select value={editData.type} onChange={(e) => setEditData({ ...editData, type: e.target.value })}
                        className="border border-gray-300 rounded px-2 py-1 text-xs">
                        {COST_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                      </select>
                    ) : (
                      <span className="text-xs">{COST_TYPES.find((t) => t.value === b.cost_type)?.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing && b.has_traffic_light ? (
                      <input type="number" value={editData.green} onChange={(e) => setEditData({ ...editData, green: e.target.value })}
                        className="w-14 border border-gray-300 rounded px-2 py-1 text-sm text-center" />
                    ) : (
                      <span className="text-xs text-gray-500">{b.has_traffic_light ? `${b.threshold_green}%` : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isEditing && b.has_traffic_light ? (
                      <input type="number" value={editData.yellow} onChange={(e) => setEditData({ ...editData, yellow: e.target.value })}
                        className="w-14 border border-gray-300 rounded px-2 py-1 text-sm text-center" />
                    ) : (
                      <span className="text-xs text-gray-500">{b.has_traffic_light ? `${b.threshold_yellow}%` : "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.has_traffic_light ? (
                      <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                    ) : (
                      <span className="text-xs text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(id)} className="text-primary-light hover:text-primary p-1">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-1">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(b)} className="text-gray-400 hover:text-gray-600 p-1">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => toggleActive(id, isActive)}
                            className={`p-1 ${isActive ? "text-primary-light" : "text-gray-400"}`}>
                            {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
