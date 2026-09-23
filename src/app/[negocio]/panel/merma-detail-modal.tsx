"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X, Plus, Trash2, Loader2, Save, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getMermaItems,
  saveMermaDetail,
  getMermasMonthSummary,
  type MermaItem,
  type MermaMonthSummary,
} from "@/app/actions/mermas";
import { useToast } from "@/components/toast-provider";
import { getCatalogoCostos } from "@/app/actions/costos-preparaciones";
import {
  costoPorUnidadRegistrada,
  unidadSugerida,
  UNIDADES_REGISTRO,
  type CostoPreparacion,
} from "@/lib/costos-preparaciones";

const MOTIVOS = ["Merma de calidad", "Vencimiento", "Error de preparación", "Daño en almacén", "Otro"];
const ACCIONES = ["Descarte", "Reproceso", "Consumo interno", "Donación", "Otro"];

type Row = {
  producto: string;
  cantidad: string;
  unidad: string;
  costoUnit: string;
  motivo: string;
  accion: string;
  /** Ítem de la lista de costos del Excel de pricing; null = escrito a mano. */
  item: CostoPreparacion | null;
};

const emptyRow = (): Row => ({ producto: "", cantidad: "", unidad: "", costoUnit: "", motivo: MOTIVOS[0], accion: ACCIONES[0], item: null });

const TIPO: Record<CostoPreparacion["tipo"], string> = { producto: "producto", preparacion: "preparación", insumo: "insumo" };

/** Costo por la unidad en que se registra: de la lista, o el escrito a mano. */
function costoDeFila(r: Row): number | null {
  if (r.item) return costoPorUnidadRegistrada(r.item, r.unidad);
  const u = Number(r.costoUnit);
  return r.costoUnit && Number.isFinite(u) ? u : null;
}

function rowTotal(r: Row): number | null {
  const c = Number(r.cantidad);
  const u = costoDeFila(r);
  if (!r.cantidad || u === null || !Number.isFinite(c)) return null;
  return Math.round(c * u * 100) / 100;
}

/** Una sola fila por encima de esto casi siempre es una unidad equivocada. */
const ALERTA_FILA = 300;

const soles4 = (n: number) => `S/${n < 0.1 ? n.toFixed(4) : n.toFixed(2)}`;

const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Hasta 8 ítems que contienen todas las palabras escritas. Primero los que
 * empiezan igual y, entre ellos, el nombre más corto: "frosting choco" tiene
 * que dar "Frosting de Chocolate" (por kg) antes que su manga de 250 g.
 */
function buscar(lista: CostoPreparacion[], texto: string): CostoPreparacion[] {
  const q = sinTildes(texto).trim();
  if (!q) return [];
  const palabras = q.split(/\s+/);
  const orden = { producto: 0, preparacion: 1, insumo: 2 };
  return lista
    .filter((i) => palabras.every((p) => sinTildes(i.nombre).includes(p)))
    .sort((a, b) => {
      const empieza = (i: CostoPreparacion) => (sinTildes(i.nombre).startsWith(q) ? 0 : 1);
      return empieza(a) - empieza(b) || a.nombre.length - b.nombre.length || orden[a.tipo] - orden[b.tipo];
    })
    .slice(0, 8);
}

/**
 * Campo de producto con buscador de la lista de costos. La lista se dibuja
 * "fixed" para que no la corte el scroll horizontal de la tabla.
 */
function BuscadorCosto({ value, elegido, catalogo, onTexto, onElegir }: {
  value: string;
  elegido: boolean;
  catalogo: CostoPreparacion[];
  onTexto: (t: string) => void;
  onElegir: (item: CostoPreparacion) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const opciones = abierto && !elegido ? buscar(catalogo, value) : [];

  function ubicar() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 300) });
  }

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    window.addEventListener("resize", cerrar);
    document.addEventListener("scroll", cerrar, true);
    return () => { window.removeEventListener("resize", cerrar); document.removeEventListener("scroll", cerrar, true); };
  }, [abierto]);

  function elegir(item: CostoPreparacion) {
    onElegir(item);
    setAbierto(false);
  }

  return (
    <>
      <input
        ref={ref}
        value={value}
        onChange={(e) => { onTexto(e.target.value); setActivo(0); ubicar(); setAbierto(true); }}
        onFocus={() => { ubicar(); setAbierto(true); }}
        onBlur={() => setAbierto(false)}
        onKeyDown={(e) => {
          if (opciones.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, opciones.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); elegir(opciones[activo] ?? opciones[0]); }
          else if (e.key === "Escape") setAbierto(false);
        }}
        placeholder="ej. Cookie XL"
        role="combobox"
        aria-expanded={opciones.length > 0}
        aria-controls={listaId}
        aria-autocomplete="list"
        className={`w-full border rounded px-2 py-1 ${elegido ? "border-primary-200 bg-primary-50/40" : "border-gray-200"}`}
      />
      {opciones.length > 0 && pos && (
        <ul
          id={listaId}
          role="listbox"
          className="fixed z-[60] bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-72 overflow-y-auto"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {opciones.map((o, k) => (
            <li
              key={o.ref}
              role="option"
              aria-selected={k === activo}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }}
              onMouseEnter={() => setActivo(k)}
              className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-3 ${k === activo ? "bg-primary-50" : ""}`}
            >
              <span className="min-w-0">
                <span className="block text-xs text-gray-900">{o.nombre}</span>
                <span className="block text-[10px] text-gray-500">{TIPO[o.tipo]}{o.categoria ? ` · ${o.categoria.toLowerCase()}` : ""}</span>
              </span>
              <span className="text-[11px] tabular-nums text-gray-600 whitespace-nowrap">{soles4(o.costo)} / {o.unidad}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
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
  const [catalogo, setCatalogo] = useState<CostoPreparacion[]>([]);

  useEffect(() => {
    (async () => {
      const [r, s, lista] = await Promise.all([
        getMermaItems(date),
        getMermasMonthSummary(date.slice(0, 7)),
        getCatalogoCostos(),
      ]);
      setCatalogo(lista);
      const porRef = new Map(lista.map((i) => [i.ref, i]));
      if (r.ok) {
        setTableReady(r.tableReady);
        if (r.items.length > 0) {
          setRows(
            r.items.map((it) => {
              // Si el ítem ya no está en la lista, queda con el costo que se guardó.
              const item = it.costoRef ? porRef.get(it.costoRef) ?? null : null;
              return {
                producto: it.producto,
                cantidad: String(it.cantidad),
                unidad: it.unidad ?? "",
                costoUnit: String(it.costoUnit),
                motivo: it.motivo ?? MOTIVOS[0],
                accion: it.accion ?? ACCIONES[0],
                item: item && costoPorUnidadRegistrada(item, it.unidad ?? "") !== null ? item : null,
              };
            }),
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

  /** Eligió un ítem de la lista: el costo y la unidad salen de ahí. */
  function elegirItem(i: number, item: CostoPreparacion) {
    setRow(i, { producto: item.nombre, item, unidad: unidadSugerida(item), costoUnit: "" });
  }

  /** Escribió a mano: si venía de la lista, deja de estarlo. */
  function setProducto(i: number, texto: string) {
    setRows((prev) => prev.map((r, j) => {
      if (j !== i) return r;
      return r.item ? { ...r, producto: texto, item: null, unidad: "", costoUnit: "" } : { ...r, producto: texto };
    }));
  }

  async function handleSave() {
    setSaving(true);
    const items: MermaItem[] = validRows.map((r) => ({
      producto: r.item ? r.item.nombre : r.producto.trim(),
      cantidad: Number(r.cantidad),
      unidad: r.unidad.trim() || null,
      costoUnit: costoDeFila(r)!,
      total: rowTotal(r)!,
      motivo: r.motivo,
      accion: r.accion,
      costoRef: r.item?.ref ?? null,
    }));
    const res = await saveMermaDetail({ date, items });
    setSaving(false);
    if (!res.ok) { showToast(res.error, "error"); return; }
    showToast(items.length === 0 ? "Detalle de mermas vaciado" : `Detalle guardado — mermas del día: ${formatCurrency(res.total)}`, "success");
    onSaved(res.total);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
              {catalogo.length > 0 ? (
                <p className="text-xs text-gray-500">
                  Escribe el producto, la preparación o el insumo y <strong>elígelo de la lista</strong>: el costo en
                  insumos sale solo del Excel de pricing (ej. 70 Cookie XL, 500 g de Frosting de Chocolate). Si no
                  está en la lista, escríbelo con su costo a mano. Al guardar, las mermas del día se actualizan con la suma.
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Registra <strong>qué</strong> se mermó, cuánto y a qué costo. Al guardar, el
                  importe de mermas del día se actualiza solo con la suma del detalle.
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
                      <th className="text-left px-2 py-2 font-medium min-w-[200px]">Producto / Insumo</th>
                      <th className="text-right px-2 py-2 font-medium w-20">Cantidad</th>
                      <th className="text-left px-2 py-2 font-medium w-20">Unidad</th>
                      <th className="text-right px-2 py-2 font-medium w-24">Costo S/</th>
                      <th className="text-right px-2 py-2 font-medium w-20">Total</th>
                      <th className="text-left px-2 py-2 font-medium w-40">Motivo</th>
                      <th className="text-left px-2 py-2 font-medium w-32">Acción</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-1 py-1">
                          {catalogo.length > 0 ? (
                            <BuscadorCosto value={r.producto} elegido={!!r.item} catalogo={catalogo}
                              onTexto={(t) => setProducto(i, t)} onElegir={(item) => elegirItem(i, item)} />
                          ) : (
                            <input value={r.producto} onChange={(e) => setProducto(i, e.target.value)}
                              placeholder="ej. Piña Golden" className="w-full border border-gray-200 rounded px-2 py-1" />
                          )}
                          {r.item && (
                            <div className="text-[10px] text-primary mt-0.5 px-0.5">
                              {TIPO[r.item.tipo]} · {soles4(r.item.costo)} por {r.item.unidad}
                            </div>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min="0" step="0.001" value={r.cantidad} onChange={(e) => setRow(i, { cantidad: e.target.value })}
                            placeholder="1" className="w-full border border-gray-200 rounded px-2 py-1 text-right" />
                        </td>
                        <td className="px-1 py-1">
                          {r.item ? (
                            <select value={r.unidad} onChange={(e) => setRow(i, { unidad: e.target.value })}
                              className="w-full border border-gray-200 rounded px-1.5 py-1 bg-white">
                              {UNIDADES_REGISTRO[r.item.unidad].map((u) => <option key={u}>{u}</option>)}
                            </select>
                          ) : (
                            <input value={r.unidad} onChange={(e) => setRow(i, { unidad: e.target.value })}
                              placeholder="kg" className="w-full border border-gray-200 rounded px-2 py-1" />
                          )}
                        </td>
                        <td className="px-1 py-1">
                          {r.item ? (
                            <div className="flex items-center justify-end gap-1 px-2 py-1 text-gray-700 tabular-nums" title="Costo en insumos del Excel de pricing">
                              <Lock className="w-3 h-3 text-gray-400" />
                              {costoDeFila(r) !== null ? soles4(costoDeFila(r)!) : "—"}
                            </div>
                          ) : (
                            <input type="number" min="0" step="0.01" value={r.costoUnit} onChange={(e) => setRow(i, { costoUnit: e.target.value })}
                              placeholder="8.20" className="w-full border border-gray-200 rounded px-2 py-1 text-right" />
                          )}
                        </td>
                        <td className="px-2 py-1 text-right font-medium text-gray-900 whitespace-nowrap">
                          {rowTotal(r) !== null ? formatCurrency(rowTotal(r)!) : "—"}
                          {(rowTotal(r) ?? 0) > ALERTA_FILA && (
                            <div className="text-[10px] font-normal text-amber-700" title="Revisa la cantidad y la unidad antes de guardar">
                              ¿revisaste la unidad?
                            </div>
                          )}
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
