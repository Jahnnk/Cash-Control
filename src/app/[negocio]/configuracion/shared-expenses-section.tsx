"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Handshake, Pencil } from "lucide-react";
import {
  createSharedRule,
  updateSharedRule,
  deactivateSharedRule,
  reactivateSharedRule,
  countExpensesForRule,
  type SharedRule,
} from "@/app/actions/shared-expense-rules";

type CategoryOpt = { id: string; name: string };

export function SharedExpensesSection({ rules, categories }: { rules: SharedRule[]; categories: CategoryOpt[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState<number>(0);

  const [categoryId, setCategoryId] = useState("");
  const [concept, setConcept] = useState("");
  const [splitMode, setSplitMode] = useState<"percentage" | "fixed">("percentage");
  const [atelierPct, setAtelierPct] = useState("");
  const [fonaviPct, setFonaviPct] = useState("");
  const [centroPct, setCentroPct] = useState("0");
  const [atelierFixed, setAtelierFixed] = useState("");
  const [fonaviFixed, setFonaviFixed] = useState("");
  const [centroFixed, setCentroFixed] = useState(""); // vacío = Centro no participa
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setCategoryId(""); setConcept(""); setAtelierPct(""); setFonaviPct(""); setCentroPct("0");
    setSplitMode("percentage"); setAtelierFixed(""); setFonaviFixed(""); setCentroFixed("");
    setError(null);
    setEditingId(null);
    setUsageCount(0);
  }

  // Suma en vivo de los 3 porcentajes (el server re-valida que sea 100)
  const pctSum = (parseFloat(atelierPct) || 0) + (parseFloat(fonaviPct) || 0) + (parseFloat(centroPct) || 0);

  async function startEdit(rule: SharedRule) {
    setEditingId(rule.id);
    setCategoryId(rule.category_id);
    setConcept(rule.concept);
    setSplitMode(rule.split_mode === "fixed" ? "fixed" : "percentage");
    setAtelierPct(String(rule.atelier_percentage));
    setFonaviPct(String(rule.fonavi_percentage));
    setCentroPct(String(rule.centro_percentage ?? 0));
    setAtelierFixed(rule.atelier_fixed != null ? String(rule.atelier_fixed) : "");
    setFonaviFixed(rule.fonavi_fixed != null ? String(rule.fonavi_fixed) : "");
    setCentroFixed(rule.centro_fixed != null ? String(rule.centro_fixed) : "");
    setShowForm(true);
    setError(null);
    // Cargar conteo de egresos vinculados
    const n = await countExpensesForRule(rule.id);
    setUsageCount(n);
  }

  async function handleSubmit() {
    setError(null);
    if (!categoryId) { setError("Selecciona una categoría"); return; }
    if (!concept.trim()) { setError("Escribe un concepto"); return; }

    const a = parseFloat(atelierPct), f = parseFloat(fonaviPct), c = parseFloat(centroPct) || 0;
    const af = parseFloat(atelierFixed), ff = parseFloat(fonaviFixed), cf = parseFloat(centroFixed);
    if (splitMode === "percentage" && (!Number.isFinite(a) || !Number.isFinite(f))) {
      setError("Porcentajes inválidos"); return;
    }
    if (splitMode === "fixed" && !Number.isFinite(af)) {
      setError("Ingresa el monto fijo de Atelier"); return;
    }

    const input = {
      categoryId,
      concept: concept.trim(),
      splitMode,
      atelierPercentage: a,
      fonaviPercentage: f,
      centroPercentage: c,
      atelierFixed: splitMode === "fixed" ? af : null,
      fonaviFixed: splitMode === "fixed" && Number.isFinite(ff) ? ff : null,
      centroFixed: splitMode === "fixed" && Number.isFinite(cf) ? cf : null,
    };

    setSaving(true);
    const result = editingId
      ? await updateSharedRule(editingId, input)
      : await createSharedRule(input);
    setSaving(false);
    if (!result.success) { setError(result.error ?? "Error"); return; }

    resetForm();
    setShowForm(false);
    router.refresh();
  }

  async function handleToggle(rule: SharedRule) {
    if (rule.active) await deactivateSharedRule(rule.id);
    else await reactivateSharedRule(rule.id);
    router.refresh();
  }

  function splitLabel(r: SharedRule): string {
    if (r.split_mode === "fixed") {
      const parts = [`Atelier S/${(r.atelier_fixed ?? 0).toFixed(2)}`];
      if (r.fonavi_fixed != null) parts.push(`Fonavi S/${r.fonavi_fixed.toFixed(2)}`);
      if (r.centro_fixed != null) parts.push(`Centro S/${r.centro_fixed.toFixed(2)}`);
      return `${parts.join(" · ")} (fijo)`;
    }
    const parts = [`${r.atelier_percentage}%`, `${r.fonavi_percentage}%`];
    if ((r.centro_percentage ?? 0) > 0) parts.push(`${r.centro_percentage}% Centro`);
    return parts.join(" / ");
  }

  // Agrupar reglas activas por categoría
  const activeRules = rules.filter((r) => r.active);
  const inactiveRules = rules.filter((r) => !r.active);
  const grouped = new Map<string, SharedRule[]>();
  for (const r of activeRules) {
    if (!grouped.has(r.category_name)) grouped.set(r.category_name, []);
    grouped.get(r.category_name)!.push(r);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Handshake className="w-5 h-5 text-violet-600" />
          <h2 className="text-base font-semibold text-gray-900">Gastos compartidos (Fonavi / Centro)</h2>
        </div>
        <button
          onClick={() => { if (showForm) { resetForm(); setShowForm(false); } else { setShowForm(true); } }}
          className="text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 flex items-center gap-1.5"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancelar" : "Nueva regla"}
        </button>
      </div>

      <div className="p-6 space-y-4">
        <p className="text-xs text-gray-500">
          Define qué gastos se comparten con Fonavi y/o Centro, y en qué proporción. Una categoría puede tener varias reglas (un concepto distinto cada una).
        </p>

        {showForm && (
          <div className="bg-violet-50 border border-violet-100 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-violet-900">
                {editingId ? "Editar regla" : "Nueva regla"}
              </div>
              {editingId && (
                <button onClick={() => { resetForm(); setShowForm(false); }} className="text-xs text-gray-600 hover:text-gray-900">
                  Cancelar edición
                </button>
              )}
            </div>

            {editingId && usageCount > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 text-xs text-amber-900">
                💡 Esta regla ya tiene <strong>{usageCount} {usageCount === 1 ? "egreso registrado" : "egresos registrados"}</strong>. Los cambios solo afectan futuros egresos; los existentes mantienen sus valores históricos.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— Seleccionar —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Concepto</label>
                <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="ej. Pago de luz" />
              </div>
            </div>

            {/* Modo de reparto */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Modo de reparto</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setSplitMode("percentage")}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border ${splitMode === "percentage" ? "border-violet-400 bg-violet-100 text-violet-900 font-medium" : "border-gray-300 bg-white text-gray-600"}`}>
                  Por porcentaje
                </button>
                <button type="button" onClick={() => setSplitMode("fixed")}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border ${splitMode === "fixed" ? "border-violet-400 bg-violet-100 text-violet-900 font-medium" : "border-gray-300 bg-white text-gray-600"}`}>
                  Por monto fijo
                </button>
              </div>
            </div>

            {splitMode === "percentage" ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">% Atelier</label>
                    <input type="number" step="0.01" min="0" max="100" inputMode="decimal" value={atelierPct}
                      onChange={(e) => setAtelierPct(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ej. 33.33" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">% Fonavi</label>
                    <input type="number" step="0.01" min="0" max="100" inputMode="decimal" value={fonaviPct}
                      onChange={(e) => setFonaviPct(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ej. 33.33" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">% Centro</label>
                    <input type="number" step="0.01" min="0" max="100" inputMode="decimal" value={centroPct}
                      onChange={(e) => setCentroPct(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0 = no participa" />
                  </div>
                </div>
                <div className={`text-xs font-medium ${Math.abs(pctSum - 100) < 0.005 ? "text-green-600" : "text-red-600"}`}>
                  {Math.abs(pctSum - 100) < 0.005 ? "✓ Suma 100%" : `Suma ${pctSum.toFixed(2)}% — debe ser 100%`}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monto fijo Atelier (S/)</label>
                  <input type="number" step="0.01" min="0" inputMode="decimal" value={atelierFixed}
                    onChange={(e) => setAtelierFixed(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="ej. 1800.00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monto fijo Fonavi (S/)</label>
                  <input type="number" step="0.01" min="0" inputMode="decimal" value={fonaviFixed}
                    onChange={(e) => setFonaviFixed(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="vacío = no participa" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monto fijo Centro (S/)</label>
                  <input type="number" step="0.01" min="0" inputMode="decimal" value={centroFixed}
                    onChange={(e) => setCentroFixed(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="vacío = no participa" />
                </div>
                <div className="sm:col-span-3 text-xs text-violet-700">
                  La parte de Atelier es fija; el último local participante absorbe el resto del monto registrado (Centro si participa; si no, Fonavi). Al registrar el gasto podrás ajustar los montos.
                </div>
              </div>
            )}
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex justify-end gap-2">
              {editingId && (
                <button onClick={() => { resetForm(); setShowForm(false); }} disabled={saving}
                  className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
                  Cancelar
                </button>
              )}
              <button onClick={handleSubmit} disabled={saving}
                className="bg-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-primary-light flex items-center gap-2 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Guardar cambios" : "Crear regla"}
              </button>
            </div>
          </div>
        )}

        {/* Reglas activas agrupadas */}
        {grouped.size === 0 ? (
          <div className="text-sm text-gray-500 text-center p-6 border border-dashed border-gray-200 rounded-lg">
            Sin reglas activas. Agrega una para empezar.
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([categoryName, group]) => (
              <div key={categoryName}>
                <div className="text-xs font-semibold text-gray-700 mb-1.5">{categoryName}:</div>
                <div className="space-y-1.5 pl-3">
                  {group.map((r) => (
                    <div key={r.id}
                      className={`flex items-center justify-between border rounded-lg p-2.5 ${
                        editingId === r.id ? "border-violet-300 bg-violet-50" : "border-gray-200"
                      }`}>
                      <div className="text-sm">
                        <span className="text-gray-900">{r.concept}</span>
                        <span className="text-gray-500 ml-2 text-xs">
                          ({splitLabel(r)})
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => startEdit(r)}
                          className="text-xs text-primary-light hover:underline flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" /> Editar
                        </button>
                        <button onClick={() => handleToggle(r)} className="text-xs text-red-600 hover:underline">
                          Desactivar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reglas inactivas */}
        {inactiveRules.length > 0 && (
          <details>
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
              Reglas inactivas ({inactiveRules.length})
            </summary>
            <div className="mt-2 space-y-2">
              {inactiveRules.map((r) => (
                <div key={r.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-2.5 opacity-60">
                  <div>
                    <div className="text-sm">{r.category_name} · {r.concept}</div>
                    <div className="text-xs text-gray-500">{splitLabel(r)}</div>
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
