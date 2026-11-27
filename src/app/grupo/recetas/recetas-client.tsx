"use client";

/**
 * Grupo → Recetas y costos: la lista de costos de Atelier (Excel de pricing
 * + recetas del sistema) con buscador, y el editor para crear una receta
 * nueva o modificar una del Excel sin volver a subirlo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, Copy, Archive, ArchiveRestore } from "lucide-react";
import { archivarReceta, marcarRecetaRevisada, type Revisada, getPreciosVenta, getRecetas, type PreciosVenta } from "@/app/actions/recetas";
import { TIPO_COSTO, soles4 } from "@/components/buscador-costo";
import { Pastilla } from "@/components/productos/ui";
import { BarraRevision, BotonRevisado } from "./revision";
import { ListaPorCategorias, type FilaLista } from "./lista-categorias";
import { costoDeReceta, refDeReceta, type RecetaSistema } from "@/lib/recetas";
import type { Catalogo } from "@/lib/catalogo-costos-sql";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { EditorReceta, type Borrador } from "./editor-receta";
import { AsistenteReceta, type RecetaDePartida } from "./nueva-receta";
import { FichaProducto } from "@/components/productos/ficha-producto";

/** Orden de las categorías de Atelier (el resto, alfabético; «Archivados» al final). */
const ORDEN_ATELIER = ["Panadería", "Pastelería", "Empanadas", "Sub-recetas", "Insumos / Subrecetas", "Nuevos / Pendientes"];

export function RecetasClient() {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Recetas archivadas (26-nov-2026): salen de la lista y van a «Archivados»; siguen costeando.
  const [archivadas, setArchivadas] = useState<Set<string>>(new Set());
  const [archivando, setArchivando] = useState<string | null>(null);
  // Revisión una por una (27-nov-2026). Clave = la receta del Excel que reemplaza, o la propia: no cambia al editarla.
  const [revisadas, setRevisadas] = useState<Record<string, Revisada>>({});
  const [revisando, setRevisando] = useState<string | null>(null);
  const [soloSinRevisar, setSoloSinRevisar] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [copia, setCopia] = useState<RecetaDePartida | null>(null);
  // «Abrir» = la ficha única del producto (receta, ruta de precios y matriz), 25-nov-2026.
  const [ficha, setFicha] = useState<string | null>(null);
  const [precios, setPrecios] = useState<Record<string, PreciosVenta>>({});

  const cargar = useCallback(async () => {
    const [r, p] = await Promise.all([getRecetas(), getPreciosVenta()]);
    if (r.ok) { setCat(r.catalogo); setArchivadas(new Set(r.archivadas)); setRevisadas(r.revisadas); } else setError(r.error);
    if (p.ok) setPrecios(p.precios);
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

  // «Editar receta» desde la ficha en otra pantalla llega con ?editar=<ref>: se abre el editor una vez.
  const abiertoDesdeUrl = useRef(false);
  useEffect(() => {
    if (!cat || abiertoDesdeUrl.current) return;
    const ref = new URLSearchParams(window.location.search).get("editar");
    if (!ref) return;
    abiertoDesdeUrl.current = true;
    const i = cat.efectivo.find((x) => x.ref === ref);
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- abrir una vez al llegar desde otra pantalla */
    if (i) abrir(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const claveRev = (i: CostoPreparacion) => i.reemplaza ?? i.ref;
  async function revisar(i: CostoPreparacion, revisado: boolean) {
    const k = claveRev(i);
    setRevisando(k);
    const r = await marcarRecetaRevisada({ sede: "atelier", ref: k, revisado });
    setRevisando(null);
    if (!r.ok) { window.alert(r.error); return; }
    setRevisadas((m) => { const n = { ...m }; if (r.revisada) n[k] = r.revisada; else delete n[k]; return n; });
  }

  async function archivar(i: CostoPreparacion, archivar: boolean) {
    if (archivar && !window.confirm(`¿Archivar «${i.nombre}»? Sale de la lista y pasa a «Archivados». Sigue costeando: las mermas y las recetas que lo usan no cambian.`)) return;
    setArchivando(i.ref);
    const r = await archivarReceta({ sede: "atelier", ref: i.ref, archivar });
    setArchivando(null);
    if (!r.ok) { window.alert(r.error); return; }
    setArchivadas((s) => { const n = new Set(s); if (archivar) n.add(i.ref); else n.delete(i.ref); return n; });
  }

  // Todas las recetas de Atelier (los insumos tienen su propia pantalla: Grupo → Insumos y packaging).
  const todasRecetas = (cat?.efectivo ?? []).filter((i) => i.tipo !== "insumo");
  const activasRev = todasRecetas.filter((i) => !archivadas.has(i.ref));
  const nRevisadas = activasRev.filter((i) => revisadas[claveRev(i)]).length;
  const filas: FilaLista[] = todasRecetas.filter((i) => !soloSinRevisar || !revisadas[claveRev(i)]).map((i) => {
    const archivada = archivadas.has(i.ref);
    return {
      clave: i.ref, nombre: i.nombre, categoria: i.tipo === "preparacion" && !i.categoria ? "Sub-recetas" : i.categoria, archivada,
      contenido: (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button type="button" onClick={() => setFicha(i.ref)} title="Abrir" className="text-left hover:text-primary hover:underline">{i.nombre}</button>
              {i.origen === "sistema" && <Pastilla tono="marca">{i.reemplaza ? "tu versión" : "hecha aquí"}</Pastilla>}
            </div>
            <div className="text-[11px] text-gray-500">
              {TIPO_COSTO[i.tipo]}
              {i.origen !== "sistema" && !i.detalle && " · el Excel no trae su receta"}
              {i.detalle && ` · ${i.detalle.ingredientes.length} ingredientes`}
            </div>
          </div>
          <div className="text-sm tabular-nums text-gray-900 whitespace-nowrap">{soles4(i.costo)} <span className="text-gray-400 text-xs">/ {i.unidad}</span></div>
          {i.detalle && i.detalle.ingredientes.length > 0 && (
            <button type="button" title="Crear una receta nueva a partir de esta" aria-label={`Duplicar ${i.nombre}`}
              onClick={() => setCopia({ de: i.nombre, clase: i.tipo === "producto" ? "atelier" : "sub", detalle: i.detalle! })}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-primary hover:bg-primary-50 rounded-lg px-2 py-1.5 whitespace-nowrap">
              <Copy className="w-3.5 h-3.5" /> Duplicar
            </button>
          )}
          <BotonRevisado revisada={revisadas[claveRev(i)]} cargando={revisando === claveRev(i)} onCambiar={(v) => void revisar(i, v)} nombre={i.nombre} />
          <button type="button" onClick={() => setFicha(i.ref)} className="text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg px-2.5 py-1.5 whitespace-nowrap">Abrir</button>
          <button type="button" onClick={() => abrir(i)} className="text-xs font-medium text-primary hover:bg-primary-50 rounded-lg px-2.5 py-1.5 whitespace-nowrap">Editar</button>
          <button type="button" disabled={archivando === i.ref} onClick={() => void archivar(i, !archivada)}
            title={archivada ? "Volver a la lista" : "Archivar"} aria-label={archivada ? `Desarchivar ${i.nombre}` : `Archivar ${i.nombre}`}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-1.5 disabled:opacity-40">
            {archivada ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
          </button>
        </div>
      ),
    };
  });

  return (
    <>
    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-[15px] font-semibold text-gray-900">Recetas de Atelier</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Crea una receta con «Nueva receta» (arriba: costo y precios en 3 pasos) o abre una y cambia ingredientes o pesos: el costo se recalcula solo, sin volver a subir el Excel.
          </p>
        </div>
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

          <BarraRevision total={activasRev.length} revisadas={nRevisadas} solo={soloSinRevisar} onSolo={setSoloSinRevisar} />
          <ListaPorCategorias filas={filas} orden={ORDEN_ATELIER} placeholder="Buscar receta, ej. pie de manzana" />
        </>
      )}

      {ficha && cat && (
        <FichaProducto recetaRef={ficha} onCerrar={() => setFicha(null)}
          onEditarReceta={(ref) => { setFicha(null); const i = cat.efectivo.find((x) => x.ref === ref); if (i) abrir(i); }} />
      )}
      {copia && <AsistenteReceta inicial={copia} onCerrar={() => setCopia(null)} />}
      {borrador && cat && (
        <EditorReceta
          borrador={borrador}
          precios={{
            ...(borrador.reemplaza ? precios[borrador.reemplaza.ref] : undefined),
            ...(borrador.id !== null ? precios[refDeReceta(borrador.id)] : undefined),
          }}
          catalogo={cat.efectivo}
          archivados={cat.archivados}
          onCerrar={() => setBorrador(null)}
          onPrecioGuardado={() => { void getPreciosVenta().then((p) => { if (p.ok) setPrecios(p.precios); }); }}
          onGuardada={() => { setBorrador(null); void cargar(); }}
        />
      )}
    </section>
    </>
  );
}
