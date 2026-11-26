"use client";

/**
 * Lista de recetas ordenada por categorías, con un buscador general (pedido de Jahnn, 26-nov-2026: «en lugar de una
 * lista grande de todas las recetas mezcladas, que estén ordenadas por categorías, pero con un buscador que encuentre
 * de una»). Sin búsqueda: cada categoría es un grupo plegado con su cantidad; «Archivados» va al final. Con búsqueda:
 * todos los resultados juntos (también los archivados), con su categoría al lado.
 */

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Pastilla } from "@/components/productos/ui";

export type FilaLista = {
  clave: string;
  nombre: string;
  categoria: string | null;
  /** Texto extra donde buscar (nombre en la carta…). */
  buscar?: string;
  archivada: boolean;
  /** El contenido de la fila (nombre, costo, botones). */
  contenido: ReactNode;
};

export const ARCHIVADOS = "Archivados";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** «PANADERÍA» y «Panadería» son la misma; sin categoría = «Sin categoría». */
export function etiquetaCategoria(c: string | null | undefined): string {
  const t = (c ?? "").trim();
  if (!t) return "Sin categoría";
  if (t !== t.toUpperCase()) return t.charAt(0).toUpperCase() + t.slice(1);
  return t.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

export function ListaPorCategorias({ filas, orden = [], placeholder }: {
  filas: FilaLista[];
  /** Categorías que van primero, en este orden (el resto, alfabético). */
  orden?: string[];
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const palabras = sinTildes(q).trim().split(/\s+/).filter(Boolean);

  const grupos = useMemo(() => {
    const m = new Map<string, FilaLista[]>();
    for (const f of filas) {
      const g = f.archivada ? ARCHIVADOS : etiquetaCategoria(f.categoria);
      m.set(g, [...(m.get(g) ?? []), f]);
    }
    const pos = (g: string) => (g === ARCHIVADOS ? 999 : orden.findIndex((o) => sinTildes(o) === sinTildes(g)) + 1 || 500);
    return [...m.entries()]
      .map(([g, fs]) => [g, [...fs].sort((a, b) => a.nombre.localeCompare(b.nombre))] as const)
      .sort((a, b) => pos(a[0]) - pos(b[0]) || a[0].localeCompare(b[0]));
  }, [filas, orden]);

  const encontrados = palabras.length === 0 ? [] : filas
    .filter((f) => palabras.every((p) => sinTildes(`${f.nombre} ${f.buscar ?? ""}`).includes(p)))
    .sort((a, b) => Number(a.archivada) - Number(b.archivada) || a.nombre.localeCompare(b.nombre));

  const alternar = (g: string) => setAbiertos((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
          className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm" />
      </label>

      {palabras.length > 0 ? (
        <>
          <p className="text-[11px] text-gray-500">{encontrados.length === 1 ? "1 resultado" : `${encontrados.length} resultados`}</p>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {encontrados.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">Nada con ese nombre.</li>}
            {encontrados.map((f) => (
              <li key={f.clave} className="px-4 py-2.5">
                <div className="mb-0.5"><Pastilla tono={f.archivada ? "gris" : "azul"}>{f.archivada ? ARCHIVADOS : etiquetaCategoria(f.categoria)}</Pastilla></div>
                {f.contenido}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-2">
          {grupos.map(([g, fs]) => {
            const abierto = abiertos.has(g);
            return (
              <div key={g} className={`rounded-xl border ${g === ARCHIVADOS ? "border-dashed border-gray-300" : "border-gray-200"}`}>
                <button type="button" onClick={() => alternar(g)} aria-expanded={abierto}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-gray-50 rounded-xl">
                  <span className={`text-sm font-medium ${g === ARCHIVADOS ? "text-gray-500" : "text-gray-900"}`}>
                    {g} <span className="text-xs font-normal text-gray-400">· {fs.length}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
                </button>
                {abierto && (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {fs.map((f) => <li key={f.clave} className="px-4 py-2.5">{f.contenido}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
