"use client";

/**
 * Grupo → Insumos (fase 1, 24-nov-2026). La base de todas las recetas: cada insumo con su precio, su categoría y
 * qué tan importante es. Arriba 4 cifras que también filtran; luego filtros de un clic, buscador y la lista por
 * categoría (plegada, con resumen). Al tocar un insumo se abre su ficha. Motor: lib/insumos-ficha.ts.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Plus, Search, Star } from "lucide-react";
import type { DatosInsumos, FichaInsumo } from "@/app/actions/insumos";
import { Pastilla, Segmentado, nombreMes } from "@/components/productos/ui";
import { DIAS_PRECIO_VIEJO, categoriaDelSku, diasEntre, esCritico, factorPresentacion, precioPorPresentacion, tonoEdad, ultimoCambio, type Presentacion } from "@/lib/insumos-ficha";
import { Ficha, type AccionesFicha } from "./ficha";
import { InsumoNuevo } from "./insumo-nuevo";
import { soles, solesRedondo, TONO_EDAD, textoEdad } from "./piezas";

type Origen = "Atelier" | "Cafetería";
type Filtro = "todos" | "criticos" | "viejo" | "sinUso" | "subieron" | "archivados";

const PACKAGING = "Packaging";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clave = (i: { origen: string; sku: string }) => `${i.origen}|${i.sku}`;

export function InsumosVista({ datos, acciones, onCreado }: {
  datos: DatosInsumos;
  acciones: AccionesFicha;
  onCreado: () => Promise<void>;
}) {
  const [origen, setOrigen] = useState<Origen>("Atelier");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [ficha, setFicha] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  // Sesión de revisión: ver solo lo que falta revisar (se combina con cualquier filtro).
  const [soloSinRevisar, setSoloSinRevisar] = useState(false);

  const delOrigen = useMemo(() => datos.insumos.filter((i) => i.origen === origen), [datos.insumos, origen]);
  const grupos = useMemo(() => {
    const activos = delOrigen.filter((i) => !i.archivado);
    const criticos = activos.filter((i) => i.critico);
    return {
      todos: activos,
      criticos,
      viejo: criticos.filter((i) => diasEntre(i.fecha, datos.hoy) > DIAS_PRECIO_VIEJO),
      sinUso: activos.filter((i) => i.recetas.length === 0 && i.productos.length === 0),
      subieron: activos.filter((i) => (i.cambio?.pct ?? 0) > 0),
      archivados: delOrigen.filter((i) => i.archivado),
    } satisfies Record<Filtro, FichaInsumo[]>;
  }, [delOrigen, datos.hoy]);

  const gastoOrigen = grupos.todos.reduce((t, i) => t + i.gastoMes, 0);
  const gastoCriticos = grupos.criticos.reduce((t, i) => t + i.gastoMes, 0);
  const pctCriticos = gastoOrigen > 0 ? Math.round((gastoCriticos / gastoOrigen) * 100) : 0;

  const lista = useMemo(() => {
    const t = sinTildes(q.trim());
    return grupos[filtro].filter((i) => (!soloSinRevisar || !i.revisado) && (!categoria || i.categoria === categoria) && (!t || sinTildes(`${i.nombre} ${i.sku} ${i.nombreExcel ?? ""}`).includes(t)));
  }, [grupos, filtro, categoria, q, soloSinRevisar]);

  // Por categoría: las que más gastan primero; adentro, críticos y luego por gasto.
  const porCategoria = useMemo(() => {
    const m = new Map<string, FichaInsumo[]>();
    for (const i of lista) m.set(i.categoria, [...(m.get(i.categoria) ?? []), i]);
    return [...m.entries()]
      .map(([cat, items]) => ({
        cat,
        items: items.sort((a, b) => Number(b.critico) - Number(a.critico) || b.gastoMes - a.gastoMes || a.nombre.localeCompare(b.nombre, "es")),
        gasto: items.reduce((t, i) => t + i.gastoMes, 0),
        criticos: items.filter((i) => i.critico).length,
      }))
      // El packaging va siempre al final, en su propio bloque: así se encuentra aunque pese poco en el gasto.
      .sort((a, b) => Number(a.cat === PACKAGING) - Number(b.cat === PACKAGING) || b.gasto - a.gasto || a.cat.localeCompare(b.cat, "es"));
  }, [lista]);

  const buscando = filtro !== "todos" || !!q.trim() || !!categoria || soloSinRevisar;
  const revisados = grupos.todos.filter((i) => i.revisado).length;
  const criticosRevisados = grupos.criticos.filter((i) => i.revisado).length;
  // «Revisado y siguiente»: el próximo sin revisar en el orden de la lista que se está viendo.
  const ordenLista = porCategoria.flatMap((g) => g.items);
  const siguienteDe = (actual: string): string | null => {
    const k = ordenLista.findIndex((i) => clave(i) === actual);
    const resto = [...ordenLista.slice(k + 1), ...ordenLista.slice(0, Math.max(0, k))];
    const s = resto.find((i) => !i.revisado && clave(i) !== actual);
    return s ? clave(s) : null;
  };
  const categoriasOrigen = useMemo(() => [...new Set(delOrigen.map((i) => i.categoria))].sort((a, b) => a.localeCompare(b, "es")), [delOrigen]);
  const abierta = ficha ? datos.insumos.find((i) => clave(i) === ficha) ?? null : null;
  const alternar = (cat: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  const mesesTexto = datos.meses.length > 0 ? `${nombreMes(datos.meses[0], true)}–${nombreMes(datos.meses[datos.meses.length - 1], true)}` : null;

  const CHIPS: { valor: Filtro; etiqueta: string }[] = [
    { valor: "todos", etiqueta: "Todos" },
    { valor: "criticos", etiqueta: "Críticos" },
    { valor: "viejo", etiqueta: "Precio viejo" },
    { valor: "sinUso", etiqueta: "Sin uso" },
    { valor: "subieron", etiqueta: "Subieron" },
    { valor: "archivados", etiqueta: "Archivados" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado valor={origen} onChange={(v) => { setOrigen(v); setCategoria(""); setAbiertas(new Set()); }}
          opciones={[
            { valor: "Atelier", etiqueta: "Compra Atelier" },
            { valor: "Cafetería", etiqueta: "Compran las cafeterías" },
          ]} />
        <button type="button" onClick={() => setNuevo(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-light">
          <Plus className="h-4 w-4" /> Insumo nuevo
        </button>
      </div>

      {nuevo && <InsumoNuevo origen={origen} nombreInicial={q.trim()} onCerrar={() => setNuevo(false)} onCreado={async (nombre) => { setNuevo(false); setQ(nombre); setFiltro("todos"); await onCreado(); }} />}

      {/* Las 4 cifras: también son filtros. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra activa={filtro === "todos"} onClick={() => setFiltro("todos")} etiqueta="Activos" valor={grupos.todos.length}
          detalle={`${grupos.archivados.length} archivados`} />
        <Cifra activa={filtro === "criticos"} onClick={() => setFiltro("criticos")} etiqueta="Críticos" valor={grupos.criticos.length} tono="ambar"
          icono={<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />}
          detalle={gastoOrigen > 0 ? `${pctCriticos}% del gasto ${origen === "Atelier" ? "de Atelier" : "de las cafeterías"}` : "los marcas a mano"} />
        <Cifra activa={filtro === "viejo"} onClick={() => setFiltro("viejo")} etiqueta="Precio viejo" valor={grupos.viejo.length} tono={grupos.viejo.length > 0 ? "rojo" : "verde"}
          detalle={`críticos con +${DIAS_PRECIO_VIEJO} días`} />
        <Cifra activa={filtro === "sinUso"} onClick={() => setFiltro("sinUso")} etiqueta="Sin uso" valor={grupos.sinUso.length}
          detalle="¿se siguen comprando?" />
      </div>

      {/* Avance de la revisión (sesiones con Luis) */}
      <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Revisión</span>
          <span className="text-xs text-gray-600">{revisados} de {grupos.todos.length} revisados · críticos {criticosRevisados} de {grupos.criticos.length}</span>
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
            <input type="checkbox" checked={soloSinRevisar} onChange={(e) => setSoloSinRevisar(e.target.checked)} /> Solo sin revisar
          </label>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${grupos.todos.length ? Math.round((revisados / grupos.todos.length) * 100) : 0}%` }} />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
          {CHIPS.map((c) => (
            <button key={c.valor} type="button" onClick={() => setFiltro(c.valor)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filtro === c.valor ? "bg-primary text-white" : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"}`}>
              {c.etiqueta} <span className={filtro === c.valor ? "text-white/70" : "text-gray-400"}>{grupos[c.valor].length}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar, ej. mantequilla"
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm" />
          </label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría"
            className="max-w-[45%] rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm text-gray-700">
            <option value="">Todas las categorías</option>
            {categoriasOrigen.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {filtro === "sinUso" && (
        <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">
          No están en ninguna receta de Atelier ni en un producto de la carta. Algunos pueden ser de uso suelto (limpieza, empaques). Si ya no se compran, ábrelos y archívalos.
        </p>
      )}
      {filtro === "viejo" && grupos.viejo.length === 0 && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Todos los críticos tienen un precio de los últimos {DIAS_PRECIO_VIEJO} días.</p>
      )}

      {/* La lista por categoría */}
      {porCategoria.length === 0 ? (
        <p className="rounded-2xl border border-gray-200/80 bg-white p-6 text-center text-sm text-gray-500">No hay insumos con ese filtro.</p>
      ) : (
        <div className="space-y-2">
          {porCategoria.map((g) => {
            const abierto = buscando || abiertas.has(g.cat);
            return (
              <div key={g.cat}>
              {g.cat === PACKAGING && porCategoria.length > 1 && (
                <p className="mb-2 mt-5 px-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Lo que va con el producto: empaques, vasos, bolsas, papel</p>
              )}
              <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
                <button type="button" onClick={() => alternar(g.cat)} disabled={buscando} aria-expanded={abierto}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default sm:px-5">
                  {!buscando && (abierto ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />)}
                  <span className="text-[15px] font-semibold text-gray-900">{g.cat}</span>
                  <span className="text-xs text-gray-500">{g.items.length}</span>
                  {g.criticos > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-700"><Star className="h-3 w-3 fill-amber-400 text-amber-500" />{g.criticos}</span>
                  )}
                  {g.gasto > 0 && gastoOrigen > 0 && (
                    <span className="ml-auto text-right text-xs text-gray-500">
                      <span className="hidden sm:inline">{solesRedondo(g.gasto)} al mes · </span>{Math.round((g.gasto / gastoOrigen) * 100)}% del gasto
                    </span>
                  )}
                </button>
                {abierto && (
                  <ul className="divide-y divide-gray-100 border-t border-gray-100">
                    {g.items.map((i) => <Fila key={clave(i)} i={i} hoy={datos.hoy} maxGasto={g.items[0] ? Math.max(...g.items.map((x) => x.gastoMes)) : 0}
                      onAbrir={() => setFicha(clave(i))}
                      onEstrella={() => void acciones.guardarFicha(i, { critico: !i.critico })} />)}
                  </ul>
                )}
              </section>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-gray-400">
        Críticos: el sistema propone los insumos que juntos hacen el 80% del gasto; la estrella a mano manda.
        {mesesTexto ? ` El gasto se estima con lo que vendieron las cafeterías (${mesesTexto}, promedio al mes) y la receta de cada producto.` : ""}
        {" "}Lo que Atelier vende a clientes B2B todavía no entra en esa cuenta.
      </p>

      {abierta && <Ficha key={clave(abierta)} insumo={abierta} hoy={datos.hoy} categorias={datos.categorias} acciones={acciones} onCerrar={() => setFicha(null)}
        onSiguiente={() => { const s = siguienteDe(clave(abierta)); setFicha(s); }} />}
    </div>
  );
}

function Cifra({ etiqueta, valor, detalle, activa, onClick, tono, icono }: {
  etiqueta: string; valor: number; detalle: string; activa: boolean; onClick: () => void; tono?: "ambar" | "rojo" | "verde"; icono?: React.ReactNode;
}) {
  const color = tono === "rojo" ? "text-red-700" : tono === "ambar" ? "text-amber-700" : tono === "verde" ? "text-emerald-700" : "text-gray-900";
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={`rounded-2xl border bg-white p-4 text-left transition-shadow hover:shadow-sm ${activa ? "border-primary ring-1 ring-primary" : "border-gray-200/80"}`}>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">{icono}{etiqueta}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{valor}</div>
      <div className="text-[11px] text-gray-500">{detalle}</div>
    </button>
  );
}

function Fila({ i, hoy, maxGasto, onAbrir, onEstrella }: { i: FichaInsumo; hoy: string; maxGasto: number; onAbrir: () => void; onEstrella: () => void }) {
  const dias = diasEntre(i.fecha, hoy);
  const usos = i.recetas.length + i.productos.length;
  return (
    <li className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/70 sm:px-4">
      <button type="button" onClick={onEstrella} aria-label={i.critico ? `Quitar ${i.nombre} de críticos` : `Marcar ${i.nombre} como crítico`}
        title={i.critico ? (i.criticoManual === null ? "Crítico (lo propone el sistema)" : "Crítico (puesto a mano)") : "Marcar como crítico"}
        className="shrink-0 rounded-md p-1 hover:bg-amber-50">
        <Star className={`h-4 w-4 ${i.critico ? "fill-amber-400 text-amber-500" : "text-gray-300"}`} />
      </button>
      <button type="button" onClick={onAbrir} className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-left sm:grid-cols-[minmax(0,1fr)_150px_110px_auto]">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-gray-900">{i.nombre}</span>
          <span className="flex flex-wrap items-center gap-1 text-[11px] text-gray-400">
            {i.sku} · por {i.unidad}
            {usos === 0 ? <span className="text-gray-400">· sin uso</span> : <span>· {i.recetas.length > 0 ? `${i.recetas.length} receta${i.recetas.length === 1 ? "" : "s"}` : ""}{i.recetas.length > 0 && i.productos.length > 0 ? " · " : ""}{i.productos.length > 0 ? `${i.productos.length} producto${i.productos.length === 1 ? "" : "s"}` : ""}</span>}
            {i.creadoAqui && <Pastilla tono="marca">Creado aquí</Pastilla>}
            {i.revisado && <span className="inline-flex items-center gap-0.5 text-emerald-700" title={`Revisado por ${i.revisado.por}`}><CheckCircle2 className="h-3 w-3" /> revisado</span>}
          </span>
        </span>
        {/* Gasto (en pantallas anchas) */}
        <span className="hidden sm:block">
          {i.gastoMes > 0 ? (
            <>
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <span className="block h-full rounded-full bg-[#098B5F]" style={{ width: `${maxGasto > 0 ? Math.max(3, (i.gastoMes / maxGasto) * 100) : 0}%` }} />
              </span>
              <span className="mt-0.5 block text-[11px] text-gray-500">{solesRedondo(i.gastoMes)} al mes</span>
            </>
          ) : <span className="text-[11px] text-gray-300">—</span>}
        </span>
        <span className="text-right">
          <span className="block whitespace-nowrap text-sm font-medium tabular-nums text-gray-900">{soles(i.precio)}<span className="text-[11px] font-normal text-gray-400"> /{i.unidad}</span></span>
          {(() => {
            const f = factorPresentacion(i.unidad, i.presentacion);
            return f != null && i.presentacion ? <span className="block whitespace-nowrap text-[11px] text-gray-500">{solesRedondo(precioPorPresentacion(i.precio, f))} {i.presentacion.nombre}</span> : null;
          })()}
          {i.cambio && i.cambio.pct !== 0 && (
            <span className={`block text-[11px] font-medium ${i.cambio.pct > 0 ? "text-red-700" : "text-emerald-700"}`}>{i.cambio.pct > 0 ? "▲ +" : "▼ "}{i.cambio.pct}%</span>
          )}
        </span>
        <span className="col-span-2 sm:col-span-1 sm:text-right">
          <Pastilla tono={TONO_EDAD[tonoEdad(dias)]}>{textoEdad(dias)}</Pastilla>
        </span>
      </button>
    </li>
  );
}

/** Lo que cambia en la lista sin volver a leer todo (estrella, categoría, nombre, archivo, precio). */
export function aplicarCambio(i: FichaInsumo, c: Partial<{ categoria: string | null; critico: boolean | null; nombre: string | null; presentacion: Presentacion | null; archivado: boolean; precio: number; hoy: string; revisado: FichaInsumo["revisado"] }>): FichaInsumo {
  const n = { ...i };
  if (c.revisado !== undefined) n.revisado = c.revisado;
  if (c.presentacion !== undefined) n.presentacion = c.presentacion;
  if (c.critico !== undefined) { n.criticoManual = c.critico; n.critico = esCritico(c.critico, i.criticoSugerido); }
  if (c.categoria !== undefined) { n.categoriaElegida = c.categoria != null; n.categoria = c.categoria ?? categoriaDelSku(i.sku); }
  if (c.nombre !== undefined) {
    const excel = i.nombreExcel ?? i.nombre;
    n.nombre = c.nombre ?? excel;
    n.nombreExcel = c.nombre && c.nombre !== excel ? excel : null;
  }
  if (c.archivado !== undefined) n.archivado = c.archivado;
  if (c.precio !== undefined && c.hoy) {
    n.precio = c.precio;
    n.fecha = c.hoy;
    n.delSistema = true;
    n.historial = [...i.historial.filter((p) => p.fecha !== c.hoy), { fecha: c.hoy, precio: c.precio }];
    n.cambio = ultimoCambio(n.historial);
  }
  return n;
}
