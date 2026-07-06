"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, Loader2, Save } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getMermaItems,
  saveMermaDetail,
  getMermasMonthSummary,
  type MermaItem,
  type MermaMonthSummary,
} from "@/app/actions/mermas";
import { useToast } from "@/components/toast-provider";

const MOTIVOS = ["Merma de calidad", "Vencimiento", "Error de preparación", "Daño en almacén", "Otro"];
const ACCIONES = ["Descarte", "Reproceso", "Consumo interno", "Donación", "Otro"];

type Row = {
  producto: string;
  cantidad: string;
  unidad: string;
  costoUnit: string;
  motivo: string;
  accion: string;
};

const emptyRow = (): Row => ({ producto: "", cantidad: "", unidad: "", costoUnit: "", motivo: MOTIVOS[0], accion: ACCIONES[0] });

function rowTotal(r: Row): number | null {
  const c = Number(r.cantidad);
  const u = Number(r.costoUnit);
  if (!r.cantidad || !r.costoUnit || !Number.isFinite(c) || !Number.isFinite(u)) return null;
  return Math.round(c * u * 100) / 100;
}

/**
 * Detalle de mermas del día: producto, cantidad, costo unitario, motivo
 * y acción — como el cuadro de Notion de Jahnn. Al guardar, el importe
 * de mermas del día se actualiza con la suma del detalle.
 */
export function MermaDetailModal({
  date,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  /** Recibe el nuevo total del día para refrescar el formulario. */
  onSaved: (total: number) => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tableReady, setTableReady] = useState(true);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [summary, setSummary] = useState<MermaMonthSummary | null>(null);

  useEffect(() => {
    (async () => {
      const [r, s] = await Promise.all([
        getMermaItems(date),
        getMermasMonthSummary(date.slice(0, 7)),
      ]);
      if (r.ok) {
        setTableReady(r.tableReady);
        if (r.items.length > 0) {
          setRows(
            r.items.map((it) => ({
              producto: it.producto,
              cantidad: String(it.cantidad),
              unidad: it.unidad ?? "",
              costoUnit: String(it.costoUnit),
              motivo: it.motivo ?? MOTIVOS[0],
              accion: it.accion ?? ACCIONES[0],
            })),
          );
        }
      }
      if (s.ok) setSummary(s.data);
      setLoading(false);
    })();
  }, [date]);

  const total = rows.reduce((s, r) => s + (rowTotal(r) ?? 0), 0);
  const validRows = rows.filter((r) => r.producto.trim() && rowTotal(r) !== null);

  function setRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setSaving(true);
    const items: MermaItem[] = validRows.map((r) => ({
      producto: r.producto.trim(),
      cantidad: Number(r.cantidad),
      unidad: r.unidad.trim() || null,
      costoUnit: Number(r.costoUnit),
      total: rowTotal(r)!,
      motivo: r.motivo,
      accion: r.accion,
    }));
    const res = await saveMermaDetail({ date, items });
    setSaving(false);
    if (!res.ok) { showToast(res.error, "error"); return; }
    showToast(items.length === 0 ? "Detalle de mermas vaciado" : `Detalle guardado — mermas del día: ${formatCurrency(res.total)}`, "success");
    onSaved(res.total);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Detalle de mermas · {date.slice(8)}/{date.slice(5, 7)}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Cargando…</div>
          ) : (
            <>
              {!tableReady && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Falta la migración de mermas (tabla merma_items) — avísale a Jahnn. Mientras tanto registra el importe total en el formulario del día.
                </div>
              )}
              <p className="text-xs text-gray-500">
                Registra <strong>qué</strong> se mermó, cuánto y a qué costo. Al guardar, el
                importe de mermas del día se actualiza solo con la suma del detalle.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
                      <th className="text-left px-2 py-2 font-medium">Producto / Insumo</th>
                      <th className="text-right px-2 py-2 font-medium w-20">Cantidad</th>
                      <th className="text-left px-2 py-2 font-medium w-16">Unidad</th>
                      <th className="text-right px-2 py-2 font-medium w-24">Costo S/</th>
                      <th className="text-right px-2 py-2 font-medium w-20">Total</th>
                      <th className="text-left px-2 py-2 font-medium w-36">Motivo</th>
                      <th className="text-left px-2 py-2 font-medium w-32">Acción</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-1 py-1">
                          <input value={r.producto} onChange={(e) => setRow(i, { producto: e.target.value })}
                            placeholder="ej. Piña Golden" className="w-full border border-gray-200 rounded px-2 py-1" />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min="0" step="0.001" value={r.cantidad} onChange={(e) => setRow(i, { cantidad: e.target.value })}
                            placeholder="1" className="w-full border border-gray-200 rounded px-2 py-1 text-right" />
                        </td>
                        <td className="px-1 py-1">
                          <input value={r.unidad} onChange={(e) => setRow(i, { unidad: e.target.value })}
                            placeholder="kg" className="w-full border border-gray-200 rounded px-2 py-1" />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min="0" step="0.01" value={r.costoUnit} onChange={(e) => setRow(i, { costoUnit: e.target.value })}
                            placeholder="8.20" className="w-full border border-gray-200 rounded px-2 py-1 text-right" />
                        </td>
                        <td className="px-2 py-1 text-right font-medium text-gray-900">
                          {rowTotal(r) !== null ? formatCurrency(rowTotal(r)!) : "—"}
                        </td>
                        <td className="px-1 py-1">
                          <select value={r.motivo} onChange={(e) => setRow(i, { motivo: e.target.value })}
                            className="w-full border border-gray-200 rounded px-1.5 py-1 bg-white">
                            {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <select value={r.accion} onChange={(e) => setRow(i, { accion: e.target.value })}
                            className="w-full border border-gray-200 rounded px-1.5 py-1 bg-white">
                            {ACCIONES.map((a) => <option key={a}>{a}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-1 text-center">
                          <button onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                            className="text-gray-300 hover:text-red-500 p-0.5" aria-label="Quitar fila">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                      <td className="px-2 py-2" colSpan={4}>Total del día</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(Math.round(total * 100) / 100)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <button
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar producto
              </button>

              {summary && summary.top.length > 0 && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                  <div className="text-xs font-semibold text-gray-900 mb-1.5">
                    Top mermas del mes ({formatCurrency(summary.totalMes)} en total)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {summary.top.map((t) => (
                      <span key={t.producto} className="text-[11px] rounded-full px-2.5 py-1 bg-white border border-gray-200 text-gray-700"
                        title={`${t.veces} registro${t.veces === 1 ? "" : "s"} · ${t.cantidad}${t.unidad ? ` ${t.unidad}` : ""}`}>
                        {t.producto} · {formatCurrency(t.total)}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1.5">
                    Con esto se ve qué insumos sufren más — el punto de partida para atacar la causa.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !tableReady || (validRows.length === 0 && rows.some((r) => r.producto.trim()))}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar detalle
          </button>
        </div>
      </div>
    </div>
  );
}
