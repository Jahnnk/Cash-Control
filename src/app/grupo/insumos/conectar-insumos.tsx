"use client";

/**
 * Grupo → Insumos → Conectar insumos de Producción (antes en Recetas y costos) (paso 2 de «una sola lista de insumos», 24-nov-2026).
 *
 * Cada insumo de Producción con su pareja de Cash Control, para que en el paso 3 Producción lea la lista de aquí
 * (nombre, unidad, precio, archivado). Los de mismo nombre se conectan con un botón; el resto se revisa: conectar
 * la sugerencia, elegir otro, crearlo en Cash Control o marcar «no aplica». Plegado por defecto.
 * Reglas: lib/insumos-produccion.ts. Las parejas viven en recetas_produccion_parejas.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Layers, Loader2, Search } from "lucide-react";
import { conectarInsumosExactos, getConectarInsumos, guardarParejaProduccion, type DatosConectarInsumos } from "@/app/actions/recetas-produccion";
import { crearInsumoNuevo } from "@/app/actions/nueva-receta";
import { BuscadorCosto, soles4 } from "@/components/buscador-costo";
import { Pastilla, Segmentado } from "@/components/productos/ui";
import { textoEquivalencia, unidadesCalzan, type Candidato, type EstadoInsumo, type FilaInsumo } from "@/lib/insumos-produccion";
import { factorInsumoPorDefecto } from "@/lib/recetas-produccion";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";

type Vista = "revisar" | "listos";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
const MAX_FILAS = 80;
const MIDE: Record<FilaInsumo["base"], string> = { peso: "en gramos", volumen: "en ml", unidad: "por unidades" };

const ESTADO: Record<EstadoInsumo, { texto: string; tono: "verde" | "azul" | "gris" | "rojo" | "marca" }> = {
  conectado: { texto: "Conectado", tono: "verde" },
  noAplica: { texto: "No aplica", tono: "gris" },
  propia: { texto: "Se costea con su receta", tono: "gris" },
  exacta: { texto: "Mismo nombre", tono: "marca" },
  probable: { texto: "Probable", tono: "azul" },
  dudosa: { texto: "Dudosa", tono: "rojo" },
  nada: { texto: "Sin parecido", tono: "gris" },
};

export function ConectarInsumos() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<DatosConectarInsumos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("revisar");
  const [q, setQ] = useState("");
  const [verExactas, setVerExactas] = useState(false);
  const [recetaId, setRecetaId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<number | "todas" | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = async () => {
    const r = await getConectarInsumos();
    if (r.ok) { setDatos(r.data); setError(null); } else setError(r.error);
  };
  // Lee Producción solo cuando se abre la sección.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al abrir */
    if (abierto && !datos) void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [abierto, datos]);

  const filas = useMemo(() => datos?.filas ?? [], [datos]);
  const exactas = filas.filter((f) => f.estado === "exacta");
  const esListo = (f: FilaInsumo) => f.estado === "conectado" || f.estado === "noAplica" || f.estado === "propia";
  const receta = recetaId !== null ? datos?.recetas.find((x) => x.id === recetaId) ?? null : null;
  // Con una receta elegida se ven TODOS sus insumos (listos y por revisar), en vez de la pestaña.
  const lista = useMemo(() => {
    const t = sinTildes(q.trim());
    const deReceta = receta ? new Set(receta.insumos) : null;
    return filas.filter((f) => (deReceta ? deReceta.has(f.id) : vista === "listos" ? esListo(f) : ["probable", "dudosa", "nada"].includes(f.estado))
      && (!t || sinTildes(`${f.nombre} ${f.pareja?.nombre ?? ""} ${f.categoria ?? ""}`).includes(t)));
  }, [filas, vista, q, receta]);
  const pendientesDe = useMemo(() => {
    const porId = new Map(filas.map((f) => [f.id, f]));
    return (insumos: number[]) => insumos.filter((id) => { const f = porId.get(id); return f && !esListo(f); }).length;
  }, [filas]);
  const opciones = useMemo<CostoPreparacion[]>(() => (datos?.opciones ?? []).map((o) => ({ ...o, categoria: null })), [datos]);

  async function guardar(f: FilaInsumo, refCC: string | null, factor: number, borrar = false) {
    setOcupado(f.id);
    setAviso(null);
    const r = await guardarParejaProduccion({ tipo: "insumo", prodClave: String(f.id), prodNombre: f.nombre, refCC, factor, borrar });
    if (r.ok) await cargar();
    setOcupado(null);
    if (!r.ok) { setAviso(r.error); return false; }
    setEditando(null);
    return true;
  }

  async function conectarTodas() {
    if (!window.confirm(`¿Conectar los ${exactas.length} insumos que tienen el mismo nombre y la misma unidad en las dos apps?`)) return;
    setOcupado("todas");
    const r = await conectarInsumosExactos();
    if (r.ok) await cargar();
    setOcupado(null);
    setAviso(r.ok ? `${r.conectados} insumos conectados.` : r.error);
  }

  const r = datos?.resumen;
  return (
    <details className="group rounded-2xl border border-gray-200/80 bg-white px-4 py-3 sm:px-6" aria-label="Conectar insumos de Producción"
      onToggle={(e) => setAbierto((e.target as HTMLDetailsElement).open)}>
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold text-gray-900">Conectar insumos de Producción</h2>
        <span className="text-xs text-gray-500">{r ? `${r.listos} de ${r.total} listos` : "Paso 2 de una sola lista de insumos"}</span>
        <ChevronDown className="ml-auto h-4 w-4 self-center text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="mt-3 space-y-3">
        <p className="text-xs text-gray-500 leading-relaxed max-w-2xl">
          Cada insumo de Producción necesita su pareja en Cash Control. Cuando estén todos, Producción usará la lista de aquí:
          lo que agregues, archives o cambies de precio en «Precios de insumos» llegará solo a Producción. Nada cambia en Producción todavía.
        </p>

        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : !datos ? (
          <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : (
          <>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 text-center">
              {[
                { n: r!.listos, t: "listos" },
                { n: r!.exacta, t: "mismo nombre" },
                { n: r!.probable + r!.dudosa, t: "con sugerencia" },
                { n: r!.nada, t: "sin parecido" },
              ].map((x) => (
                <div key={x.t} className="rounded-xl bg-gray-50 px-3 py-2">
                  <div className="text-lg font-semibold tabular-nums text-gray-900">{x.n}</div>
                  <div className="text-[11px] text-gray-500">{x.t}</div>
                </div>
              ))}
            </div>

            {exactas.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-emerald-900">
                    <b>{exactas.length}</b> tienen el mismo nombre y la misma unidad en las dos apps.
                  </span>
                  <button type="button" onClick={() => setVerExactas((v) => !v)} className="text-xs text-primary underline decoration-dotted">
                    {verExactas ? "Ocultar lista" : "Ver lista"}
                  </button>
                  <button type="button" disabled={ocupado !== null} onClick={() => void conectarTodas()}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
                    {ocupado === "todas" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Conectar las {exactas.length}
                  </button>
                </div>
                {verExactas && (
                  <ul className="max-h-64 overflow-y-auto text-xs text-gray-700 divide-y divide-emerald-100">
                    {exactas.map((f) => (
                      <li key={f.id} className="py-1 flex gap-2">
                        <span className="flex-1">{f.nombre}</span>
                        <span className="text-gray-500">{f.pareja?.nombre} · {soles4(f.pareja!.costo)}/{f.pareja!.unidad}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-gray-600 flex items-center gap-2 w-full sm:w-auto">
                Receta
                <select value={recetaId ?? ""} onChange={(e) => { setRecetaId(e.target.value ? Number(e.target.value) : null); setEditando(null); }}
                  className="flex-1 sm:flex-none sm:max-w-[320px] border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white">
                  <option value="">Todas (por insumo)</option>
                  {datos.recetas.map((x) => {
                    const p = pendientesDe(x.insumos);
                    return <option key={x.id} value={x.id}>{x.nombre}{x.activa ? "" : " (apagada)"} · {p === 0 ? "lista" : `${p} por revisar`}</option>;
                  })}
                </select>
              </label>
              {!receta && <Segmentado tamano="sm" valor={vista} onChange={(v) => { setVista(v); setEditando(null); }}
                opciones={[
                  { valor: "revisar", etiqueta: `Por revisar · ${r!.probable + r!.dudosa + r!.nada}` },
                  { valor: "listos", etiqueta: `Listos · ${r!.listos}` },
                ]} />}
              <label className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm" />
              </label>
            </div>

            {receta && (
              <p className="text-xs text-gray-600">
                <b>{receta.nombre}</b> lleva {receta.insumos.length} insumos · {pendientesDe(receta.insumos) === 0 ? "todos listos" : `${pendientesDe(receta.insumos)} por revisar`}.
                {" "}<button type="button" onClick={() => setRecetaId(null)} className="text-primary underline decoration-dotted">Ver todas</button>
              </p>
            )}
            {aviso && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{aviso}</p>}

            {lista.length === 0 ? (
              <p className="text-sm text-gray-500">{receta ? "Nada con ese filtro en esta receta." : vista === "revisar" ? "No queda nada por revisar con ese filtro." : "Nada conectado con ese filtro."}</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {lista.slice(0, MAX_FILAS).map((f) => (
                  <FilaConectar key={f.id} f={f} opciones={opciones} ocupado={ocupado === f.id} editando={editando === f.id}
                    onEditar={(on) => setEditando(on ? f.id : null)} onGuardar={guardar}
                    onCreado={(nombre) => setAviso(`${nombre}: creado en Cash Control y conectado.`)} />
                ))}
              </ul>
            )}
            {lista.length > MAX_FILAS && <p className="text-[11px] text-gray-500">Se muestran {MAX_FILAS} de {lista.length}. Usa el buscador.</p>}
          </>
        )}
      </div>
    </details>
  );
}

function FilaConectar({ f, opciones, ocupado, editando, onEditar, onGuardar, onCreado }: {
  f: FilaInsumo; opciones: CostoPreparacion[]; ocupado: boolean; editando: boolean;
  onEditar: (on: boolean) => void;
  onGuardar: (f: FilaInsumo, refCC: string | null, factor: number, borrar?: boolean) => Promise<boolean>;
  onCreado: (nombre: string) => void;
}) {
  const listo = f.estado === "conectado" || f.estado === "noAplica" || f.estado === "propia";
  const e = ESTADO[f.estado];
  return (
    <li className="px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gray-900 flex flex-wrap items-center gap-1.5">
            {f.nombre}
            {f.esSubreceta && <span className="inline-flex items-center gap-1 rounded bg-violet-100 text-violet-800 text-[10px] font-medium px-1.5"><Layers className="w-3 h-3" />Sub-receta</span>}
          </div>
          <div className="text-[11px] text-gray-500">
            {f.categoria ?? "Sin categoría"} · {f.usos > 0 ? `en ${f.usos} receta${f.usos === 1 ? "" : "s"}` : "no va en recetas"} · se mide {MIDE[f.base]}
          </div>
        </div>
        <div className="text-right text-xs min-w-[200px]">
          <Pastilla tono={e.tono}>{e.texto}</Pastilla>
          {f.pareja && (
            <div className="mt-0.5 text-gray-700">
              → {f.pareja.nombre} <span className="text-gray-400">· {soles4(f.pareja.costo)}/{f.pareja.unidad}</span>
            </div>
          )}
          {f.estado === "propia" && (
            <div className="mt-0.5 text-[11px] text-gray-500 max-w-[260px] ml-auto">
              No está en Cash Control: su costo sale de sus ingredientes. Si la creas como sub-receta, conéctala aquí.
            </div>
          )}
          {f.estado === "conectado" && f.factor != null && f.pareja && (
            <div className="text-[10px] text-gray-400">{textoEquivalencia(f.base, f.pareja.unidad, f.factor)}</div>
          )}
          {!f.unidadOk && f.pareja && !listo && (
            <div className="text-[10px] text-amber-700">Las unidades no calzan: elige y pon la equivalencia.</div>
          )}
        </div>
      </div>

      {!editando && (
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs">
          {!listo && f.pareja && f.unidadOk && (
            <button type="button" disabled={ocupado} onClick={() => void onGuardar(f, f.pareja!.ref, f.factor ?? factorInsumoPorDefecto(f.pareja!.unidad))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-white font-medium disabled:opacity-50">
              {ocupado && <Loader2 className="w-3 h-3 animate-spin" />} Conectar
            </button>
          )}
          <button type="button" disabled={ocupado} onClick={() => onEditar(true)} className="font-medium text-primary">
            {f.estado === "propia" ? "Conectar con una sub-receta" : listo ? "Cambiar" : f.pareja ? "Elegir otro" : "Elegir o crear"}
          </button>
          {!listo && (
            <button type="button" disabled={ocupado} onClick={() => void onGuardar(f, null, 1)} className="text-gray-500 hover:text-gray-800"
              title="No es un insumo que se compre (o no hace falta su precio)">No aplica</button>
          )}
          {listo && f.estado !== "propia" && (
            <button type="button" disabled={ocupado} onClick={() => void onGuardar(f, null, 1, true)} className="text-gray-500 hover:text-gray-800">Quitar</button>
          )}
        </div>
      )}

      {editando && <EditorConexion f={f} opciones={opciones} ocupado={ocupado} onCancelar={() => onEditar(false)} onGuardar={onGuardar} onCreado={onCreado} />}
    </li>
  );
}

/** Elegir otra pareja (con su equivalencia si las unidades no calzan) o crear el insumo en Cash Control. */
function EditorConexion({ f, opciones, ocupado, onCancelar, onGuardar, onCreado }: {
  f: FilaInsumo; opciones: CostoPreparacion[]; ocupado: boolean; onCancelar: () => void;
  onGuardar: (f: FilaInsumo, refCC: string | null, factor: number) => Promise<boolean>;
  onCreado: (nombre: string) => void;
}) {
  const [modo, setModo] = useState<"elegir" | "crear">(f.pareja || f.estado !== "nada" || f.esSubreceta ? "elegir" : "crear");
  const [texto, setTexto] = useState(f.pareja?.nombre ?? "");
  const [elegido, setElegido] = useState<Candidato | null>(f.pareja);
  const [peso, setPeso] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: f.nombre, unidad: (f.base === "unidad" ? "und" : f.base === "volumen" ? "l" : "kg") as "kg" | "l" | "und", precio: "" });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const unidadCC = modo === "crear" ? nuevo.unidad : elegido?.unidad ?? null;
  const calza = unidadCC ? unidadesCalzan(f.base, unidadCC) : true;
  // Factor = unidades de Cash Control por 1 unidad interna de Producción.
  const factor = !unidadCC ? null
    : calza ? factorInsumoPorDefecto(unidadCC)
      : f.base === "unidad" ? (num(peso) > 0 ? num(peso) : null) // 1 unidad = X kg (o l)
        : num(peso) > 0 ? 1 / num(peso) : null; // 1 g = 1 ÷ (g por unidad) und
  const preguntaEquivalencia = unidadCC && !calza && (
    <label className="block text-[11px] text-gray-600 sm:col-span-3">
      {f.base === "unidad"
        ? `Producción lo cuenta por unidades y Cash Control lo compra por ${unidadCC}. ¿Cuántos ${unidadCC} es 1 unidad? (ej. 1 huevo = 0.06 kg)`
        : `Producción lo pesa ${MIDE[f.base]} y Cash Control lo compra por unidad. ¿Cuántos ${f.base === "volumen" ? "ml" : "gramos"} es 1 unidad?`}
      <input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)}
        className="mt-0.5 block w-full max-w-[160px] border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
    </label>
  );

  async function conectar() {
    if (!elegido || !factor) { setError(calza ? "Elige el insumo de Cash Control." : "Escribe la equivalencia."); return; }
    await onGuardar(f, elegido.ref, factor);
  }

  async function crear() {
    setCreando(true);
    setError(null);
    if (!factor) { setCreando(false); setError("Escribe la equivalencia."); return; }
    const r = await crearInsumoNuevo({ origen: "Atelier", nombre: nuevo.nombre, unidad: nuevo.unidad, precio: num(nuevo.precio) });
    if (!r.ok) { setCreando(false); setError(r.error); return; }
    const ok = await onGuardar(f, r.insumo.sku, factor);
    setCreando(false);
    if (ok) onCreado(r.insumo.nombre);
  }

  const campo = "mt-0.5 block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm";
  // Una sub-receta solo se conecta con una sub-receta (nunca con uno de sus ingredientes) y no se crea como insumo.
  const elegibles = f.esSubreceta ? opciones.filter((o) => o.tipo === "preparacion") : opciones;
  return (
    <div className="rounded-xl border border-primary/30 bg-emerald-50/40 p-3 space-y-2">
      {f.esSubreceta ? (
        <p className="text-[11px] text-gray-600">Es una sub-receta: elige la misma sub-receta de Cash Control. Si no existe, créala con «Nueva receta» → Sub-receta.</p>
      ) : (
        <Segmentado tamano="sm" valor={modo} onChange={(v) => { setModo(v); setError(null); }}
          opciones={[{ valor: "elegir", etiqueta: "Elegir de Cash Control" }, { valor: "crear", etiqueta: "No está: crearlo" }]} />
      )}
      {modo === "elegir" ? (
        <>
          <div className="text-[11px] text-gray-500">{f.esSubreceta ? "Sub-receta de Atelier" : "Insumo o sub-receta de Atelier"}
            <BuscadorCosto value={texto} elegido={!!elegido} catalogo={elegibles} resaltarSubrecetas placeholder="Buscar en Cash Control"
              onTexto={(t) => { setTexto(t); setElegido(null); }}
              onElegir={(i) => { setTexto(i.nombre); setElegido({ ref: i.ref, nombre: i.nombre, tipo: i.tipo, unidad: i.unidad, costo: i.costo }); }} />
          </div>
          {elegido && preguntaEquivalencia}
          {elegido && factor && <div className="text-[11px] text-gray-500">{textoEquivalencia(f.base, elegido.unidad, factor)}</div>}
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="text-[11px] text-gray-500">Nombre en Cash Control
            <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={campo} />
          </label>
          <label className="text-[11px] text-gray-500">Se compra por
            <select value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value as "kg" | "l" | "und" })} className={`${campo} bg-white`}>
              <option value="kg">kg</option><option value="l">litro</option><option value="und">unidad</option>
            </select>
          </label>
          <label className="text-[11px] text-gray-500">Precio por {nuevo.unidad === "l" ? "litro" : nuevo.unidad === "und" ? "unidad" : "kg"} (S/)
            <input inputMode="decimal" value={nuevo.precio} onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })} placeholder="ej. 12.00" className={campo} />
          </label>
          {preguntaEquivalencia}
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={ocupado || creando} onClick={() => void (modo === "elegir" ? conectar() : crear())}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg disabled:opacity-50">
          {(ocupado || creando) && <Loader2 className="w-3 h-3 animate-spin" />} {modo === "elegir" ? "Conectar" : "Crear y conectar"}
        </button>
        <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
      </div>
    </div>
  );
}
