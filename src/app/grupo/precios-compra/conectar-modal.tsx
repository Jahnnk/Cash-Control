"use client";

/** Conectar un producto comprado con un insumo de Recetas y costos (para «Usar en Recetas»). Solo dirección. */

import { useEffect, useId, useState, type ReactNode } from "react";
import { Link2, Loader2, Search, X } from "lucide-react";
import { conectarInsumo, type InsumoReceta, type ProductoComparable } from "@/app/actions/proveedores";
import type { EnlaceInsumo } from "@/lib/proveedores-sql";
import { useToast } from "@/components/toast-provider";
import { factorInsumo, type OrigenInsumo } from "@/lib/proveedores";

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const campo = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-light focus:outline-none focus:ring-2 focus:ring-primary-light/20";

export function Modal({ titulo, onCerrar, children, pie }: { titulo: string; onCerrar: () => void; children: ReactNode; pie: ReactNode }) {
  const id = useId();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby={id} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <h2 id={id} className="text-base font-bold text-gray-900">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">{children}</div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">{pie}</footer>
      </div>
    </div>
  );
}



/* ─────────── Conectar un producto con un insumo ─────────── */

export function ConectarModal({ producto, insumos, enlaces, sedeId, onCerrar, onGuardado }: {
  producto: ProductoComparable; insumos: InsumoReceta[]; enlaces: EnlaceInsumo[]; sedeId: number; onCerrar: () => void; onGuardado: () => void;
}) {
  const { showToast } = useToast();
  const [origen, setOrigen] = useState<OrigenInsumo>(sedeId === 1 ? "Atelier" : "Cafetería");
  const [q, setQ] = useState(producto.nombre.split(/\s+/)[0] ?? "");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const yaConectado = enlaces.find((e) => e.productoId === producto.id && e.origen === origen);
  const t = sinTildes(q.trim());
  const lista = insumos
    .filter((i) => i.origen === origen && factorInsumo(producto.unidad, i.unidad) !== null && (!t || sinTildes(`${i.nombre} ${i.sku}`).includes(t)))
    .slice(0, 40);

  async function conectar(i: InsumoReceta) {
    setOcupado(i.sku);
    const r = await conectarInsumo({ productoId: producto.id, origen: i.origen, sku: i.sku });
    setOcupado(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`${producto.nombre} quedó conectado con «${i.nombre}»`, "success");
    onGuardado();
  }

  return (
    <Modal titulo={`Conectar «${producto.nombre}» con Recetas`} onCerrar={onCerrar}
      pie={<button type="button" onClick={onCerrar} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cerrar</button>}>
      <p className="text-xs text-gray-500">Elige el insumo que es este producto. Solo salen los que se miden igual (por {producto.unidad}). Puede estar en las dos listas.</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Lista de insumos">
        {(["Cafetería", "Atelier"] as const).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={origen === o} onClick={() => setOrigen(o)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${origen === o ? "border-primary bg-primary text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {o === "Atelier" ? "Insumos de Atelier" : "Insumos de cafeterías"}
          </button>
        ))}
      </div>
      {yaConectado && (
        <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary">
          Ya está conectado con «{insumos.find((i) => i.origen === yaConectado.origen && i.sku === yaConectado.sku)?.nombre ?? yaConectado.sku}». Elegir otro lo reemplaza.
        </p>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden />
        <input className={`${campo} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo" aria-label="Buscar insumo" />
      </div>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {lista.length === 0 && <li className="px-3 py-4 text-center text-xs text-gray-500">No hay insumos con ese nombre que se midan por {producto.unidad}.</li>}
        {lista.map((i) => (
          <li key={i.sku} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm text-gray-900">{i.nombre}</span>
              <span className="block text-[11px] text-gray-500">{i.sku} · S/ {i.precio.toLocaleString("es-PE", { maximumFractionDigits: 4 })} por {i.unidad}</span>
            </span>
            <button type="button" disabled={ocupado !== null} onClick={() => void conectar(i)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-light disabled:opacity-60">
              {ocupado === i.sku ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}Conectar
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
