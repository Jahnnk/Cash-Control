"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Link2, Loader2, Sparkles, Undo2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";
import { suggestMatches } from "@/lib/product-matching";
import {
  getUnmatchedSales,
  linkProductAlias,
  unlinkProductAlias,
  type UnmatchedProduct,
} from "@/app/actions/product-aliases";

/**
 * PIC · Vincular productos sin match con el catálogo (alias).
 * Un clic por producto, una sola vez: los meses cargados se re-vinculan
 * al instante y los imports futuros matchean solos. Con sugerencias
 * automáticas por similitud — la decisión final siempre es del dueño.
 */
export function LinkProductsModal({
  onClose,
  onLinked,
}: {
  onClose: () => void;
  onLinked: () => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [unmatched, setUnmatched] = useState<UnmatchedProduct[]>([]);
  const [catalog, setCatalog] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [linkedNow, setLinkedNow] = useState<{ nameRaw: string; productName: string }[]>([]);
  const [didChange, setDidChange] = useState(false);

  async function load() {
    setLoading(true);
    const r = await getUnmatchedSales();
    setUnmatched(r.unmatched);
    setCatalog(r.catalog);
    setLoading(false);
  }
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleLink(nameRaw: string, productId: string) {
    setBusy(nameRaw);
    const r = await linkProductAlias({ nameRaw, productId });
    setBusy(null);
    if (!r.ok) {
      showToast(r.error, "error");
      return;
    }
    const productName = catalog.find((c) => c.id === productId)?.name ?? "";
    setLinkedNow((prev) => [{ nameRaw, productName }, ...prev]);
    setUnmatched((prev) => prev.filter((u) => u.nameRaw !== nameRaw));
    setDidChange(true);
    showToast(`Vinculado (${r.relinkedRows} fila${r.relinkedRows === 1 ? "" : "s"} re-matcheada${r.relinkedRows === 1 ? "" : "s"})`, "success");
  }

  async function handleUndo(nameRaw: string) {
    const r = await unlinkProductAlias({ nameRaw });
    if (!r.ok) {
      showToast(r.error, "error");
      return;
    }
    setLinkedNow((prev) => prev.filter((l) => l.nameRaw !== nameRaw));
    setDidChange(true);
    await load();
    showToast("Vínculo deshecho", "success");
  }

  function close() {
    if (didChange) onLinked();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Vincular productos con el catálogo
          </h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            Estos nombres de Byte no coinciden con el catálogo del pricing-engine. Vincúlalos
            <strong> una sola vez</strong>: los meses ya cargados se corrigen al instante y los
            próximos imports los reconocerán solos. Si un producto no está en el catálogo,
            no lo fuerces — hay que costearlo en el pricing-engine.
          </p>

          {linkedNow.length > 0 && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 space-y-1">
              {linkedNow.slice(0, 5).map((l) => (
                <div key={l.nameRaw} className="flex items-center justify-between gap-2">
                  <span className="text-emerald-800 truncate">✓ {l.nameRaw} → {l.productName}</span>
                  <button onClick={() => handleUndo(l.nameRaw)} className="text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 shrink-0">
                    <Undo2 className="w-3 h-3" /> deshacer
                  </button>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Cargando…</div>
          ) : unmatched.length === 0 ? (
            <div className="p-8 text-center text-sm text-emerald-700">
              🎉 Todo vinculado: no quedan ventas sin match de catálogo.
            </div>
          ) : (
            <div className="space-y-3">
              {unmatched.map((u) => (
                <UnmatchedRow
                  key={u.nameRaw}
                  u={u}
                  catalog={catalog}
                  busy={busy === u.nameRaw}
                  onLink={(pid) => handleLink(u.nameRaw, pid)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UnmatchedRow({
  u,
  catalog,
  busy,
  onLink,
}: {
  u: UnmatchedProduct;
  catalog: { id: string; name: string; category: string | null }[];
  busy: boolean;
  onLink: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const suggestions = useMemo(() => suggestMatches(u.nameRaw, catalog, 3), [u.nameRaw, catalog]);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return catalog.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, catalog]);

  return (
    <div className="border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{u.nameRaw}</div>
          <div className="text-[11px] text-gray-500">
            {formatCurrency(u.totalRevenue)} en {u.months} mes{u.months === 1 ? "" : "es"} · {u.totalUnits} und
          </div>
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 shrink-0" />}
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Sparkles className="w-3 h-3 text-primary shrink-0" />
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => onLink(s.id)}
              disabled={busy}
              className="text-[11px] border border-primary/30 bg-primary/5 text-primary hover:bg-primary hover:text-white rounded-full px-2.5 py-1 transition-colors disabled:opacity-50"
              title={`Similitud ${(s.score * 100).toFixed(0)}%`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar otro producto del catálogo…"
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs"
        />
        {results.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => { onLink(c.id); setQuery(""); }}
                disabled={busy}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-primary/5 disabled:opacity-50"
              >
                {c.name} {c.category && <span className="text-gray-400">· {c.category}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
