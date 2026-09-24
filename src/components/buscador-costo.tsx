"use client";

/**
 * Campo de texto con buscador de la lista de costos (Excel de pricing +
 * recetas del sistema). Lo usan el detalle de mermas y el editor de recetas.
 */

import { useEffect, useId, useRef, useState } from "react";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";

export const TIPO_COSTO: Record<CostoPreparacion["tipo"], string> = { producto: "producto", preparacion: "preparación", insumo: "insumo" };

export const soles4 = (n: number) => `S/${n < 0.1 ? n.toFixed(4) : n.toFixed(2)}`;

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
export function BuscadorCosto({ value, elegido, catalogo, onTexto, onElegir, placeholder = "ej. Cookie XL" }: {
  placeholder?: string;
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
        placeholder={placeholder}
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
                <span className="block text-xs text-gray-900">
                  {o.nombre}
                  {o.origen === "sistema" && <span className="ml-1.5 text-[10px] text-primary font-medium">· receta del sistema</span>}
                </span>
                <span className="block text-[10px] text-gray-500">{TIPO_COSTO[o.tipo]}{o.categoria ? ` · ${o.categoria.toLowerCase()}` : ""}</span>
              </span>
              <span className="text-[11px] tabular-nums text-gray-600 whitespace-nowrap">{soles4(o.costo)} / {o.unidad}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

