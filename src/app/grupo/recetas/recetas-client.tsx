"use client";

/**
 * Grupo → Recetas y costos: la lista de costos de Atelier (Excel de pricing
 * + recetas del sistema) con buscador, y el editor para crear una receta
 * nueva o modificar una del Excel sin volver a subirlo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Loader2, AlertTriangle } from "lucide-react";
import { getRecetas } from "@/app/actions/recetas";
import { TIPO_COSTO, soles4 } from "@/components/buscador-costo";
import { Pastilla, Segmentado } from "@/components/productos/ui";
import { costoDeReceta, refDeReceta, type RecetaSistema } from "@/lib/recetas";
import type { Catalogo } from "@/lib/catalogo-costos-sql";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { EditorReceta, type Borrador } from "./editor-receta";
import { PricingAdmin } from "./pricing-admin";

type Filtro = "todas" | "producto" | "preparacion" | "sistema" | "insumo";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function RecetasClient() {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  const cargar = useCallback(async () => {
    const r = await getRecetas();
    if (r.ok) setCat(r.catalogo); else setError(r.error);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  // Recetas del sistema que quedaron sin costo (un ingrediente salió de la
  // lista al subir otro Excel): no están en la lista vigente, se avisan.
  const rotas = useMemo(() => {
    if (!cat) return [];
    const vigentes = new Set(cat.efectivo.map((i) => i.ref));
    return cat.recetas.filter((r) => !vigentes.has(refDeReceta(r.id)));
  }, [cat]);

  const lista = useMemo(() => {
    if (!cat) return [];
    const palabras = sinTildes(q).trim().split(/\s+/).filter(Boolean);
    return cat.efectivo
      .filter((i) => (filtro === "todas" ? i.tipo !== "insumo" : filtro === "sistema" ? i.origen === "sistema" : i.tipo === filtro))
      .filter((i) => palabras.every((p) => sinTildes(i.nombre).includes(p)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [cat, q, filtro]);

  function abrir(i: CostoPreparacion) {
    if (!cat) return;
    if (i.origen === "sistema" && i.recetaId !== undefined) {
      const r = cat.recetas.find((x) => x.id === i.recetaId)!;
      abrirReceta(r);
      return;
    }
    setBorrador({
      id: null, nombre: i.nombre, tipo: i.unidad === "und" ? "producto" : "preparacion", categoria: i.categoria,
      detalle: i.detalle ?? { rendimiento: null, merma: 0, ingredientes: [] }, reemplaza: i,
    });
  }

  function abrirReceta(r: RecetaSistema) {
    const original = r.reemplaza ? cat?.excel.find((x) => x.ref === r.reemplaza) ?? null : null;
    setBorrador({ id: r.id, nombre: r.nombre, tipo: r.tipo, categoria: r.categoria, detalle: r.detalle, reemplaza: original });
  }

  const nueva = () => setBorrador({
    id: null, nombre: "", tipo: "preparacion", categoria: null, detalle: { rendimiento: null, merma: 0, ingredientes: [] }, reemplaza: null,
  });

  const conteo = (f: Filtro) => cat?.efectivo.filter((i) => (f === "sistema" ? i.origen === "sistema" : i.tipo === f)).length ?? 0;

  return (
    <>
    <PricingAdmin onActualizado={() => void cargar()} />
    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-[15px] font-semibold text-gray-900">Recetas de Atelier</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Crea una receta o sub-receta nueva, o abre una del Excel y cámbiale ingredientes o pesos: el costo se recalcula con los
            precios vigentes y se usa de inmediato en las mermas. No hace falta volver a subir el Excel por una receta.
          </p>
        </div>
        <button type="button" onClick={nueva} disabled={!cat}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl whitespace-nowrap disabled:opacity-50">
          <Plus className="w-4 h-4" /> Nueva receta
        </button>
      </header>

      {error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : !cat ? (
        <div className="flex justify-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <>
          {rotas.length > 0 && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Recetas sin costo (no aparecen en mermas):</div>
              {rotas.map((r) => {
                const falta = costoDeReceta(r.tipo, r.detalle, (ref) => cat.efectivo.find((i) => i.ref === ref || i.reemplaza === ref) ?? null).faltantes;
                return (
                  <button key={r.id} type="button" onClick={() => abrirReceta(r)} className="block text-left underline decoration-dotted">
                    {r.nombre}{falta.length > 0 ? ` — falta precio de ${falta.join(", ")}` : ""}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar receta, ej. pie de manzana"
                className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm" />
            </label>
            <Segmentado
              tamano="sm"
              valor={filtro}
              onChange={setFiltro}
              opciones={[
                { valor: "todas", etiqueta: "Todas" },
                { valor: "producto", etiqueta: `Productos · ${conteo("producto")}` },
                { valor: "preparacion", etiqueta: `Preparaciones · ${conteo("preparacion")}` },
                { valor: "sistema", etiqueta: `Hechas aquí · ${conteo("sistema")}` },
                { valor: "insumo", etiqueta: `Insumos · ${conteo("insumo")}` },
              ]}
            />
          </div>

          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {lista.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">Nada con ese nombre.</li>}
            {lista.map((i) => {
              const editable = i.tipo !== "insumo";
              return (
                <li key={i.ref} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {i.nombre}
                      {i.origen === "sistema" && <Pastilla tono="marca">{i.reemplaza ? "tu versión" : "hecha aquí"}</Pastilla>}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {TIPO_COSTO[i.tipo]}{i.categoria ? ` · ${i.categoria.toLowerCase()}` : ""}
                      {editable && i.origen !== "sistema" && !i.detalle && " · el Excel no trae su receta"}
                      {editable && i.detalle && ` · ${i.detalle.ingredientes.length} ingredientes`}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums text-gray-900 whitespace-nowrap">{soles4(i.costo)} <span className="text-gray-400 text-xs">/ {i.unidad}</span></div>
                  {editable ? (
                    <button type="button" onClick={() => abrir(i)}
                      className="text-xs font-medium text-primary hover:bg-primary-50 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                      {i.origen === "sistema" ? "Editar" : "Abrir"}
                    </button>
                  ) : <span className="w-[52px]" />}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {borrador && cat && (
        <EditorReceta
          borrador={borrador}
          catalogo={cat.efectivo}
          onCerrar={() => setBorrador(null)}
          onGuardada={() => { setBorrador(null); void cargar(); }}
        />
      )}
    </section>
    </>
  );
}
