"use client";

/**
 * «Nueva receta» en 3 pasos (fase A de «recetas y precios en el sistema», pedido de Jahnn, 24-nov-2026: las
 * casitas de jengibre le tomaron una hora en el Excel de pricing; aquí deben salir en 5 minutos).
 *
 *   1 · ¿Qué es?      sub-receta de Atelier (por kg) · producto de Atelier · producto de cafetería
 *   2 · Ingredientes  buscador + «Insumo nuevo» sin salir de la pantalla; el costo se ve mientras se escribe
 *   3 · Precios       sugeridos con las metas (lib/precios-sugeridos.ts); Jahnn escribe el precio final
 *
 * Guarda con lo que ya existe: recetas_sistema (Atelier), carta_sistema (lo que va a la carta) y precios_b2b.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CakeSlice, Check, ChevronDown, ChevronRight, Coffee, Layers, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { BuscadorCosto, soles4 } from "@/components/buscador-costo";
import { crearInsumoNuevo, crearRecetaAtelier, getOpcionesNuevaReceta, type OpcionesNuevaReceta } from "@/app/actions/nueva-receta";
import { guardarProductoNuevo } from "@/app/actions/carta";
import { guardarPrecioInsumo } from "@/app/actions/precios-insumos";
import { costoDeReceta, costoIngrediente } from "@/lib/recetas";
import { METAS, foodCost, margen, sugeridoCafeteria, sugeridosAtelier } from "@/lib/precios-sugeridos";
import type { CostoPreparacion, DetalleReceta } from "@/lib/costos-preparaciones";
import type { LineaTienda } from "@/lib/productos/receta-carta";

type Clase = "sub" | "atelier" | "cafeteria";
type Fila = { texto: string; item: CostoPreparacion | null; cantidad: string; unidad: string };

const UNIDADES: Record<CostoPreparacion["unidad"], string[]> = { kg: ["g", "kg"], l: ["ml", "l"], und: ["und"] };
const filaVacia = (): Fila => ({ texto: "", item: null, cantidad: "", unidad: "g" });
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const campo = "mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900";
const etiqueta = "text-[11px] uppercase tracking-wide text-gray-500";

const CLASES: { valor: Clase; titulo: string; texto: string; icono: typeof Layers }[] = [
  { valor: "sub", titulo: "Sub-receta de Atelier", texto: "Frosting, masa, relleno. El costo sale por kg.", icono: Layers },
  { valor: "atelier", titulo: "Producto de Atelier", texto: "Casitas de jengibre, tortas, panes. El costo sale por unidad.", icono: CakeSlice },
  { valor: "cafeteria", titulo: "Producto de cafetería", texto: "Sánguche, bebida. Se prepara en la tienda.", icono: Coffee },
];

export function NuevaReceta() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl whitespace-nowrap">
        <Plus className="w-4 h-4" /> Nueva receta
      </button>
      {abierto && <Asistente onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function Asistente({ onCerrar }: { onCerrar: () => void }) {
  const [opciones, setOpciones] = useState<OpcionesNuevaReceta | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [clase, setClase] = useState<Clase>("atelier");
  const [nombre, setNombre] = useState("");
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [rendimiento, setRendimiento] = useState("");
  const [merma, setMerma] = useState("");
  const [extras, setExtras] = useState<CostoPreparacion[]>([]);
  const [b2b, setB2b] = useState("");
  const [vaCarta, setVaCarta] = useState(false);
  const [interno, setInterno] = useState("");
  const [carta, setCarta] = useState("");
  const [seccion, setSeccion] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string[] | null>(null);

  /** Vuelve a leer la lista (después de cambiar un precio) y pone los costos nuevos en las filas. */
  async function recargar() {
    const r = await getOpcionesNuevaReceta();
    if (!r.ok) return;
    setOpciones(r.data);
  }

  useEffect(() => {
    let vivo = true;
    void getOpcionesNuevaReceta().then((r) => {
      if (!vivo) return;
      if (r.ok) setOpciones(r.data); else setErrorCarga(r.error);
    });
    return () => { vivo = false; };
  }, []);

  // La lista donde se busca: Atelier usa su lista de costos; la cafetería, sus insumos y lo que le compra a
  // Atelier a precio interno (en unidades). Los insumos nuevos de esta sesión se suman al instante.
  const lista = useMemo<CostoPreparacion[]>(() => {
    if (!opciones) return extras;
    const sinRepetir = (base: CostoPreparacion[]) => {
      const refs = new Set(base.map((i) => i.ref));
      return [...base, ...extras.filter((e) => !refs.has(e.ref))];
    };
    if (clase !== "cafeteria") return sinRepetir(opciones.atelier);
    const caf = opciones.insumosCafeteria.map((i) => ({
      ref: i.sku, tipo: "insumo" as const, nombre: i.nombre, categoria: "Cafetería", unidad: i.unidad as CostoPreparacion["unidad"], costo: i.precio,
    }));
    const at = opciones.deAtelier.map((a) => ({ ref: a.ref, tipo: "producto" as const, nombre: a.nombre, categoria: "De Atelier", unidad: "und" as const, costo: a.interno }));
    return sinRepetir([...caf, ...at]);
  }, [opciones, clase, extras]);
  // Lo que se ofrece en el buscador: sin los insumos archivados (siguen costeando lo que ya los usa).
  const busqueda = useMemo(() => {
    const arch = new Set(opciones?.archivados ?? []);
    const lado = clase === "cafeteria" ? "Cafetería" : "Atelier";
    return arch.size === 0 ? lista : lista.filter((i) => i.tipo !== "insumo" || !arch.has(`${lado}|${i.ref.trim().toUpperCase()}`));
  }, [lista, opciones, clase]);
  const costoReal = useMemo(() => new Map(opciones?.deAtelier.map((a) => [a.ref, a.costoReal ?? a.interno]) ?? []), [opciones]);

  const porRef = useMemo(() => {
    const m = new Map<string, CostoPreparacion>();
    for (const i of lista) { m.set(i.ref, i); if (i.reemplaza) m.set(i.reemplaza, i); }
    return m;
  }, [lista]);
  const filasVigentes = useMemo(() => filas.map((f) => (f.item ? { ...f, item: porRef.get(f.item.ref) ?? f.item } : f)), [filas, porRef]);

  const tipo = clase === "sub" ? "preparacion" : "producto";
  const detalle: DetalleReceta = {
    rendimiento: num(rendimiento) > 0 ? num(rendimiento) : null,
    merma: Math.min(Math.max(num(merma) || 0, 0), 95) / 100,
    ingredientes: filasVigentes.filter((f) => f.item || f.texto.trim() || f.cantidad)
      .map((f) => ({ ref: f.item?.ref ?? null, nombre: f.item?.nombre ?? f.texto.trim(), unidad: f.unidad, cantidad: num(f.cantidad) })),
  };
  const calc = costoDeReceta(tipo, detalle, (ref) => porRef.get(ref) ?? null);
  const costo = calc.faltantes.length === 0 ? calc.costo : null;
  // Cafetería: lo que le cuesta al grupo (lo de Atelier a su costo real, no al precio interno).
  const costoGrupo = clase === "cafeteria" && costo !== null
    ? costoDeReceta(tipo, detalle, (ref) => {
      const i = porRef.get(ref);
      return i && costoReal.has(ref) ? { unidad: "und" as const, costo: costoReal.get(ref)! } : i ?? null;
    }).costo
    : costo;

  const setFila = (i: number, p: Partial<Fila>) => setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...p } : f)));

  const faltaPaso2 = (): string | null => {
    if (!nombre.trim()) return "Escribe el nombre.";
    if (detalle.ingredientes.length === 0) return "Agrega al menos un ingrediente.";
    const sinElegir = detalle.ingredientes.find((g) => !g.ref);
    if (sinElegir) return `«${sinElegir.nombre}»: elígelo de la lista o créalo con «Insumo nuevo».`;
    const sinCantidad = detalle.ingredientes.find((g) => !(g.cantidad > 0));
    if (sinCantidad) return `«${sinCantidad.nombre}»: escribe la cantidad.`;
    if (tipo === "producto" && !(detalle.rendimiento && detalle.rendimiento > 0)) return clase === "cafeteria" ? "Escribe cuántas porciones salen." : "Escribe cuántas unidades rinde.";
    if (calc.faltantes.length > 0) return `Sin precio: ${calc.faltantes.join(", ")}.`;
    if (costo === null) return "No se pudo calcular el costo.";
    return null;
  };

  function irAPrecios() {
    const e = faltaPaso2();
    if (e) { setError(e); return; }
    setError(null);
    if (clase === "sub") { void guardar(); return; }
    if (costo !== null) {
      if (clase === "atelier") {
        const s = sugeridosAtelier(costo, null);
        if (!b2b) setB2b(s.b2b.toFixed(2));
        if (!interno) setInterno(s.interno.toFixed(2));
        if (!carta) setCarta(s.carta.toFixed(2));
      } else if (!carta) setCarta(sugeridoCafeteria(costo).toFixed(2));
    }
    setPaso(3);
  }

  async function guardar() {
    if (costo === null) return;
    setOcupado(true);
    setError(null);
    if (clase === "cafeteria") {
      const lineas: LineaTienda[] = detalle.ingredientes.map((g) => ({
        tipo: costoReal.has(g.ref!) ? "atelier" : "insumo", ref: g.ref!, nombre: g.nombre, cantidad: g.cantidad, unidad: costoReal.has(g.ref!) ? "und" : g.unidad,
      }));
      const r = await guardarProductoNuevo({
        ref: null, nombre: nombre.trim(), seccion: seccion.trim() || null, precio: num(carta) > 0 ? num(carta) : null, costo: null,
        receta: { tipo: "tienda", porciones: detalle.rendimiento ?? 0, merma: detalle.merma, lineas },
      });
      setOcupado(false);
      if (!r.ok) { setError(r.error); return; }
      setListo([`Costo por unidad: ${soles(costo)}.`, `Precio de carta: ${soles(num(carta))} (food cost de sede ${pct(foodCost(costo, num(carta)))}).`, "Ya aparece en «Carta de las cafeterías», en Productos y en Precios."]);
      return;
    }
    const r = await crearRecetaAtelier({
      nombre: nombre.trim(), tipo, detalle,
      b2b: clase === "atelier" && num(b2b) > 0 ? num(b2b) : null,
      carta: clase === "atelier" && vaCarta ? { interno: num(interno), precio: num(carta), seccion: seccion.trim() || null } : null,
    });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    const resumen = clase === "sub"
      ? [`Costo por kg: ${soles4(costo)}.`, "Ya la puedes usar como ingrediente en otras recetas y en mermas."]
      : [
        `Costo por unidad: ${soles(costo)}.`,
        num(b2b) > 0 ? `Precio B2B: ${soles(num(b2b))} (margen ${pct(margen(num(b2b), costo))}).` : "Sin precio B2B.",
        vaCarta ? `En la carta a ${soles(num(carta))}, precio interno ${soles(num(interno))}.` : "No va a la carta de las cafeterías.",
        "Ya aparece en «Recetas de Atelier».",
      ];
    setListo([...resumen, ...r.avisos]);
  }

  const pasos = clase === "sub" ? ["Qué es", "Ingredientes"] : ["Qué es", "Ingredientes", "Precios"];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2 sm:p-4" onClick={listo ? undefined : onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[94vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Nueva receta</h2>
            {!listo && (
              <ol className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                {pasos.map((p, i) => (
                  <li key={p} className={paso === i + 1 ? "font-semibold text-primary" : ""}>{i + 1} · {p}</li>
                ))}
              </ol>
            )}
          </div>
          <button onClick={listo ? () => window.location.reload() : onCerrar} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {listo ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary font-semibold"><Check className="w-5 h-5" /> «{nombre.trim()}» guardada</div>
              <ul className="text-sm text-gray-700 space-y-1 list-disc pl-5">{listo.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          ) : errorCarga ? (
            <p className="text-sm text-red-700">{errorCarga}</p>
          ) : !opciones ? (
            <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : paso === 1 ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {CLASES.map(({ valor, titulo, texto, icono: Icono }) => (
                <button key={valor} type="button"
                  onClick={() => { if (valor !== clase) { setFilas([filaVacia()]); setExtras([]); } setClase(valor); setPaso(2); }}
                  className="text-left rounded-xl border border-gray-200 hover:border-primary hover:bg-emerald-50/40 p-4 space-y-1">
                  <Icono className="w-5 h-5 text-primary" />
                  <div className="text-sm font-semibold text-gray-900">{titulo}</div>
                  <div className="text-xs text-gray-500">{texto}</div>
                </button>
              ))}
            </div>
          ) : paso === 2 ? (
            <PasoIngredientes
              clase={clase} nombre={nombre} setNombre={setNombre} filas={filasVigentes} setFila={setFila} setFilas={setFilas}
              rendimiento={rendimiento} setRendimiento={setRendimiento} merma={merma} setMerma={setMerma}
              lista={busqueda} porRef={porRef} calc={calc} costo={costo} onPrecioCambiado={recargar}
              onInsumoNuevo={(item, fila) => {
                setExtras((p) => [...p, item]);
                setFila(fila, { texto: item.nombre, item, unidad: UNIDADES[item.unidad][0] });
              }}
            />
          ) : (
            <PasoPrecios
              clase={clase} costo={costo!} costoGrupo={costoGrupo} secciones={opciones.secciones}
              b2b={b2b} setB2b={setB2b} vaCarta={vaCarta} setVaCarta={setVaCarta}
              interno={interno} setInterno={setInterno} carta={carta} setCarta={setCarta} seccion={seccion} setSeccion={setSeccion}
            />
          )}
          {error && <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-4 sm:px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
          {listo ? (
            <button onClick={() => window.location.reload()} className="ml-auto px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg">Listo</button>
          ) : (
            <>
              <div>
                {paso > 1 && (
                  <button onClick={() => { setError(null); setPaso((p) => (p === 3 ? 2 : 1)); }} disabled={ocupado}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">
                    <ArrowLeft className="w-4 h-4" /> Atrás
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onCerrar} disabled={ocupado} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg disabled:opacity-50">Cancelar</button>
                {paso === 2 && (
                  <button onClick={irAPrecios} disabled={ocupado}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
                    {clase === "sub"
                      ? <>{ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar sub-receta</>
                      : <>Precios <ArrowRight className="w-4 h-4" /></>}
                  </button>
                )}
                {paso === 3 && (
                  <button onClick={() => void guardar()} disabled={ocupado}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
                    {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PasoIngredientes(p: {
  clase: Clase; nombre: string; setNombre: (s: string) => void;
  filas: Fila[]; setFila: (i: number, f: Partial<Fila>) => void; setFilas: (f: (prev: Fila[]) => Fila[]) => void;
  rendimiento: string; setRendimiento: (s: string) => void; merma: string; setMerma: (s: string) => void;
  lista: CostoPreparacion[]; porRef: Map<string, CostoPreparacion>; calc: ReturnType<typeof costoDeReceta>; costo: number | null;
  onInsumoNuevo: (item: CostoPreparacion, fila: number) => void;
  onPrecioCambiado: () => Promise<void>;
}) {
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const alternar = (i: number) => setAbiertas((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const [nuevo, setNuevo] = useState<{ fila: number; nombre: string; unidad: "kg" | "l" | "und"; precio: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null);
  const origen = p.clase === "cafeteria" ? "Cafetería" : "Atelier";
  const unidadCosto = p.clase === "sub" ? "kg" : "unidad";

  async function crear() {
    if (!nuevo) return;
    setCreando(true);
    setErrorNuevo(null);
    const r = await crearInsumoNuevo({ origen, nombre: nuevo.nombre, unidad: nuevo.unidad, precio: num(nuevo.precio) });
    setCreando(false);
    if (!r.ok) { setErrorNuevo(r.error); return; }
    p.onInsumoNuevo({ ref: r.insumo.sku, tipo: "insumo", nombre: r.insumo.nombre, categoria: "Insumos nuevos", unidad: r.insumo.unidad as CostoPreparacion["unidad"], costo: r.insumo.precio }, nuevo.fila);
    setNuevo(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-3">
          <span className={etiqueta}>Nombre</span>
          <input value={p.nombre} onChange={(e) => p.setNombre(e.target.value)} autoFocus
            placeholder={p.clase === "sub" ? "ej. Glaseado real" : p.clase === "atelier" ? "ej. Casita de jengibre" : "ej. Sánguche de pavo"} className={campo} />
        </label>
        {p.clase !== "sub" && (
          <label className="block">
            <span className={etiqueta}>{p.clase === "cafeteria" ? "Porciones que salen" : "Unidades que rinde"}</span>
            <input inputMode="decimal" value={p.rendimiento} onChange={(e) => p.setRendimiento(e.target.value)} placeholder="ej. 10" className={campo} />
          </label>
        )}
        {p.clase === "sub" && (
          <label className="block">
            <span className={etiqueta}>Kg que salen (opcional)</span>
            <input inputMode="decimal" value={p.rendimiento} onChange={(e) => p.setRendimiento(e.target.value)} placeholder="vacío = peso de la mezcla" className={campo} />
          </label>
        )}
        <label className="block">
          <span className={etiqueta}>Merma (%)</span>
          <input inputMode="decimal" value={p.merma} onChange={(e) => p.setMerma(e.target.value)} placeholder="0" className={campo} />
        </label>
      </div>

      <div>
        <div className={`${etiqueta} mb-1.5`}>
          Ingredientes para toda la receta{p.clase !== "sub" ? " (el empaque también: caja, bolsa, etiqueta)" : ""}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-gray-500 bg-gray-50">
                <th className="text-left px-2 py-2 font-medium min-w-[220px]">Ingrediente</th>
                <th className="text-right px-2 py-2 font-medium w-24">Cantidad</th>
                <th className="text-left px-2 py-2 font-medium w-20">Unidad</th>
                <th className="text-right px-2 py-2 font-medium w-24">Costo</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {p.filas.map((f, i) => {
                const c = f.item && num(f.cantidad) > 0 ? costoIngrediente(f.item, num(f.cantidad), f.unidad) : null;
                const unidades = f.item ? UNIDADES[f.item.unidad] : ["g", "kg", "ml", "l", "und"];
                return (
                  <Fragment key={i}>
                  <tr className="border-t border-gray-100 align-top">
                    <td className="px-1 py-1">
                      <BuscadorCosto value={f.texto} elegido={!!f.item} catalogo={p.lista}
                        placeholder={p.clase === "cafeteria" ? "ej. Pan ciabatta, Pavo" : "ej. Harina pastelera, Jengibre"} resaltarSubrecetas
                        onTexto={(t) => p.setFila(i, { texto: t, item: null })}
                        onElegir={(item) => p.setFila(i, { texto: item.nombre, item, unidad: UNIDADES[item.unidad].includes(f.unidad) ? f.unidad : UNIDADES[item.unidad][0] })} />
                      {f.item ? (
                        <EtiquetaItem item={f.item} origen={origen} abierta={abiertas.has(i)} onAlternar={() => alternar(i)} onPrecioCambiado={p.onPrecioCambiado} />
                      ) : f.texto.trim() ? (
                        <button type="button" onClick={() => { setErrorNuevo(null); setNuevo({ fila: i, nombre: f.texto.trim(), unidad: "kg", precio: "" }); }}
                          className="text-[11px] text-amber-800 mt-0.5 px-0.5 underline decoration-dotted">
                          ¿No está en la lista? Créalo como insumo nuevo
                        </button>
                      ) : null}
                    </td>
                    <td className="px-1 py-1">
                      <input inputMode="decimal" value={f.cantidad} onChange={(e) => p.setFila(i, { cantidad: e.target.value })}
                        aria-label="Cantidad" className="w-full border border-gray-200 rounded px-2 py-1 text-right" />
                    </td>
                    <td className="px-1 py-1">
                      <select value={f.unidad} onChange={(e) => p.setFila(i, { unidad: e.target.value })} aria-label="Unidad"
                        className="w-full border border-gray-200 rounded px-1.5 py-1 bg-white">
                        {[...new Set([...unidades, f.unidad])].map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">{c !== null ? soles4(c) : "—"}</td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => p.setFilas((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : [filaVacia()]))}
                        className="text-gray-300 hover:text-red-500 p-0.5" aria-label="Quitar ingrediente">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                  {f.item?.detalle && abiertas.has(i) && (
                    <tr>
                      <td colSpan={5} className="px-1 pb-2">
                        <DentroDeReceta item={f.item} porRef={p.porRef} origen={origen} onPrecioCambiado={p.onPrecioCambiado} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => p.setFilas((prev) => [...prev, filaVacia()])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Agregar ingrediente
          </button>
          <button onClick={() => {
            const vacia = p.filas.findIndex((f) => !f.item);
            if (vacia === -1) p.setFilas((prev) => [...prev, filaVacia()]);
            setErrorNuevo(null);
            setNuevo({ fila: vacia === -1 ? p.filas.length : vacia, nombre: vacia === -1 ? "" : p.filas[vacia].texto.trim(), unidad: "kg", precio: "" });
          }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/40 bg-white hover:bg-emerald-50 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Insumo nuevo
          </button>
        </div>

        {nuevo && (
          <div className="mt-3 rounded-xl border border-primary/30 bg-emerald-50/40 p-3 space-y-2">
            <div className="text-sm font-semibold text-gray-900">Insumo nuevo de {origen === "Atelier" ? "Atelier" : "la cafetería"}</div>
            <p className="text-[11px] text-gray-500">Queda en «Precios de insumos» y sirve para todas las recetas. El precio es por la unidad de compra.</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <label className="text-[11px] text-gray-500">Nombre
                <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="ej. Jengibre en polvo" className={campo} />
              </label>
              <label className="text-[11px] text-gray-500">Se compra por
                <select value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value as "kg" | "l" | "und" })} className={`${campo} bg-white`}>
                  <option value="kg">kg</option><option value="l">litro</option><option value="und">unidad</option>
                </select>
              </label>
              <label className="text-[11px] text-gray-500">Precio por {nuevo.unidad === "l" ? "litro" : nuevo.unidad === "und" ? "unidad" : "kg"} (S/)
                <input inputMode="decimal" value={nuevo.precio} onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })} placeholder="ej. 12.00" className={campo} />
              </label>
            </div>
            {errorNuevo && <p className="text-xs text-red-700">{errorNuevo}</p>}
            <div className="flex gap-2">
              <button onClick={() => void crear()} disabled={creando}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg disabled:opacity-50">
                {creando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Crear y usar
              </button>
              <button onClick={() => setNuevo(null)} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-primary-50/60 border border-primary-100 px-4 py-3 grid gap-3 grid-cols-2 text-sm">
        <div>
          <div className={etiqueta}>Ingredientes</div>
          <div className="font-semibold tabular-nums text-gray-900">{soles4(p.calc.total)}</div>
          {p.clase === "sub" && <div className="text-[11px] text-gray-500">{(p.calc.kilos * 1000).toLocaleString("es-PE", { maximumFractionDigits: 0 })} g de mezcla</div>}
        </div>
        <div>
          <div className={etiqueta}>Costo por {unidadCosto}</div>
          <div className="text-lg font-semibold tabular-nums text-primary">{p.costo !== null ? soles4(p.costo) : "—"}</div>
        </div>
      </div>
      {p.calc.faltantes.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Falta: {p.calc.faltantes.join(", ")}. Elige cada uno de la lista o créalo con «Insumo nuevo».
        </p>
      )}
    </div>
  );
}

function Precio({ titulo, valor, setValor, sugerido, nota }: { titulo: string; valor: string; setValor: (s: string) => void; sugerido: number; nota: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-1">
      <label className="block">
        <span className={etiqueta}>{titulo} (S/)</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} />
      </label>
      <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-2">
        <span>Sugerido {soles(sugerido)}</span>
        {num(valor) !== sugerido && sugerido > 0 && (
          <button type="button" onClick={() => setValor(sugerido.toFixed(2))} className="text-primary underline decoration-dotted">usar</button>
        )}
      </div>
      <div className="text-xs text-gray-700">{nota}</div>
    </div>
  );
}

function PasoPrecios(p: {
  clase: Clase; costo: number; costoGrupo: number | null; secciones: string[];
  b2b: string; setB2b: (s: string) => void; vaCarta: boolean; setVaCarta: (b: boolean) => void;
  interno: string; setInterno: (s: string) => void; carta: string; setCarta: (s: string) => void; seccion: string; setSeccion: (s: string) => void;
}) {
  const interno = num(p.interno) > 0 ? num(p.interno) : null;
  const carta = num(p.carta) > 0 ? num(p.carta) : null;
  const s = sugeridosAtelier(p.costo, interno);
  const meta = (v: number | null, objetivo: number, mayorEsMejor: boolean) =>
    v == null ? "" : (mayorEsMejor ? v >= objetivo - 0.005 : v <= objetivo + 0.005) ? "text-primary" : "text-amber-700";

  const bloqueCarta = (costoSede: number, costoGrupo: number | null, metaSede: number) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className={etiqueta}>Sección de la carta</span>
        <input list="secciones-nueva" value={p.seccion} onChange={(e) => p.setSeccion(e.target.value)} placeholder="ej. Postres" className={campo} />
        <datalist id="secciones-nueva">{p.secciones.map((x) => <option key={x} value={x} />)}</datalist>
      </label>
      <Precio titulo="Precio de carta" valor={p.carta} setValor={p.setCarta} sugerido={p.clase === "cafeteria" ? sugeridoCafeteria(p.costo) : s.carta}
        nota={<>
          Food cost de sede <b className={meta(foodCost(costoSede, carta), metaSede, false)}>{pct(foodCost(costoSede, carta))}</b>
          {" · "}del grupo <b>{pct(foodCost(costoGrupo, carta))}</b>
        </>} />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary-50/60 border border-primary-100 px-4 py-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
        <span>Costo por unidad: <b className="tabular-nums">{soles4(p.costo)}</b></span>
        {p.clase === "cafeteria" && p.costoGrupo !== null && Math.abs(p.costoGrupo - p.costo) > 0.005 && (
          <span className="text-gray-600">Al grupo le cuesta {soles4(p.costoGrupo)} (lo de Atelier a su costo real)</span>
        )}
      </div>

      {p.clase === "atelier" ? (
        <>
          <Precio titulo="Precio B2B" valor={p.b2b} setValor={p.setB2b} sugerido={s.b2b}
            nota={<>Margen de Atelier <b className={meta(margen(num(p.b2b), p.costo), METAS.margenB2B, true)}>{pct(margen(num(p.b2b), p.costo))}</b> · meta {pct(METAS.margenB2B)}</>} />
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={p.vaCarta} onChange={(e) => p.setVaCarta(e.target.checked)} className="w-4 h-4 accent-[#098B5F]" />
            También va a la carta de las cafeterías
          </label>
          {p.vaCarta && (
            <div className="space-y-3">
              <Precio titulo="Precio interno (lo que paga la cafetería)" valor={p.interno} setValor={p.setInterno} sugerido={s.interno}
                nota={<>Margen de Atelier <b className={meta(margen(interno, p.costo), METAS.margenInterno, true)}>{pct(margen(interno, p.costo))}</b> · meta {pct(METAS.margenInterno)}</>} />
              {interno !== null && bloqueCarta(interno, p.costo, METAS.foodCostAtelierEnCarta)}
            </div>
          )}
        </>
      ) : (
        bloqueCarta(p.costo, p.costoGrupo, METAS.foodCostCafeteria)
      )}

      <p className="text-[11px] text-gray-500">
        Metas: margen interno {pct(METAS.margenInterno)}, B2B {pct(METAS.margenB2B)}, food cost cafetería {pct(METAS.foodCostCafeteria)},
        lo de Atelier en carta ~{pct(METAS.foodCostAtelierEnCarta)}. Tú escribes el precio final.
      </p>
    </div>
  );
}

const esSubreceta = (i: CostoPreparacion) => i.tipo === "preparacion";

/** Qué es lo elegido: una sub-receta (se abre), un producto, o un insumo (se le cambia el precio). */
function EtiquetaItem({ item, origen, abierta, onAlternar, onPrecioCambiado }: {
  item: CostoPreparacion; origen: "Atelier" | "Cafetería"; abierta: boolean; onAlternar: () => void; onPrecioCambiado: () => Promise<void>;
}) {
  const Flecha = abierta ? ChevronDown : ChevronRight;
  if (item.categoria === "De Atelier") {
    return <div className="text-[10px] text-primary mt-0.5 px-0.5">de Atelier, a precio interno · {soles4(item.costo)} por und</div>;
  }
  if (item.tipo === "insumo") {
    return (
      <div className="mt-0.5 px-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-gray-600">
        <span className="rounded bg-gray-100 text-gray-700 font-medium px-1.5">Insumo</span>
        <PrecioInsumo item={item} origen={origen} onPrecioCambiado={onPrecioCambiado} />
      </div>
    );
  }
  return (
    <div className="mt-0.5 px-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-gray-600">
      <span className={`inline-flex items-center gap-1 rounded font-medium px-1.5 ${esSubreceta(item) ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
        {esSubreceta(item) && <Layers className="w-3 h-3" />}{esSubreceta(item) ? "Sub-receta" : "Producto de Atelier"}
      </span>
      <span className="tabular-nums">{soles4(item.costo)} por {item.unidad}</span>
      {item.detalle && item.detalle.ingredientes.length > 0 ? (
        <button type="button" onClick={onAlternar} className="inline-flex items-center text-primary underline decoration-dotted">
          <Flecha className="w-3 h-3" />{abierta ? "ocultar" : "ver"} sus {item.detalle.ingredientes.length} ingredientes
        </button>
      ) : <span className="text-gray-400">el Excel no trae su receta</span>}
    </div>
  );
}

/** Precio de un insumo con «cambiar»: vale desde hoy para todo el sistema (igual que en «Precios de insumos»). */
function PrecioInsumo({ item, origen, onPrecioCambiado }: { item: CostoPreparacion; origen: "Atelier" | "Cafetería"; onPrecioCambiado: () => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unidad = item.unidad === "l" ? "litro" : item.unidad === "und" ? "unidad" : "kg";

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await guardarPrecioInsumo({ origen, sku: item.ref, precio: num(valor) });
    if (r.ok) await onPrecioCambiado();
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    setEditando(false);
  }

  if (!editando) {
    return (
      <>
        <span className="tabular-nums">{soles4(item.costo)} por {item.unidad}</span>
        <button type="button" onClick={() => { setValor(item.costo.toFixed(2)); setEditando(true); }}
          className="inline-flex items-center gap-0.5 text-primary underline decoration-dotted">
          <Pencil className="w-3 h-3" /> cambiar precio
        </button>
      </>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 py-0.5">
      <span>S/</span>
      <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus aria-label={`Precio de ${item.nombre} por ${unidad}`}
        onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") setEditando(false); }}
        className="w-20 border border-gray-300 rounded px-1.5 py-0.5 text-right text-xs" />
      <span>por {unidad}</span>
      <button type="button" onClick={() => void guardar()} disabled={guardando || !(num(valor) > 0)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-white font-medium disabled:opacity-50">
        {guardando && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
      </button>
      <button type="button" onClick={() => setEditando(false)} className="text-gray-500">cancelar</button>
      <span className="basis-full text-gray-500">Cambia el precio desde hoy en todo el sistema: recetas, carta y «Precios de insumos».</span>
      {error && <span className="basis-full text-red-700">{error}</span>}
    </span>
  );
}

/** Lo que lleva una sub-receta (o producto) por dentro, con el precio de cada insumo editable. Se abre por niveles. */
function DentroDeReceta({ item, porRef, origen, onPrecioCambiado, nivel = 0 }: {
  item: CostoPreparacion; porRef: Map<string, CostoPreparacion>; origen: "Atelier" | "Cafetería"; onPrecioCambiado: () => Promise<void>; nivel?: number;
}) {
  const [abiertas, setAbiertas] = useState<Set<number>>(new Set());
  const d = item.detalle!;
  const rinde = item.tipo === "preparacion"
    ? (d.rendimiento ? `rinde ${d.rendimiento} kg` : "por kg de mezcla")
    : `rinde ${d.rendimiento ?? "—"} unidades`;
  return (
    <div className={`rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2 ${nivel > 0 ? "mt-1" : ""}`}>
      <div className="text-[11px] font-medium text-violet-900 mb-1">
        Dentro de «{item.nombre}» · {rinde}{d.merma ? ` · merma ${Math.round(d.merma * 1000) / 10}%` : ""}
      </div>
      <ul className="space-y-1">
        {d.ingredientes.map((g, k) => {
          const sub = g.ref ? porRef.get(g.ref) ?? null : null;
          const c = sub ? costoIngrediente(sub, g.cantidad, g.unidad) : null;
          const abierta = abiertas.has(k);
          return (
            <li key={k} className="text-[11px]">
              <div className="flex flex-wrap items-start gap-x-2">
                <span className="min-w-0 flex-1">
                  <span className="text-gray-900">{g.nombre}</span>
                  <span className="text-gray-500"> · {g.cantidad.toLocaleString("es-PE", { maximumFractionDigits: 3 })} {g.unidad}</span>
                  {sub && (
                    <span className="block">
                      <EtiquetaItem item={sub} origen={origen} abierta={abierta} onPrecioCambiado={onPrecioCambiado}
                        onAlternar={() => setAbiertas((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                    </span>
                  )}
                  {!sub && <span className="block text-amber-700">sin precio en la lista</span>}
                </span>
                <span className="tabular-nums text-gray-700">{c !== null ? soles4(c) : "—"}</span>
              </div>
              {sub?.detalle && abierta && nivel < 3 && (
                <DentroDeReceta item={sub} porRef={porRef} origen={origen} onPrecioCambiado={onPrecioCambiado} nivel={nivel + 1} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
