"use client";

/**
 * Grupo → Acuerdos y tareas. Rediseño del 19-nov-2026 con lo mejor de tres referencias, en el estilo del panel:
 *   · Asana: alta rápida en una línea, «Mis tareas» por urgencia y detalle lateral.
 *   · Trello: tablero de tres columnas que se arrastran.
 *   · Monday: la Lista (grupos de color, estado de un toque, plazo) y el panel ejecutivo.
 * Tres estados, sin paso de confirmar: No iniciado, En progreso, Hecho (Jahnn, 19-nov-2026).
 * Pestañas: Mis tareas · Tablero · Lista · Reuniones · Panel ejecutivo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Home, Loader2, Search, Users } from "lucide-react";
import { getTableroAcuerdos, type Acuerdo, type Reunion, type YoSesion } from "@/app/actions/acuerdos";
import { AREA_LABEL, AREAS, conAlerta, diasRestantes, estadoVisible, ordenAcuerdos, type Area, type EstadoVisible, type Persona } from "@/lib/acuerdos";
import { Pastilla, Segmentado } from "@/components/productos/ui";
import { FranjaAlertas } from "@/components/acuerdos/franja-alertas";
import { FilaAcuerdo } from "@/components/acuerdos/fila-acuerdo";
import { DetalleAcuerdo } from "@/components/acuerdos/detalle-acuerdo";
import { AltaRapida } from "@/components/acuerdos/alta-rapida";
import { AreaTag, COLOR_ESTADO, colorPersona, diaCorto } from "@/components/acuerdos/ui";
import { Kanban } from "./kanban";
import { PanelEjecutivo } from "./panel-ejecutivo";
import { FormReunion } from "./form-reunion";
import { Cronograma } from "./cronograma";
import { GrupoMonday } from "./tabla-acuerdos";

type Vista = "mios" | "tablero" | "cronograma" | "lista" | "reuniones" | "panel";
type Datos = { hoy: string; yo: YoSesion; personas: Persona[]; acuerdos: Acuerdo[]; reuniones: Reunion[] };
type FiltroEstado = "abiertos" | "vencido" | "cerrados" | "todos";

/** Enlaces viejos y del Dashboard: ?vista=vencidos|todos|indicadores|resumen siguen funcionando. */
function deUrl(): { vista: Vista; estado: FiltroEstado; panel: "semana" | "mes" } {
  const v = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("vista");
  if (v === "vencidos") return { vista: "lista", estado: "vencido", panel: "semana" };
  if (v === "todos" || v === "lista") return { vista: "lista", estado: "abiertos", panel: "semana" };
  if (v === "indicadores") return { vista: "panel", estado: "abiertos", panel: "mes" };
  if (v === "resumen" || v === "panel") return { vista: "panel", estado: "abiertos", panel: "semana" };
  if (v === "tablero" || v === "cronograma" || v === "reuniones") return { vista: v, estado: "abiertos", panel: "semana" };
  return { vista: "mios", estado: "abiertos", panel: "semana" };
}

const SEL = "border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TableroAcuerdos() {
  const [inicio] = useState(deUrl);
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>(inicio.vista);
  const [reunionForm, setReunionForm] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>(inicio.estado);
  const [filtroArea, setFiltroArea] = useState("");
  const [filtroResp, setFiltroResp] = useState("");
  const [q, setQ] = useState("");
  const [agrupar, setAgrupar] = useState<"responsable" | "area" | "estado">("responsable");
  const [reunionAbierta, setReunionAbierta] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    const r = await getTableroAcuerdos();
    if (r.ok) { setD({ hoy: r.hoy, yo: r.yo, personas: r.personas, acuerdos: r.acuerdos, reuniones: r.reuniones }); setError(null); }
    else setError(r.error);
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  const activos = useMemo(() => d?.acuerdos.filter((a) => a.estado !== "anulado") ?? [], [d]);
  const mios = useMemo(() => (d ? ordenAcuerdos(activos.filter((a) => a.responsableClave === d.yo.clave && a.estado !== "cumplido"), d.hoy) : []), [d, activos]);
  const asignadosPorMi = useMemo(() => (d ? ordenAcuerdos(activos.filter((a) => a.creadoPorClave === d.yo.clave && a.responsableClave !== d.yo.clave && a.estado !== "cumplido"), d.hoy) : []), [d, activos]);

  /** El tablero y la lista comparten los filtros de persona y área. */
  const filtrar = useCallback((lista: Acuerdo[]) => {
    const t = sinTildes(q.trim());
    return lista.filter((a) => (!filtroArea || a.area === filtroArea) && (!filtroResp || a.responsableClave === filtroResp)
      && (!t || sinTildes(`${a.que} ${a.detalle ?? ""} ${a.responsableNombre} ${a.reunionTitulo ?? ""}`).includes(t)));
  }, [q, filtroArea, filtroResp]);

  const filtrados = useMemo(() => {
    if (!d) return [];
    return ordenAcuerdos(filtrar(d.acuerdos).filter((a) => {
      const v: EstadoVisible = estadoVisible(a, d.hoy);
      return filtroEstado === "todos" ? true
        : filtroEstado === "abiertos" ? v === "pendiente" || v === "en_proceso" || v === "vencido"
          : filtroEstado === "cerrados" ? v === "cumplido" || v === "anulado" : v === filtroEstado;
    }), d.hoy);
  }, [d, filtrar, filtroEstado]);

  if (error) return <p className="text-sm text-gray-600">{error}</p>;
  if (!d) return <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  function irAlInicio() {
    setReunionForm(false);
    setAbierto(null);
    setVista("mios");
    setFiltroEstado("abiertos");
    setFiltroArea("");
    setFiltroResp("");
    setQ("");
    setReunionAbierta(null);
    // Quita ?vista=… de la dirección para que recargar no vuelva a la pestaña vieja.
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const enDetalle = abierto !== null ? d.acuerdos.find((a) => a.id === abierto) ?? null : null;
  const recargar = () => void cargar();
  const responsables = Array.from(new Map(d.acuerdos.map((a) => [a.responsableClave, a.responsableNombre])).entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  const filas = (items: Acuerdo[], mostrarResponsable = true) => (
    <ul>{items.map((a) => <FilaAcuerdo key={a.id} a={a} yo={d.yo} hoy={d.hoy} mostrarResponsable={mostrarResponsable} onAbrir={() => setAbierto(a.id)} onCambio={recargar} />)}</ul>
  );

  // Mis tareas por urgencia, como «My tasks» de Asana.
  const dias = (a: Acuerdo) => diasRestantes(a.fechaLimite, d.hoy);
  const grupos: { titulo: string; items: Acuerdo[]; tono?: string }[] = [
    { titulo: "Vencidas", items: mios.filter((a) => dias(a) < 0), tono: "text-red-700" },
    { titulo: "Hoy y mañana", items: mios.filter((a) => dias(a) >= 0 && dias(a) <= 1), tono: "text-amber-700" },
    { titulo: "Próximos 7 días", items: mios.filter((a) => dias(a) > 1 && dias(a) <= 7) },
    { titulo: "Más adelante", items: mios.filter((a) => dias(a) > 7) },
  ];

  const filtros = (
    <div className="flex flex-wrap gap-2 items-center">
      <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} className={SEL} aria-label="Responsable">
        <option value="">Todas las personas</option>
        {responsables.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
      <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className={SEL} aria-label="Área">
        <option value="">Todas las áreas</option>
        {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
      </select>
      <label className="relative flex-1 min-w-[160px]">
        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className={`${SEL} w-full pl-8`} />
      </label>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* El título es el «inicio» del apartado (pedido de Jahnn, 19-nov-2026): cierra formularios y detalle,
              limpia filtros y vuelve a Mis tareas, sin usar la flecha de atrás del navegador. */}
          <h1 className="text-2xl font-semibold text-gray-900">
            <button type="button" onClick={irAlInicio} title="Volver al inicio de Acuerdos y tareas"
              className="inline-flex items-center gap-2 rounded-lg -mx-1 px-1 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary">
              <Home className="w-5 h-5 text-gray-400" aria-hidden />Acuerdos y tareas
            </button>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Cada tarea con un responsable y una fecha. Si pasa la fecha sin cumplirse, queda vencida sola.</p>
        </div>
        <button type="button" onClick={() => setReunionForm(!reunionForm)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 rounded-xl">
          <Users className="w-4 h-4" />Registrar reunión
        </button>
      </header>

      {reunionForm && <FormReunion d={d} onListo={() => { setReunionForm(false); setVista("reuniones"); recargar(); }} onCancelar={() => setReunionForm(false)} />}

      <AltaRapida personas={d.personas} hoy={d.hoy} onCreado={recargar} />

      <FranjaAlertas items={conAlerta(mios, d.hoy)} onVer={vista === "mios" ? undefined : () => setVista("mios")} />

      <Segmentado valor={vista} onChange={setVista} opciones={[
        { valor: "mios", etiqueta: `Mis tareas${mios.length ? ` (${mios.length})` : ""}` },
        { valor: "tablero", etiqueta: "Tablero" },
        { valor: "cronograma", etiqueta: "Cronograma" },
        { valor: "lista", etiqueta: "Lista" },
        { valor: "reuniones", etiqueta: "Reuniones" },
        { valor: "panel", etiqueta: "Panel ejecutivo" },
      ]} />

      {vista === "mios" && (
        <div className="space-y-4">
          <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-5">
            {mios.length === 0 ? <p className="text-sm text-gray-500 py-2">No tienes tareas abiertas.</p> : grupos.filter((g) => g.items.length).map((g) => (
              <div key={g.titulo} className="mt-2 first:mt-0">
                <h2 className={`text-xs font-semibold uppercase tracking-wide ${g.tono ?? "text-gray-500"}`}>{g.titulo} <span className="text-gray-400 font-normal">{g.items.length}</span></h2>
                {filas(g.items, false)}
              </div>
            ))}
          </section>
          {asignadosPorMi.length > 0 && (
            <details className="group bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                Lo que asigné a otros <span className="text-gray-400 font-normal">{asignadosPorMi.length}</span>
                <ChevronDown className="ml-auto w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2">{filas(asignadosPorMi)}</div>
            </details>
          )}
        </div>
      )}

      {vista === "tablero" && (
        <div className="space-y-3">
          {filtros}
          <Kanban acuerdos={filtrar(d.acuerdos)} yo={d.yo} hoy={d.hoy} onAbrir={setAbierto} onCambio={recargar} />
        </div>
      )}

      {vista === "cronograma" && (
        <div className="space-y-3">
          {filtros}
          <Cronograma acuerdos={filtrar(d.acuerdos)} hoy={d.hoy} onAbrir={setAbierto} />
        </div>
      )}

      {vista === "lista" && (
        <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-5 space-y-3">
          {filtros}
          <div className="flex flex-wrap items-center gap-2">
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)} className={SEL} aria-label="Estado">
              <option value="abiertos">Abiertos</option>
              <option value="vencido">Vencidos</option>
              <option value="cerrados">Hechos y anulados</option>
              <option value="todos">Todos</option>
            </select>
            <span className="text-xs text-gray-500 ml-auto">Agrupar por</span>
            <Segmentado tamano="sm" valor={agrupar} onChange={setAgrupar} opciones={[
              { valor: "responsable", etiqueta: "Persona" }, { valor: "area", etiqueta: "Área" }, { valor: "estado", etiqueta: "Estado" },
            ]} />
          </div>
          {filtrados.length === 0 ? <p className="text-sm text-gray-500 py-2">No hay acuerdos con ese filtro.</p> : (
            <Agrupado items={filtrados} por={agrupar} hoy={d.hoy} yo={d.yo} onAbrir={setAbierto} onCambio={recargar} />
          )}
        </section>
      )}

      {vista === "reuniones" && (
        <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-5">
          {d.reuniones.length === 0 ? <p className="text-sm text-gray-500 py-3">Todavía no hay reuniones. Usa «Registrar reunión».</p> : (
            <ul className="divide-y divide-gray-100">
              {d.reuniones.map((r) => {
                const abiertaR = reunionAbierta === r.id;
                const suyos = ordenAcuerdos(d.acuerdos.filter((a) => a.reunionId === r.id), d.hoy);
                return (
                  <li key={r.id} className="py-3">
                    <button type="button" onClick={() => setReunionAbierta(abiertaR ? null : r.id)} className="w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-gray-900">{r.titulo}</span>
                      <AreaTag area={r.area} />
                      <span className="text-xs text-gray-500">{diaCorto(r.fecha)} · {r.acuerdos} {r.acuerdos === 1 ? "acuerdo" : "acuerdos"}</span>
                      {r.abiertos > 0 ? <Pastilla tono="ambar">{r.abiertos} abiertos</Pastilla> : r.acuerdos > 0 ? <Pastilla tono="verde">todo cerrado</Pastilla> : null}
                      <ChevronDown className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${abiertaR ? "rotate-180" : ""}`} />
                    </button>
                    {abiertaR && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-gray-500">Registró {r.creadoPor}{r.asistentes ? ` · Asistentes: ${r.asistentes}` : ""}</p>
                        {r.notas && <p className="text-xs text-gray-700 whitespace-pre-line">{r.notas}</p>}
                        {suyos.length > 0 && filas(suyos)}
                        <AltaRapida personas={d.personas} hoy={d.hoy} reunion={{ id: r.id, area: r.area }} onCreado={recargar} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {vista === "panel" && <PanelEjecutivo acuerdos={d.acuerdos} reuniones={d.reuniones} hoy={d.hoy} inicial={inicio.panel} />}

      {enDetalle && (
        <DetalleAcuerdo key={enDetalle.id} a={enDetalle} yo={d.yo} hoy={d.hoy} personas={d.personas} onCambio={recargar} onCerrar={() => setAbierto(null)} />
      )}
    </div>
  );
}

const ORDEN_ESTADO: EstadoVisible[] = ["vencido", "en_proceso", "pendiente", "cumplido", "anulado"];
const ESTADO_TITULO: Record<EstadoVisible, string> = {
  vencido: "Vencidas", en_proceso: "En progreso", pendiente: "No iniciadas", cumplido: "Hechas", anulado: "Anuladas",
};
const COLOR_GRUPO_ESTADO: Record<EstadoVisible, string> = { ...COLOR_ESTADO, vencido: "#DC2626" };
/** Color de cada área para el título y el borde del grupo (los mismos tonos de su etiqueta). */
const COLOR_AREA: Record<Area, string> = {
  marketing: "#DB2777", administracion: "#0284C7", operaciones: "#059669", finanzas: "#7C3AED", calidad: "#D97706",
};

/** La lista agrupada, como los grupos de Monday: por persona, por área o por estado, cada uno con su color. */
function Agrupado({ items, por, hoy, yo, onAbrir, onCambio }: {
  items: Acuerdo[]; por: "responsable" | "area" | "estado"; hoy: string; yo: YoSesion; onAbrir: (id: number) => void; onCambio: () => void;
}) {
  const grupos = new Map<string, Acuerdo[]>();
  for (const a of items) {
    const k = por === "responsable" ? a.responsableClave : por === "area" ? a.area : estadoVisible(a, hoy);
    grupos.set(k, [...(grupos.get(k) ?? []), a]);
  }
  const claves = [...grupos.keys()].sort((x, y) => por === "estado"
    ? ORDEN_ESTADO.indexOf(x as EstadoVisible) - ORDEN_ESTADO.indexOf(y as EstadoVisible)
    : por === "area" ? AREAS.indexOf(x as Area) - AREAS.indexOf(y as Area)
      : grupos.get(x)![0].responsableNombre.localeCompare(grupos.get(y)![0].responsableNombre, "es"));
  return (
    <div className="space-y-5">
      {claves.map((k) => {
        const l = grupos.get(k)!;
        const titulo = por === "responsable" ? l[0].responsableNombre : por === "area" ? AREA_LABEL[k as Area] : ESTADO_TITULO[k as EstadoVisible];
        const color = por === "responsable" ? colorPersona(k) : por === "area" ? COLOR_AREA[k as Area] : COLOR_GRUPO_ESTADO[k as EstadoVisible];
        return (
          <GrupoMonday key={k} titulo={titulo} color={color} avatar={por === "responsable" ? { nombre: titulo, clave: k } : undefined}
            items={l} yo={yo} hoy={hoy} onAbrir={onAbrir} onCambio={onCambio} />
        );
      })}
    </div>
  );
}
