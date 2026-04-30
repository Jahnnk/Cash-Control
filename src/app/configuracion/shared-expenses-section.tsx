"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Handshake } from "lucide-react";
import { createSharedRule, deactivateSharedRule, reactivateSharedRule, type SharedRule } from "@/app/actions/shared-expense-rules";

type CategoryOpt = { id: string; name: string };

export function SharedExpensesSection({ rules, categories }: { rules: SharedRule[]; categories: CategoryOpt[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [atelierPct, setAtelierPct] = useState("");
  const [fonaviPct, setFonaviPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-completar el otro % cuando se cambia uno
  function handleAtelier(v: string) {
    setAtelierPct(v);
    const n = parseFloat(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      setFonaviPct((100 - n).toFixed(2).replace(/\.?0+$/, ""));
    }
  }
  function handleFonavi(v: string) {
    setFonaviPct(v);
    const n = parseFloat(v);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      setAtelierPct((100 - n).toFixed(2).replace(/\.?0+$/, ""));
    }
  }

  async function handleCreate() {
    setError(null);
    if (!categoryId) { setError("Selecciona una categoría"); return; }
    const a = parseFloat(atelierPct), f = parseFloat(fonaviPct);
    if (!Number.isFinite(a) || !Number.isFinite(f)) { setError("Porcentajes inválidos"); return; }

    setSaving(true);
    const result = await createSharedRule({ categoryId, atelierPercentage: a, fonaviPercentage: f });
    setSaving(false);
    if (!result.success) { setError(result.error ?? "Error"); return; }

    setCategoryId(""); setAtelierPct(""); setFonaviPct("");
    setShowForm(false);
    router.refresh();
  }

  async function handleToggle(rule: SharedRule) {
    if (rule.active) {
      await deactivateSharedRule(rule.id);
    } else {
      await reactivateSharedRule(rule.id);
    }
    router.refresh();
  }

  const activeRules = rules.filter((r) => r.active);
  const inactiveRules = rules.filter((r) => !r.active);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-violet-600" />
          <h2 className="text-base font-semibold text-gray-900">Gastos compartidos con Fonavi</h2>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 flex items-center gap-1.5">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nueva regla"}
        </button>
      </div>

      <div className="p-6 space-y-4">
        <p className="text-xs text-gray-500">
          Define qué categorías se comparten y en qué porcentaje. Cuando registres un egreso de una categoría con regla activa, podrás marcarlo como compartido y se creará una cuenta por cobrar a Fonavi automáticamente.
        </p>

        {showForm && (
          <div className="bg-violet-50 border border-violet-100 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— Seleccionar —</option>
                  {categories
                    .filter((c) => !activeRules.some((r) => r.category_id === c.id))
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">% Atelier</label>
                <input type="number" step="0.01" min="0" max="100" value={atelierPct}
                  onChange={(e) => handleAtelier(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ej. 66.67" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">% Fonavi</label>
                <input type="number" step="0.01" min="0" max="100" value={fonaviPct}
                  onChange={(e) => handleFonavi(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ej. 33.33" />
              </div>
            </div>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex justify-end">
              <button onClick={handleCreate} disabled={saving}
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-light flex items-center gap-2 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear regla
              </button>
            </div>
          </div>
        )}

        {/* Reglas activas */}
        {activeRules.length === 0 ? (
          <div className="text-sm text-gray-500 text-center p-6 border border-dashed border-gray-200 rounded-lg">
            Sin reglas activas. Agrega una para empezar.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">Reglas activas</div>
            {activeRules.map((r) => (
              <div key={r.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                <div>
                  <div className="font-medium text-gray-900">{r.category_name}</div>
                  <div className="text-xs text-gray-500">
                    Atelier {r.atelier_percentage}% · Fonavi {r.fonavi_percentage}%
                  </div>
                </div>
                <button onClick={() => handleToggle(r)} className="text-xs text-red-600 hover:underline">
                  Desactivar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Reglas inactivas (histórico) */}
        {inactiveRules.length > 0 && (
          <details>
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              Reglas inactivas ({inactiveRules.length})
            </summary>
            <div className="mt-2 space-y-2">
              {inactiveRules.map((r) => (
                <div key={r.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 opacity-60">
                  <div>
                    <div className="text-sm">{r.category_name}</div>
                    <div className="text-xs text-gray-500">Atelier {r.atelier_percentage}% · Fonavi {r.fonavi_percentage}%</div>
                  </div>
                  <button onClick={() => handleToggle(r)} className="text-xs text-primary-light hover:underline">
                    Reactivar
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
