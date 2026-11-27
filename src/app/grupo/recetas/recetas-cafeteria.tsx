"use client";

/**
 * Grupo → Recetas y costos → Recetas de las cafeterías (26-nov-2026, pedido de Jahnn: Fonavi y Centro también
 * preparan sus sánguches y bebidas). Las recetas vinieron del Excel (hojas «CAF · …»); se editan con el mismo editor
 * que las de Atelier, con la lista de costos de las cafeterías (lib/recetas-cafeteria.ts). Una receta enlazada a un
 * producto de la carta le da su costo. Plegada por defecto.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, Download, FileText, Loader2, Plus } from "lucide-react";
import { archivarReceta, marcarRecetaRevisada, type Revisada, getRecetasCafeteria } from "@/app/actions/recetas";
import { soles4 } from "@/components/buscador-costo";
import { Pastilla } from "@/components/productos/ui";
import { BarraRevision, BotonRevisado } from "./revision";
import { ListaPorCategorias, type FilaLista } from "./lista-categorias";
import { refDeReceta } from "@/lib/recetas";
import type { CatalogoCafeteria } from "@/lib/carta-sql";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { EditorReceta, type Borrador } from "./editor-receta";

const PRECIO_DEL_EXCEL = /\(precio del excel\)/i;
const ORDEN = ["Sánguches", "Bebidas", "Desayunos", "Adicional GRAND", "Sub-recetas"];

type Fila = { item: CostoPreparacion; carta: CatalogoCafeteria["carta"][number] | null; revisar: string[] };

export function RecetasCafeteria({ abiertaDesdeInicio = false }: { abiertaDesdeInicio?: boolean } = {}) {
  const [abierta, setAbierta] = useState(abiertaDesdeInicio);
  const [cat, setCat] = useState<CatalogoCafeteria | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soloRevisar, setSoloRevisar] = useState(false);
  const [archivadas, setArchivadas] = useState<Set<string>>(new Set());
  const [archivando, setArchivando] = useState<string | null>(null);
  // Revisión una por una (27-nov-2026). Clave = la receta del Excel que reemplaza, o la propia: no cambia al editarla.
  const [revisadas, setRevisadas] = useState<Record<string, Revisada>>({});
  const [revisando, setRevisando] = useState<string | null>(null);
  const [soloSinRevisar, setSoloSinRevisar] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [precioCarta, setPrecioCarta] = useState<{ cartaRef: string; carta?: number } | undefined>(undefined);

  const cargar = useCallback(async () => {
    const r = await getRecetasCafeteria();
    if (r.ok) { setCat(r.catalogo); setArchivadas(new Set(r.archivadas)); setRevisadas(r.revisadas); } else setError(r.error);
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  const filas = useMemo((): Fila[] => {
    if (!cat) return [];
    const porRef = new Map(cat.efectivo.map((i) => [i.ref, i]));
    const deCarta = new Map(cat.carta.map((c) => [c.ref, c]));
    return cat.efectivo.filter((i) => i.origen === "sistema").map((item) => {
      const carta = item.reemplaza ? deCarta.get(item.reemplaza) ?? null : null;
      const revisar: string[] = [];
      const fijos = (item.detalle?.ingredientes ?? []).map((g) => (g.ref ? porRef.get(g.ref) : undefined)).filter((x) => x && PRECIO_DEL_EXCEL.test(x.nombre));
      if (fijos.length > 0) revisar.push(`${fijos.map((x) => x!.nombre.replace(PRECIO_DEL_EXCEL, "").trim()).join(", ")} con precio del Excel`);
      if (carta?.costoExcel && Math.abs(item.costo - carta.costoExcel) / carta.costoExcel > 0.03) revisar.push(`Excel decía ${soles4(carta.costoExcel)}`);
      return { item, carta, revisar };
    });
  }, [cat]);
  // Recetas que quedaron sin costo (un insumo salió de la lista): no están en la lista vigente.
  const sinCosto = useMemo(() => (cat ? cat.recetas.filter((r) => !cat.efectivo.some((i) => i.ref === refDeReceta(r.id))) : []), [cat]);

  const nRevisar = filas.filter((f) => f.revisar.length > 0).length;
  // Recetario de cocina en Word por sección (27-nov-2026): las secciones con productos.
  const secciones = useMemo(() => [...new Set(filas.filter((f) => f.item.tipo === "producto" && f.item.categoria && !/^(sub-recetas|adicional grand)$/i.test(f.item.categoria)).map((f) => f.item.categoria!))]
    .sort((a, b) => (ORDEN.indexOf(a) + 1 || 99) - (ORDEN.indexOf(b) + 1 || 99) || a.localeCompare(b, "es")), [filas]);
  const [seccionWord, setSeccionWord] = useState("Bebidas");
  const nSub = filas.filter((f) => f.item.categoria === "Sub-recetas").length;

  const claveRev = (i: CostoPreparacion) => i.reemplaza ?? i.ref;
  async function cambiarRevision(i: CostoPreparacion, revisado: boolean) {
    const k = claveRev(i);
    setRevisando(k);
    const r = await marcarRecetaRevisada({ sede: "cafeterias", ref: k, revisado });
    setRevisando(null);
    if (!r.ok) { window.alert(r.error); return; }
    setRevisadas((m) => { const n = { ...m }; if (r.revisada) n[k] = r.revisada; else delete n[k]; return n; });
  }

  async function archivar(i: CostoPreparacion, archivar: boolean) {
    if (archivar && !window.confirm(`¿Archivar «${i.nombre}»? Sale de la lista y pasa a «Archivados». Sigue costeando: la carta y las recetas que lo usan no cambian.`)) return;
    setArchivando(i.ref);
    const r = await archivarReceta({ sede: "cafeterias", ref: i.ref, archivar });
    setArchivando(null);
    if (!r.ok) { window.alert(r.error); return; }
    setArchivadas((s) => { const n = new Set(s); if (archivar) n.add(i.ref); else n.delete(i.ref); return n; });
  }

  const activasRev = filas.filter((f) => !archivadas.has(f.item.ref));
  const nRevisadas = activasRev.filter((f) => revisadas[claveRev(f.item)]).length;
  const filasLista: FilaLista[] = filas.filter((f) => (!soloRevisar || f.revisar.length > 0) && (!soloSinRevisar || !revisadas[claveRev(f.item)])).map(({ item: i, carta, revisar }) => {
    const archivada = archivadas.has(i.ref);
    return {
      clave: i.ref, nombre: i.nombre, categoria: i.categoria, buscar: carta?.nombre, archivada,
      contenido: (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button type="button" onClick={() => abrir(i)} title="Abrir" className="text-left hover:text-primary hover:underline">{i.nombre}</button>
              {carta && <Pastilla tono="marca">en la carta{carta.nombre !== i.nombre ? `: ${carta.nombre}` : ""}</Pastilla>}
              {revisar.length > 0 && <Pastilla tono="ambar">revisar</Pastilla>}
            </div>
            <div className="text-[11px] text-gray-500">
              {i.detalle?.ingredientes.length ?? 0} ingredientes
              {revisar.length > 0 && <span className="text-amber-700"> · {revisar.join(" · ")}</span>}
            </div>
          </div>
          <div className="text-sm tabular-nums text-gray-900 whitespace-nowrap">{soles4(i.costo)} <span className="text-gray-400 text-xs">/ {i.unidad}</span></div>
          <BotonRevisado revisada={revisadas[claveRev(i)]} cargando={revisando === claveRev(i)} onCambiar={(v) => void cambiarRevision(i, v)} nombre={i.nombre} />
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

  function abrir(i: CostoPreparacion) {
    if (!cat || i.recetaId === undefined) return;
    const r = cat.recetas.find((x) => x.id === i.recetaId);
    if (r) abrirReceta(r.id);
  }
  function abrirReceta(id: number) {
    if (!cat) return;
    const r = cat.recetas.find((x) => x.id === id)!;
    const c = r.reemplaza ? cat.carta.find((x) => x.ref === r.reemplaza) : null;
    setPrecioCarta(c ? { cartaRef: c.ref, ...(c.precio ? { carta: c.precio } : {}) } : undefined);
    setBorrador({
      id: r.id, nombre: r.nombre, tipo: r.tipo, categoria: r.categoria, detalle: r.detalle,
      reemplaza: c ? { ref: c.ref, tipo: "producto", nombre: c.nombre, categoria: c.seccion, unidad: "und", costo: c.costoExcel ?? 0 } : null,
    });
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200/80">
      <button type="button" onClick={() => setAbierta((v) => !v)} className="w-full flex items-start justify-between gap-3 px-4 py-4 sm:px-6 text-left" aria-expanded={abierta}>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900">Recetas de las cafeterías</h2>
          <p className="text-xs text-gray-500 mt-1">
            {cat
              ? `Fonavi y Centro · ${filas.length - nSub} productos y ${nSub} sub-recetas${nRevisar > 0 ? ` · ${nRevisar} para revisar` : ""}. El costo de la carta sale de aquí, con los precios de hoy.`
              : "Sánguches, bebidas y desayunos que preparan Fonavi y Centro."}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 mt-1 shrink-0 transition-transform ${abierta ? "rotate-180" : ""}`} />
      </button>

      {abierta && (
        <div className="px-4 pb-5 sm:px-6 space-y-4">
          {error ? (
            <p className="text-sm text-gray-500">{error}</p>
          ) : !cat ? (
            <div className="flex justify-center py-8 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : (
            <>
              {sinCosto.length > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Sin costo (falta el precio de un ingrediente): {sinCosto.map((r) => (
                    <button key={r.id} type="button" onClick={() => abrirReceta(r.id)} className="underline decoration-dotted mr-2">{r.nombre}</button>
                  ))}
                </p>
              )}
              <BarraRevision total={activasRev.length} revisadas={nRevisadas} solo={soloSinRevisar} onSolo={setSoloSinRevisar} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={soloRevisar} onChange={(e) => setSoloRevisar(e.target.checked)} />
                  Solo las que hay que revisar ({nRevisar})
                </label>
                <button type="button" onClick={() => { setPrecioCarta(undefined); setBorrador({ id: null, nombre: "", tipo: "producto", categoria: null, detalle: { rendimiento: 1, merma: 0, ingredientes: [] }, reemplaza: null }); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-primary border border-primary/40 bg-white hover:bg-emerald-50 rounded-lg">
                  <Plus className="w-3.5 h-3.5" /> Receta o sub-receta nueva
                </button>
              </div>
              {secciones.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2">
                  <FileText className="h-4 w-4 text-primary" aria-hidden />
                  <span className="text-xs text-gray-700">Recetario de cocina (Word):</span>
                  <select value={secciones.includes(seccionWord) ? seccionWord : secciones[0]} onChange={(e) => setSeccionWord(e.target.value)} aria-label="Sección del recetario"
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs">
                    {secciones.map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <a href={`/api/recetario?seccion=${encodeURIComponent(secciones.includes(seccionWord) ? seccionWord : secciones[0])}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">
                    <Download className="h-3.5 w-3.5" /> Descargar
                  </a>
                  <span className="text-[11px] text-gray-500">Sale de estas recetas: pasos, vida útil y medida de cocina se llenan en «Ficha para el recetario».</span>
                </div>
              )}
              <ListaPorCategorias filas={filasLista} orden={ORDEN} placeholder="Buscar receta, ej. roast beef" />
            </>
          )}
        </div>
      )}

      {borrador && cat && (
        <EditorReceta
          sede="cafeterias"
          precios={precioCarta}
          onPrecioGuardado={() => void cargar()}
          borrador={borrador}
          catalogo={cat.efectivo}
          archivados={cat.archivados}
          onCerrar={() => setBorrador(null)}
          onGuardada={() => { setBorrador(null); void cargar(); }}
        />
      )}
    </section>
  );
}
