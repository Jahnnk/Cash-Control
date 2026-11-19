"use client";

/**
 * Grupo → Acuerdos y tareas (fase 1, 19-nov-2026).
 * Un solo lugar para los acuerdos de las reuniones y las tareas del día a día. Responde tres preguntas:
 * ¿qué tengo que hacer yo?, ¿qué está vencido o espera confirmación?, ¿qué salió de cada reunión?
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { crearAcuerdo, crearReunion, getTableroAcuerdos, type Acuerdo, type Reunion, type YoSesion } from "@/app/actions/acuerdos";
import { AREA_LABEL, AREAS, conAlerta, conteos, estadoVisible, ordenAcuerdos, type EstadoVisible, type Persona } from "@/lib/acuerdos";
import { AcuerdoItem, fechaLarga } from "@/components/acuerdos/acuerdo-item";
import { Kpi, Pastilla, Segmentado } from "@/components/productos/ui";
import { IndicadoresAcuerdos } from "./indicadores";
import { FranjaAlertas } from "@/components/acuerdos/franja-alertas";

type Vista = "mios" | "todos" | "reuniones" | "indicadores";
const VISTAS: Vista[] = ["mios", "todos", "reuniones", "indicadores"];
const vistaDeUrl = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("vista"));
type Datos = { hoy: string; yo: YoSesion; personas: Persona[]; acuerdos: Acuerdo[]; reuniones: Reunion[] };

const INPUT = "w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm bg-white";
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function TableroAcuerdos() {
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ?vista=indicadores (el aviso del Dashboard lleva directo). Al servidor no le importa: la primera pintura es el cargando.
  const [vista, setVista] = useState<Vista>(() => {
    const v = vistaDeUrl();
    return v === "vencidos" ? "todos" : VISTAS.includes(v as Vista) ? (v as Vista) : "mios";
  });
  const [form, setForm] = useState<null | "tarea" | "reunion">(null);
  const [filtroEstado, setFiltroEstado] = useState<"abiertos" | "vencido" | "por_confirmar" | "cerrados" | "todos">(() => (vistaDeUrl() === "vencidos" ? "vencido" : "abiertos"));
  const [filtroArea, setFiltroArea] = useState("");
  const [filtroResp, setFiltroResp] = useState("");
  const [q, setQ] = useState("");
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
  const porConfirmarDeOtros = useMemo(() => (d && d.yo.tipo === "direccion" ? activos.filter((a) => a.estado === "por_confirmar" && a.responsableClave !== d.yo.clave) : []), [d, activos]);
  const asignadosPorMi = useMemo(() => (d ? ordenAcuerdos(activos.filter((a) => a.creadoPorClave === d.yo.clave && a.responsableClave !== d.yo.clave && a.estado !== "cumplido"), d.hoy) : []), [d, activos]);

  const filtrados = useMemo(() => {
    if (!d) return [];
    const t = sinTildes(q.trim());
    return ordenAcuerdos(d.acuerdos.filter((a) => {
      const v: EstadoVisible = estadoVisible(a, d.hoy);
      const okEstado = filtroEstado === "todos" ? true
        : filtroEstado === "abiertos" ? v === "pendiente" || v === "en_proceso" || v === "vencido" || v === "por_confirmar"
          : filtroEstado === "cerrados" ? v === "cumplido" || v === "anulado" : v === filtroEstado;
      return okEstado && (!filtroArea || a.area === filtroArea) && (!filtroResp || a.responsableClave === filtroResp)
        && (!t || sinTildes(`${a.que} ${a.detalle ?? ""} ${a.responsableNombre} ${a.reunionTitulo ?? ""}`).includes(t));
    }), d.hoy);
  }, [d, q, filtroEstado, filtroArea, filtroResp]);

  if (error) return <p className="text-sm text-gray-600">{error}</p>;
  if (!d) return <div className="flex justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const c = conteos(activos, d.hoy);
  const responsables = Array.from(new Map(d.acuerdos.map((a) => [a.responsableClave, a.responsableNombre])).entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  const lista = (items: Acuerdo[], vacio: string, mostrarResponsable = true) => items.length === 0
    ? <p className="text-sm text-gray-500 py-3">{vacio}</p>
    : <ul className="divide-y divide-gray-100">{items.map((a) => <AcuerdoItem key={`${a.id}-${a.estado}-${a.fechaLimite}-${a.comentarios}`} a={a} yo={d.yo} hoy={d.hoy} personas={d.personas} mostrarResponsable={mostrarResponsable} onCambio={() => void cargar()} />)}</ul>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Acuerdos y tareas</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Todo lo que se acordó en las reuniones y lo que surge en el día a día. Cada tarea tiene un responsable y una fecha límite. Si pasa la fecha y no está cumplida, queda vencida sola.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setForm(form === "tarea" ? null : "tarea")} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-xl">
            <Plus className="w-4 h-4" />Nueva tarea
          </button>
          <button type="button" onClick={() => setForm(form === "reunion" ? null : "reunion")} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 rounded-xl">
            <Users className="w-4 h-4" />Registrar reunión
          </button>
        </div>
      </header>

      {form === "tarea" && <FormTarea d={d} onListo={() => { setForm(null); void cargar(); }} onCancelar={() => setForm(null)} />}
      {form === "reunion" && <FormReunion d={d} onListo={() => { setForm(null); setVista("reuniones"); void cargar(); }} onCancelar={() => setForm(null)} />}

      {/* Lo mío que pide moverse ya, y lo que espera mi confirmación: siempre a la vista (avisos en pantalla, 19-nov-2026). */}
      <FranjaAlertas items={conAlerta(mios, d.hoy)} porConfirmar={porConfirmarDeOtros.length} onVer={vista === "mios" ? undefined : () => setVista("mios")} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi etiqueta="Abiertos" valor={c.abiertos} detalle="pendientes o en proceso" />
        <Kpi etiqueta="Vencidos" valor={<span className={c.vencidos ? "text-red-700" : ""}>{c.vencidos}</span>} detalle="pasó la fecha sin cumplir" />
        <Kpi etiqueta="Por confirmar" valor={<span className={c.porConfirmar ? "text-amber-700" : ""}>{c.porConfirmar}</span>} detalle="el responsable dice que cumplió" />
        <Kpi etiqueta="Vencen hoy" valor={c.venceHoy} />
      </div>

      <Segmentado valor={vista} onChange={setVista} opciones={[
        { valor: "mios", etiqueta: `Lo mío (${mios.length})` },
        { valor: "todos", etiqueta: "Todos" },
        { valor: "reuniones", etiqueta: `Reuniones (${d.reuniones.length})` },
        { valor: "indicadores", etiqueta: "Indicadores" },
      ]} />

      {vista === "indicadores" && <IndicadoresAcuerdos />}

      {vista === "mios" && (
        <div className="space-y-4">
          {porConfirmarDeOtros.length > 0 && (
            <section className="bg-amber-50/60 rounded-2xl border border-amber-200 px-4 py-3 sm:px-6">
              <h2 className="text-[15px] font-semibold text-gray-900">Esperan tu confirmación</h2>
              <p className="text-xs text-gray-600 mt-0.5">El responsable dice que cumplió. Confírmalo o devuélvelo con el motivo.</p>
              {lista(porConfirmarDeOtros, "")}
            </section>
          )}
          <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
            <h2 className="text-[15px] font-semibold text-gray-900">Lo que tengo que hacer</h2>
            {lista(mios, "No tienes tareas abiertas.", false)}
          </section>
          <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
            <h2 className="text-[15px] font-semibold text-gray-900">Lo que asigné a otros</h2>
            {lista(asignadosPorMi, "No tienes tareas asignadas a otros abiertas.")}
          </section>
        </div>
      )}

      {vista === "todos" && (
        <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)} className={`${INPUT} w-auto`} aria-label="Estado">
              <option value="abiertos">Abiertos</option>
              <option value="vencido">Vencidos</option>
              <option value="por_confirmar">Por confirmar</option>
              <option value="cerrados">Cumplidos y anulados</option>
              <option value="todos">Todos</option>
            </select>
            <select value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)} className={`${INPUT} w-auto`} aria-label="Área">
              <option value="">Todas las áreas</option>
              {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
            </select>
            <select value={filtroResp} onChange={(e) => setFiltroResp(e.target.value)} className={`${INPUT} w-auto`} aria-label="Responsable">
              <option value="">Todos los responsables</option>
              {responsables.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            <label className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className={`${INPUT} pl-8`} />
            </label>
          </div>
          <p className="text-xs text-gray-500">{filtrados.length} {filtrados.length === 1 ? "acuerdo" : "acuerdos"}. Los cerrados se muestran hasta 90 días.</p>
          {lista(filtrados, "No hay acuerdos con ese filtro.")}
        </section>
      )}

      {vista === "reuniones" && (
        <section className="bg-white rounded-2xl border border-gray-200/80 px-4 py-3 sm:px-6">
          {d.reuniones.length === 0 ? <p className="text-sm text-gray-500 py-3">Todavía no hay reuniones registradas. Usa «Registrar reunión».</p> : (
            <ul className="divide-y divide-gray-100">
              {d.reuniones.map((r) => {
                const abierta = reunionAbierta === r.id;
                const suyos = ordenAcuerdos(d.acuerdos.filter((a) => a.reunionId === r.id), d.hoy);
                return (
                  <li key={r.id} className="py-3">
                    <button type="button" onClick={() => setReunionAbierta(abierta ? null : r.id)} className="w-full text-left flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-gray-900">{r.titulo}</span>
                      <Pastilla>{AREA_LABEL[r.area]}</Pastilla>
                      <span className="text-xs text-gray-500">{fechaLarga(r.fecha)} · {r.acuerdos} {r.acuerdos === 1 ? "acuerdo" : "acuerdos"}{r.abiertos ? ` · ${r.abiertos} abiertos` : r.acuerdos ? " · todo cerrado" : ""}</span>
                      <span className="ml-auto text-xs font-medium text-primary">{abierta ? "Cerrar" : "Ver"}</span>
                    </button>
                    {abierta && (
                      <div className="mt-2 pl-3 border-l-2 border-gray-100">
                        <p className="text-xs text-gray-500">Registró {r.creadoPor}{r.asistentes ? ` · Asistentes: ${r.asistentes}` : ""}</p>
                        {r.notas && <p className="text-xs text-gray-700 mt-1 whitespace-pre-line">{r.notas}</p>}
                        {lista(suyos, "Esta reunión no tiene acuerdos.")}
                        <FormTarea d={d} reunion={r} compacto onListo={() => void cargar()} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function SelectorPersona({ personas, valor, onChange }: { personas: Persona[]; valor: string; onChange: (v: string) => void }) {
  const grupos: [string, Persona[]][] = [
    ["Dirección", personas.filter((p) => p.tipo === "direccion")],
    ["Administradores", personas.filter((p) => p.tipo === "admin")],
    ["Equipo", personas.filter((p) => p.tipo === "equipo")],
  ];
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      <option value="">Elige…</option>
      {grupos.filter(([, l]) => l.length).map(([t, l]) => (
        <optgroup key={t} label={t}>{l.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}{p.tipo === "admin" ? ` · ${p.detalle.replace("Administración · ", "")}` : ""}</option>)}</optgroup>
      ))}
    </select>
  );
}

/** Una tarea suelta («del día a día») o un acuerdo más de una reunión ya registrada. */
function FormTarea({ d, reunion, compacto = false, onListo, onCancelar }: { d: Datos; reunion?: Reunion; compacto?: boolean; onListo: () => void; onCancelar?: () => void }) {
  const [f, setF] = useState({ que: "", detalle: "", area: reunion?.area ?? "", responsable: "", fechaLimite: "" });
  const [abierto, setAbierto] = useState(!compacto);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!abierto) return <button type="button" onClick={() => setAbierto(true)} className="mt-2 text-xs font-medium text-primary inline-flex items-center gap-1"><Plus className="w-3 h-3" />Agregar acuerdo a esta reunión</button>;

  async function guardar() {
    setOcupado(true);
    setError(null);
    const r = await crearAcuerdo({ ...f, reunionId: reunion?.id ?? null });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    setF({ que: "", detalle: "", area: reunion?.area ?? "", responsable: "", fechaLimite: "" });
    if (compacto) setAbierto(false);
    onListo();
  }

  return (
    <div className={`${compacto ? "mt-2 bg-gray-50" : "bg-white border border-gray-200/80"} rounded-2xl p-4 grid gap-3 sm:grid-cols-2`}>
      {!compacto && <h2 className="sm:col-span-2 text-[15px] font-semibold text-gray-900">Nueva tarea del día a día</h2>}
      <label className="sm:col-span-2 text-xs text-gray-600">Qué se hará
        <input autoFocus value={f.que} onChange={(e) => setF({ ...f, que: e.target.value })} className={INPUT} placeholder="Ej. Cambiar el letrero de precios de la vitrina" />
      </label>
      {!compacto && (
        <label className="sm:col-span-2 text-xs text-gray-600">Detalle (opcional)
          <textarea value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} rows={2} className={INPUT} />
        </label>
      )}
      <label className="text-xs text-gray-600">Responsable
        <SelectorPersona personas={d.personas} valor={f.responsable} onChange={(v) => setF({ ...f, responsable: v })} />
      </label>
      <label className="text-xs text-gray-600">Fecha límite
        <input type="date" value={f.fechaLimite} min={d.hoy} onChange={(e) => setF({ ...f, fechaLimite: e.target.value })} className={INPUT} />
      </label>
      {!reunion && (
        <label className="text-xs text-gray-600">Área
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className={INPUT}>
            <option value="">Elige…</option>
            {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
          </select>
        </label>
      )}
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado} onClick={() => void guardar()} className="px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
          {ocupado ? "Guardando…" : "Crear tarea"}
        </button>
        <button type="button" onClick={() => (compacto ? setAbierto(false) : onCancelar?.())} className="px-2 py-1 text-sm text-gray-500">Cancelar</button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}

type FilaAcuerdo = { que: string; responsable: string; fechaLimite: string };
const filaVacia = (): FilaAcuerdo => ({ que: "", responsable: "", fechaLimite: "" });

/** Una reunión con todos sus acuerdos, de una vez. */
function FormReunion({ d, onListo, onCancelar }: { d: Datos; onListo: () => void; onCancelar: () => void }) {
  const [f, setF] = useState({ fecha: d.hoy, area: "", titulo: "", asistentes: "", notas: "" });
  const [filas, setFilas] = useState<FilaAcuerdo[]>([filaVacia(), filaVacia()]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (i: number, cambio: Partial<FilaAcuerdo>) => setFilas(filas.map((x, j) => (j === i ? { ...x, ...cambio } : x)));

  async function guardar() {
    setOcupado(true);
    setError(null);
    const r = await crearReunion({ ...f, acuerdos: filas });
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    onListo();
  }

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl p-4 space-y-3">
      <h2 className="text-[15px] font-semibold text-gray-900">Registrar reunión</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-2 text-xs text-gray-600">Nombre de la reunión
          <input autoFocus value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} className={INPUT} placeholder="Ej. Reunión de marketing de noviembre" />
        </label>
        <label className="text-xs text-gray-600">Fecha
          <input type="date" value={f.fecha} max={d.hoy} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={INPUT} />
        </label>
        <label className="text-xs text-gray-600">Área
          <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className={INPUT}>
            <option value="">Elige…</option>
            {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2 text-xs text-gray-600">Asistentes (opcional)
          <input value={f.asistentes} onChange={(e) => setF({ ...f, asistentes: e.target.value })} className={INPUT} placeholder="Ej. Jahnn, Juani, coordinadora de marketing" />
        </label>
        <label className="sm:col-span-3 text-xs text-gray-600">Notas (opcional)
          <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} rows={2} className={INPUT} />
        </label>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800">Acuerdos</h3>
        <p className="text-xs text-gray-500">Qué se hará, quién y para cuándo. Las filas vacías no se guardan.</p>
        <div className="mt-2 space-y-2">
          {filas.map((x, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_200px_150px] items-end bg-gray-50 rounded-xl p-2">
              <label className="text-xs text-gray-600">{i + 1}. Qué se hará
                <input value={x.que} onChange={(e) => cambiar(i, { que: e.target.value })} className={INPUT} />
              </label>
              <label className="text-xs text-gray-600">Responsable
                <SelectorPersona personas={d.personas} valor={x.responsable} onChange={(v) => cambiar(i, { responsable: v })} />
              </label>
              <label className="text-xs text-gray-600">Fecha límite
                <input type="date" value={x.fechaLimite} min={d.hoy} onChange={(e) => cambiar(i, { fechaLimite: e.target.value })} className={INPUT} />
              </label>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setFilas([...filas, filaVacia()])} className="mt-2 text-xs font-medium text-primary inline-flex items-center gap-1"><Plus className="w-3 h-3" />Otro acuerdo</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={ocupado} onClick={() => void guardar()} className="px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
          {ocupado ? "Guardando…" : "Guardar reunión"}
        </button>
        <button type="button" onClick={onCancelar} className="px-2 py-1 text-sm text-gray-500">Cancelar</button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    </div>
  );
}
