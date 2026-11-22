"use client";

import { useMemo, useState } from "react";
import { Plus, Minus, X, Search } from "lucide-react";
import type { ProductoVale } from "@/app/actions/vales";
import { MAX_ITEMS, MAX_CANTIDAD, valorCarta } from "@/lib/vales";
import { formatCurrency } from "@/lib/utils";

/**
 * Armar el contenido de un vale (o de un premio del sorteo): se busca en la
 * carta, se agrega y se ajusta la cantidad. Lo comparten el vale suelto y cada
 * premio del sorteo, para que se armen igual.
 */
export type Elegido = { p: ProductoVale; cantidad: number };

export function SelectorProductos({
  productos, elegidos, onChange, compacto = false,
}: {
  productos: ProductoVale[];
  elegidos: Elegido[];
  onChange: (e: Elegido[]) => void;
  compacto?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");

  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    const ya = new Set(elegidos.map((e) => e.p.ref));
    return productos.filter((p) => !ya.has(p.ref) && (p.nombre.toLowerCase().includes(q) || p.seccion.toLowerCase().includes(q))).slice(0, 8);
  }, [busqueda, productos, elegidos]);

  const total = valorCarta(elegidos.map((e) => ({ cantidad: e.cantidad, precio: e.p.precio })));
  const lleno = elegidos.length >= MAX_ITEMS;

  function agregar(p: ProductoVale) {
    if (lleno) return;
    onChange([...elegidos, { p, cantidad: 1 }]);
    setBusqueda("");
  }
  function cambiarCantidad(ref: string, delta: number) {
    onChange(elegidos.map((e) => (e.p.ref === ref ? { ...e, cantidad: Math.min(MAX_CANTIDAD, Math.max(1, e.cantidad + delta)) } : e)));
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          disabled={lleno}
          placeholder={productos.length === 0 ? "Cargando carta…" : lleno ? `Máximo ${MAX_ITEMS} productos` : "Busca: capuccino, sánguche, torta…"}
          className={`w-full border border-gray-300 rounded-lg pl-9 pr-3 text-sm disabled:bg-gray-50 ${compacto ? "py-1.5" : "py-2"}`}
        />
      </div>
      {sugerencias.length > 0 && (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-auto bg-white">
          {sugerencias.map((p) => (
            <button key={p.ref} type="button" onClick={() => agregar(p)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50">
              <span className="text-sm text-gray-900">{p.nombre} <span className="text-xs text-gray-400">· {p.seccion}</span></span>
              <span className="text-xs text-gray-500 shrink-0">{formatCurrency(p.precio)}</span>
            </button>
          ))}
        </div>
      )}
      {busqueda.trim() && sugerencias.length === 0 && productos.length > 0 && !lleno && (
        <div className="text-xs text-gray-500">No encuentro ese producto en la carta.</div>
      )}

      {elegidos.length > 0 && (
        <ul className="space-y-1.5">
          {elegidos.map(({ p, cantidad }) => (
            <li key={p.ref} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{p.nombre}</div>
                <div className="text-xs text-gray-500">{formatCurrency(p.precio)} c/u</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={() => cambiarCantidad(p.ref, -1)} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-50" aria-label="Menos"><Minus className="w-3.5 h-3.5" /></button>
                <span className="w-6 text-center text-sm font-semibold">{cantidad}</span>
                <button type="button" onClick={() => cambiarCantidad(p.ref, 1)} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-50" aria-label="Más"><Plus className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => onChange(elegidos.filter((e) => e.p.ref !== p.ref))} className="p-1.5 rounded-md text-gray-400 hover:text-red-600" aria-label="Quitar"><X className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
          <li className="text-xs text-gray-600 text-right">Valor en carta: <strong>{formatCurrency(total)}</strong></li>
        </ul>
      )}
    </div>
  );
}

/** Lo que se manda al servidor: solo el producto y la cantidad (precios y nombres los pone el servidor). */
export function itemsParaEmitir(e: Elegido[]): { ref: string; cantidad: number }[] {
  return e.map((x) => ({ ref: x.p.ref, cantidad: x.cantidad }));
}

export function resumenElegidos(e: Elegido[]): string {
  return e.map((x) => `${x.cantidad} ${x.p.nombre}`).join(" + ");
}
