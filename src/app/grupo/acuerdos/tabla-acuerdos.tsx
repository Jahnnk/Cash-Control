"use client";

/**
 * Acuerdos y tareas → Lista al estilo Monday (pedido de Jahnn, 19-nov-2026, con una captura de Monday):
 *   · Cada grupo (persona, área o estado) es una tabla con su color en el borde y en el título; se pliega.
 *   · Columnas: Tarea · Estado · Responsable · Fecha límite · Plazo · Prioridad · Área. El Estado va segundo
 *     para que en el celular se vea junto a la tarea sin deslizar.
 *   · El Estado es un bloque de color que se cambia de un toque (No iniciado, En progreso, Hecho).
 *   · El Plazo es una barra Desde → Hasta (fecha límite), rellena hasta hoy. «Desde» lo elige quien edita
 *     (p. ej. del 19 al 21); si no se eligió, es el día en que se creó la tarea.
 *   · Al pie de cada grupo, la barra de estados (cuánto hay de cada color) y el plazo total del grupo.
 * Celdas que se editan ahí mismo (Jahnn, 19-nov-2026): Responsable abre la lista del equipo, Fecha límite abre el
 * calendario, Plazo abre Desde / Hasta (mover la fecha límite pide el motivo, regla de siempre), Prioridad y Área abren su lista. Solo para quien puede
 * editar (dirección o quien la creó); a los demás el toque les abre el detalle. La Tarea siempre abre el detalle.
 * En el celular la tabla se desliza de lado, como en Monday.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { editarAcuerdo, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { AREA_LABEL, AREAS, ESTADO_LABEL, MAX_MOTIVO, PRIORIDAD_LABEL, PRIORIDADES, estadoVisible, nombreConApoyos, puede, type Persona } from "@/lib/acuerdos";
import { useCambiarEstado, yoPara } from "@/components/acuerdos/fila-acuerdo";
import { SelectorPersona } from "@/components/acuerdos/alta-rapida";
import { useToast } from "@/components/toast-provider";
import { AvanceSubtareas, ParteDe, Avatar, AreaTag, COLOR_ESTADO, EstadoCelda, PrioridadIcono, diaCorto, Responsables } from "@/components/acuerdos/ui";

const COLS = "grid grid-cols-[minmax(170px,1fr)_118px_150px_104px_150px_92px_120px] sm:grid-cols-[minmax(240px,1fr)_128px_150px_104px_150px_92px_120px]";
const CELDA = "flex items-center h-10 px-3 border-r border-gray-200 min-w-0";
const ROJO = "#DC2626";
/** Un control invisible encima de la celda: el toque abre directo la lista o el calendario. */
const ENCIMA = "absolute inset-0 h-full w-full cursor-pointer opacity-0";
const EDITABLE = "relative hover:bg-gray-100";
const sinAbrir = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };

const ms = (f: string) => Date.parse(`${f}T12:00:00Z`);

/** Rango corto: «12 – 20 nov» o «28 oct – 4 nov». */
function rango(desde: string, hasta: string) {
  if (desde >= hasta) return diaCorto(hasta);
  return desde.slice(0, 7) === hasta.slice(0, 7) ? `${Number(desde.slice(8, 10))} – ${diaCorto(hasta)}` : `${diaCorto(desde)} – ${diaCorto(hasta)}`;
}

/** La barra de plazo de Monday: de la asignación a la fecha límite, rellena hasta hoy. */
function Plazo({ desde, hasta, hoy, color, lleno }: { desde: string; hasta: string; hoy: string; color: string; lleno?: boolean }) {
  const total = Math.max(1, ms(hasta) - ms(desde));
  const pct = lleno ? 100 : Math.max(0, Math.min(100, ((ms(hoy) - ms(desde)) / total) * 100));
  return (
    <span className="relative flex h-6 w-full items-center justify-center overflow-hidden rounded-full bg-gray-700 text-[11px] font-medium text-white"
      title={`Asignada el ${diaCorto(desde)} · vence el ${diaCorto(hasta)}`}>
      <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: color }} />
      <span className="relative whitespace-nowrap px-2">{rango(desde, hasta)}</span>
    </span>
  );
}

/**
 * Cambiar fechas: Desde / Hasta (Plazo) o solo la fecha límite. Hasta = fecha límite: si cambia, pide el motivo
 * (queda en la actividad), igual que en el detalle. Cambiar solo el Desde no pide motivo.
 */
function CambiarFechas({ a, hoy, desdeInicial, hastaInicial, conDesde, onGuardar, onCancelar }: {
  a: Acuerdo; hoy: string; desdeInicial: string; hastaInicial: string; conDesde: boolean;
  onGuardar: (c: { fechaInicio?: string; fechaLimite: string; motivoFecha?: string }) => Promise<boolean>; onCancelar: () => void;
}) {
  const [desde, setDesde] = useState(desdeInicial);
  const [hasta, setHasta] = useState(hastaInicial);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const mueveLimite = hasta !== a.fechaLimite;
  const dias = desde && hasta ? Math.round((ms(hasta) - ms(desde)) / 86_400_000) + 1 : 0;
  const error = !hasta ? "Elige la fecha límite." : conDesde && !desde ? "Elige desde cuándo." : conDesde && desde > hasta ? "«Desde» no puede ser después de «Hasta»." : null;
  const listo = !error && (!mueveLimite || motivo.trim()) && (mueveLimite || (conDesde && desde !== desdeInicial));
  async function guardar() {
    if (!listo) return;
    setOcupado(true);
    const ok = await onGuardar({ ...(conDesde ? { fechaInicio: desde } : {}), fechaLimite: hasta, ...(mueveLimite ? { motivoFecha: motivo } : {}) });
    setOcupado(false);
    if (ok) onCancelar();
  }
  const CAMPO = "w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label={conDesde ? "Cambiar plazo" : "Cambiar fecha límite"}
      onKeyDown={(e) => { if (e.key === "Escape") onCancelar(); if (e.key === "Enter") void guardar(); }}>
      <div className="absolute inset-0 bg-black/20" onClick={onCancelar} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl space-y-3">
        <p className="text-sm font-semibold text-gray-900">{a.que}</p>
        <div className={`grid gap-2 ${conDesde ? "grid-cols-2" : ""}`}>
          {conDesde && (
            <label className="text-xs text-gray-500 space-y-1">Desde
              <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={CAMPO} />
            </label>
          )}
          <label className="text-xs text-gray-500 space-y-1">{conDesde ? "Hasta (fecha límite)" : "Fecha límite"}
            <input type="date" value={hasta} min={mueveLimite ? hoy : undefined} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
          </label>
        </div>
        {conDesde && !error && <p className="text-xs text-gray-600">{dias} {dias === 1 ? "día" : "días"}: {rango(desde, hasta)}</p>}
        {error && <p className="text-xs text-red-700">{error}</p>}
        {mueveLimite && (
          <input autoFocus value={motivo} maxLength={MAX_MOTIVO} onChange={(e) => setMotivo(e.target.value)}
            placeholder={`¿Por qué cambia la fecha límite? (${diaCorto(a.fechaLimite)} → ${hasta ? diaCorto(hasta) : "…"})`} className={CAMPO} />
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="px-3 py-1.5 text-xs font-medium text-gray-600">Cancelar</button>
          <button type="button" onClick={() => void guardar()} disabled={ocupado || !listo}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-primary hover:bg-primary-light disabled:opacity-50">{ocupado ? "Guardando…" : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

export function GrupoMonday({ titulo, color, avatar, items, yo, hoy, personas, comoResponsable = false, onAbrir, onCambio }: {
  titulo: string;
  color: string;
  avatar?: { nombre: string; clave: string };
  items: Acuerdo[];
  yo: YoSesion;
  hoy: string;
  /** Con la lista del equipo, las celdas se editan ahí mismo (si la sesión puede editar). */
  personas?: Persona[];
  /** Panel de Sede con la contraseña de la sede: cuenta como el responsable de cada tarea (ver yoPara). */
  comoResponsable?: boolean;
  onAbrir: (id: number) => void;
  onCambio: () => void;
}) {
  const [abierto, setAbierto] = useState(true);
  const { cambiar, ocupado } = useCambiarEstado(onCambio);
  const { showToast } = useToast();
  const [fechas, setFechas] = useState<{ a: Acuerdo; hasta: string; conDesde: boolean } | null>(null);
  const inicio = (a: Acuerdo) => a.fechaInicio ?? a.creadoDia;

  async function editar(a: Acuerdo, cambio: Partial<{ responsable: string; fechaLimite: string; motivoFecha: string; prioridad: string; area: string; fechaInicio: string }>) {
    const r = await editarAcuerdo(a.id, { que: a.que, detalle: a.detalle ?? "", area: a.area, responsable: a.responsableClave, fechaLimite: a.fechaLimite, prioridad: a.prioridad, ...cambio });
    if (!r.ok) { showToast(r.error, "error"); return false; }
    showToast("Guardado", "success");
    onCambio();
    return true;
  }
  /** El calendario de la fecha límite: se abre al tocar. */
  const calendario = (a: Acuerdo) => (
    <input type="date" aria-label="Cambiar fecha límite" value={a.fechaLimite} min={hoy} className={ENCIMA}
      onClick={(e) => { e.stopPropagation(); try { e.currentTarget.showPicker(); } catch { /* el navegador lo abre solo */ } }}
      onKeyDown={sinAbrir.onKeyDown}
      onChange={(e) => { if (e.target.value && e.target.value !== a.fechaLimite) setFechas({ a, hasta: e.target.value, conDesde: false }); }} />
  );
  const vencidos = items.filter((a) => estadoVisible(a, hoy) === "vencido").length;
  const desde = items.reduce((m, a) => (inicio(a) < m ? inicio(a) : m), inicio(items[0]));
  const hasta = items.reduce((m, a) => (a.fechaLimite > m ? a.fechaLimite : m), items[0].fechaLimite);
  const porEstado = (["cumplido", "en_proceso", "pendiente", "anulado"] as const).map((e) => ({ e, n: items.filter((a) => a.estado === e).length })).filter((x) => x.n);

  return (
    <div>
      <button type="button" onClick={() => setAbierto(!abierto)} className="flex items-center gap-2 py-1.5 text-[15px] font-semibold" style={{ color }}>
        <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? "" : "-rotate-90"}`} />
        {avatar && <Avatar nombre={avatar.nombre} clave={avatar.clave} />}
        {titulo}
        <span className="text-xs font-normal text-gray-400">{items.length} {items.length === 1 ? "tarea" : "tareas"}</span>
        {vencidos > 0 && <span className="text-xs font-medium text-red-700">· {vencidos} {vencidos === 1 ? "vencida" : "vencidas"}</span>}
      </button>

      {abierto && (
        <div className="overflow-x-auto">
          <div className="min-w-[909px] sm:min-w-[989px] border-l-[5px] rounded-l-md" style={{ borderColor: color }}>
            <div className={`${COLS} border-y border-gray-200 bg-white text-xs text-gray-500`}>
              <span className={CELDA}>Tarea</span>
              <span className={`${CELDA} justify-center`}>Estado</span>
              <span className={`${CELDA} justify-center`}>Responsable</span>
              <span className={`${CELDA} justify-center`}>Fecha límite</span>
              <span className={`${CELDA} justify-center`}>Plazo</span>
              <span className={`${CELDA} justify-center`}>Prioridad</span>
              <span className={`${CELDA} justify-center`}>Área</span>
            </div>
            <ul>
              {items.map((a) => {
                const v = estadoVisible(a, hoy);
                const cerrado = a.estado === "cumplido" || a.estado === "anulado";
                const ed = !!personas && puede(yoPara(yo, a, comoResponsable), a, "editar");
                return (
                  <li key={a.id} role="button" tabIndex={0} onClick={() => onAbrir(a.id)} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(a.id); }}
                    className={`${COLS} border-b border-gray-200 bg-white cursor-pointer hover:bg-gray-50 ${a.estado === "anulado" ? "opacity-50" : ""}`}>
                    <span className={CELDA}>
                      <span className="min-w-0 flex-1 flex flex-col leading-tight">
                        <span className={`text-sm truncate ${cerrado ? "text-gray-400 line-through" : "text-gray-900"}`} title={a.que}>{a.que}</span>
                        <ParteDe a={a} />
                      </span>
                      <AvanceSubtareas a={a} />
                    </span>
                    <span className="h-10 border-r border-white">
                      <EstadoCelda estado={a.estado} puede={puede(yoPara(yo, a, comoResponsable), a, "avanzar")} ocupado={ocupado === a.id} onCambiar={(n) => void cambiar(a, n)} />
                    </span>
                    <span className={`${CELDA} gap-2 ${ed ? EDITABLE : ""}`}>
                      <Responsables a={a} />
                      <span className="text-xs text-gray-700 truncate">{nombreConApoyos(a)}</span>
                      {ed && <span {...sinAbrir}><SelectorPersona personas={personas!} valor={a.responsableClave} className={ENCIMA}
                        onChange={(c) => { if (c && c !== a.responsableClave) void editar(a, { responsable: c }); }} /></span>}
                    </span>
                    <span className={`${CELDA} justify-center text-xs ${ed ? EDITABLE : ""} ${v === "vencido" ? "font-semibold text-red-700" : "text-gray-700"}`}>
                      {diaCorto(a.fechaLimite)}
                      {ed && calendario(a)}
                    </span>
                    <span className={`${CELDA} ${ed ? EDITABLE : ""}`}>
                      <Plazo desde={inicio(a)} hasta={a.fechaLimite} hoy={hoy} lleno={cerrado}
                        color={v === "vencido" ? ROJO : a.estado === "cumplido" ? COLOR_ESTADO.cumplido : color} />
                      {ed && <button type="button" aria-label="Cambiar plazo" className={ENCIMA}
                        onClick={(e) => { e.stopPropagation(); setFechas({ a, hasta: a.fechaLimite, conDesde: true }); }} onKeyDown={sinAbrir.onKeyDown} />}
                    </span>
                    <span className={`${CELDA} justify-center ${ed ? EDITABLE : ""}`}>
                      <PrioridadIcono p={a.prioridad} conTexto />
                      {ed && (
                        <select aria-label="Prioridad" value={a.prioridad} className={ENCIMA} {...sinAbrir}
                          onChange={(e) => void editar(a, { prioridad: e.target.value })}>
                          {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDAD_LABEL[p]}</option>)}
                        </select>
                      )}
                    </span>
                    <span className={`${CELDA} justify-center ${ed ? EDITABLE : ""}`}>
                      <AreaTag area={a.area} />
                      {ed && (
                        <select aria-label="Área" value={a.area} className={ENCIMA} {...sinAbrir}
                          onChange={(e) => void editar(a, { area: e.target.value })}>
                          {AREAS.map((x) => <option key={x} value={x}>{AREA_LABEL[x]}</option>)}
                        </select>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {/* Pie del grupo: cuánto hay de cada estado y el plazo de todo el grupo */}
            <div className={`${COLS} text-xs`}>
              <span />
              <span className="flex items-center h-10 px-1.5" title={porEstado.map((x) => `${ESTADO_LABEL[x.e]}: ${x.n}`).join(" · ")}>
                <span className="flex h-6 w-full overflow-hidden rounded">
                  {porEstado.map((x) => <span key={x.e} style={{ width: `${(x.n / items.length) * 100}%`, backgroundColor: COLOR_ESTADO[x.e] }} />)}
                </span>
              </span>
              <span className="col-span-2" />
              <span className="flex items-center h-10 px-3"><Plazo desde={desde} hasta={hasta} hoy={hoy} color={color} /></span>
            </div>
          </div>
        </div>
      )}
      {fechas && <CambiarFechas a={fechas.a} hoy={hoy} desdeInicial={inicio(fechas.a)} hastaInicial={fechas.hasta} conDesde={fechas.conDesde}
        onCancelar={() => setFechas(null)} onGuardar={(c) => editar(fechas.a, c)} />}
    </div>
  );
}
