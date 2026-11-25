"use client";

/**
 * Insumos dentro de las recetas (pedido de Jahnn, 25-nov-2026):
 * - «Se compra por» también en gramos: se escribe cuántos g trae y cuánto cuesta, y se guarda el precio por kg
 *   (la lista de insumos siempre va por kg, litro o unidad).
 * - Editar el nombre y el precio de un insumo sin salir de la receta. Vale desde hoy en todo el sistema.
 */

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { guardarPrecioInsumo } from "@/app/actions/precios-insumos";
import { guardarFichaInsumo, marcarRevisado } from "@/app/actions/insumos";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";

import { ETIQUETA_COMPRA as ETIQUETA, comprasPara, num, precioPorBase, type Compra, type PrecioCompra } from "@/lib/precio-compra";

const campo = "mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900";

/** «Se compra por» + (si es por g, cuántos g) + precio. */
export function CamposPrecio({ valor, onCambio, opciones, onEnter }: {
  valor: PrecioCompra; onCambio: (v: PrecioCompra) => void; opciones: Compra[]; onEnter?: () => void;
}) {
  const base = precioPorBase(valor);
  return (
    <>
      <label className="text-[11px] text-gray-500">Se compra por
        <select value={valor.compra} onChange={(e) => onCambio({ ...valor, compra: e.target.value as Compra })} disabled={opciones.length < 2}
          className={`${campo} bg-white disabled:bg-gray-50`}>
          {opciones.map((o) => <option key={o} value={o}>{ETIQUETA[o]}</option>)}
        </select>
      </label>
      {valor.compra === "g" && (
        <label className="text-[11px] text-gray-500">¿Cuántos g trae?
          <input inputMode="decimal" value={valor.gramos} onChange={(e) => onCambio({ ...valor, gramos: e.target.value })} placeholder="ej. 500"
            onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }} className={campo} />
        </label>
      )}
      <label className="text-[11px] text-gray-500">{valor.compra === "g" ? `Precio de ${num(valor.gramos) > 0 ? `${valor.gramos} g` : "esa cantidad"}` : `Precio por ${ETIQUETA[valor.compra]}`} (S/)
        <input inputMode="decimal" value={valor.precio} onChange={(e) => onCambio({ ...valor, precio: e.target.value })} placeholder="ej. 1.50"
          onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }} className={campo} />
        {valor.compra === "g" && base && <span className="mt-0.5 block text-[10px] text-primary">= S/ {base.precio.toFixed(2)} por kg</span>}
      </label>
    </>
  );
}

/** Enlace «editar» + panel para cambiar el nombre y el precio de un insumo desde la receta. */
export function EditarInsumo({ item, origen, onGuardado }: {
  item: CostoPreparacion;
  origen: "Atelier" | "Cafetería";
  onGuardado: (cambio: { nombre: string; costo: number }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(item.nombre);
  const [precio, setPrecio] = useState<PrecioCompra>({ compra: item.unidad, gramos: "", precio: item.costo.toFixed(2) });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = () => {
    setNombre(item.nombre);
    setPrecio({ compra: item.unidad, gramos: "", precio: item.costo.toFixed(2) });
    setError(null);
    setAbierto(true);
  };

  async function guardar() {
    const base = precioPorBase(precio);
    const nom = nombre.replace(/\s+/g, " ").trim();
    if (nom.length < 2) { setError("Escribe el nombre."); return; }
    if (!base) { setError(precio.compra === "g" ? "Escribe cuántos g trae y su precio." : "Escribe un precio mayor que cero."); return; }
    setGuardando(true);
    setError(null);
    if (nom !== item.nombre) {
      const r = await guardarFichaInsumo({ origen, sku: item.ref, nombre: nom });
      if (!r.ok) { setGuardando(false); setError(r.error); return; }
    }
    const cambiaPrecio = Math.abs(base.precio - item.costo) > 0.00005;
    if (cambiaPrecio) {
      const r = await guardarPrecioInsumo({ origen, sku: item.ref, precio: base.precio });
      if (!r.ok) { setGuardando(false); setError(nom !== item.nombre ? `El nombre se guardó, el precio no: ${r.error}` : r.error); return; }
      // Cambiar el precio es revisarlo (igual que en Insumos y packaging).
      void marcarRevisado({ origen, sku: item.ref, revisado: true });
    }
    setGuardando(false);
    setAbierto(false);
    onGuardado({ nombre: nom, costo: cambiaPrecio ? base.precio : item.costo });
  }

  if (!abierto) {
    return (
      <button type="button" onClick={abrir} className="inline-flex items-center gap-0.5 text-primary underline decoration-dotted">
        <Pencil className="w-3 h-3" /> editar
      </button>
    );
  }
  return (
    <div className="mt-1.5 rounded-lg border border-primary/30 bg-emerald-50/40 p-2.5 space-y-2 text-xs">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="text-[11px] text-gray-500">Nombre
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo}
            onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") setAbierto(false); }} />
        </label>
        <CamposPrecio valor={precio} onCambio={setPrecio} opciones={comprasPara(item.unidad)} onEnter={() => void guardar()} />
      </div>
      <p className="text-[11px] text-gray-500">Vale desde hoy en todo el sistema: recetas, carta e Insumos y packaging. La categoría y cómo se compra (lata, bolsa…) se cambian en Insumos y packaging.</p>
      {error && <p className="text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void guardar()} disabled={guardando}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-primary rounded-lg disabled:opacity-50">
          {guardando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Guardar
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="px-3 py-1.5 text-gray-600">Cancelar</button>
      </div>
    </div>
  );
}
