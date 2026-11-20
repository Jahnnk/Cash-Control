"use client";

/**
 * Panel de Sede → «Mis acuerdos y tareas». Desde el 20-nov-2026 ocupa el lugar del Highlight (archivado: «ya son
 * 3 meses que nadie lo usa»): es lo PRIMERO que ve el administrador.
 *
 * Tres capas, de lo que se mira de un vistazo a lo que se trabaja:
 *   1. La cabecera: cuántas tareas tiene abiertas, el % hecho de los últimos 30 días y cuatro cifras
 *      (vencidas, hoy o mañana, esta semana, hechas).
 *   2. «Lo próximo»: las 3 más urgentes, siempre visibles, con su aviso (vencida, vence hoy, nueva) y el estado
 *      para cambiarlo de un toque. Reemplaza la franja de alertas de antes: un solo lugar para lo urgente.
 *   3. «Ver todas mis tareas»: plegado por defecto. Las mismas vistas que Grupo → Acuerdos y tareas (Mis tareas,
 *      Tablero, Cronograma y Lista).
 *
 * El administrador ve SOLO lo suyo y no crea tareas (la dirección asigna); cambia el estado, comenta y ve el
 * detalle. Con «Ver como administrador», la dirección ve las tareas del administrador de esta sede.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, ChevronDown, ListChecks, MessageSquare, PartyPopper } from "lucide-react";
import { getMisAcuerdos, type Acuerdo, type YoSesion } from "@/app/actions/acuerdos";
import { ALERTA_LABEL, alertaDe, avancePorEstado, diasRestantes, estaAbierto, ordenAcuerdos, puede, textoPlazo, type Alerta } from "@/lib/acuerdos";
import { DetalleAcuerdo } from "@/components/acuerdos/detalle-acuerdo";
import { useCambiarEstado, yoPara } from "@/components/acuerdos/fila-acuerdo";
import { MisTareasPorUrgencia } from "@/components/acuerdos/mis-tareas";
import { AreaTag, EstadoCelda, PrioridadIcono } from "@/components/acuerdos/ui";
import { Segmentado } from "@/components/productos/ui";
import { Kanban } from "@/app/grupo/acuerdos/kanban";
import { Cronograma } from "@/app/grupo/acuerdos/cronograma";
import { Agrupado } from "@/app/grupo/acuerdos/tablero";

type Vista = "mios" | "tablero" | "cronograma" | "lista";
export type Datos = { hoy: string; yo: YoSesion; acuerdos: Acuerdo[] };

/** Cuántas tareas se muestran siempre, sin abrir nada. */
const PROXIMAS = 3;

/** `comoAdmin`: «Ver como administrador» — la dirección ve las tareas del administrador de esta sede. */
export function MisAcuerdosCard({ comoAdmin = false }: { comoAdmin?: boolean }) {
  const { negocio } = useParams<{ negocio: string }>();
  const [d, setD] = useState<Datos | null>(null);
  const [cargado, setCargado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await getMisAcuerdos(comoAdmin ? negocio : undefined);
    setD(r.ok ? { hoy: r.hoy, yo: r.yo, acuerdos: r.acuerdos } : null);
    setCargado(true);
  }, [comoAdmin, negocio]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  // Mientras carga se reserva el alto: el resto del panel no salta cuando aparece la tarjeta.
  if (!cargado) return <div className="rounded-2xl border border-gray-200/80 bg-white h-56 animate-pulse" aria-hidden />;
  if (!d) return null;
  return <MisAcuerdosVista datos={d} onCambio={() => void cargar()} />;
}

/** La tarjeta ya con sus datos (separada de la carga para poder verla con datos de prueba). */
export function MisAcuerdosVista({ datos, onCambio }: { datos: Datos; onCambio: () => void }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [todas, setTodas] = useState(false);
  const [vista, setVista] = useState<Vista>("mios");
  const { hoy, yo, acuerdos } = datos;
  const abiertas = useMemo(() => ordenAcuerdos(acuerdos.filter((a) => estaAbierto(a.estado)), hoy), [acuerdos, hoy]);
  const recargar = onCambio;
  const dias = (a: Acuerdo) => diasRestantes(a.fechaLimite, hoy);
  const vencidas = abiertas.filter((a) => dias(a) < 0).length;
  const pronto = abiertas.filter((a) => dias(a) >= 0 && dias(a) <= 1).length;
  const semana = abiertas.filter((a) => dias(a) > 1 && dias(a) <= 7).length;
  const avance = avancePorEstado(acuerdos, hoy, 30);
  const enDetalle = abierto !== null ? acuerdos.find((a) => a.id === abierto) ?? null : null;

  const titular = abiertas.length === 0
    ? acuerdos.length === 0 ? "Sin tareas asignadas" : "Todo al día"
    : `${abiertas.length} ${abiertas.length === 1 ? "tarea abierta" : "tareas abiertas"}`;
  const bajada = abiertas.length === 0
    ? acuerdos.length === 0 ? "Cuando la dirección te asigne una tarea, aparecerá aquí." : "No tienes nada pendiente. Buen trabajo."
    : vencidas > 0 ? `${vencidas === 1 ? "Una ya venció" : `${vencidas} ya vencieron`}: empieza por ${vencidas === 1 ? "esa" : "esas"}.`
      : pronto > 0 ? `${pronto === 1 ? "Una vence" : `${pronto} vencen`} hoy o mañana.`
        : "Vas a tiempo con todas.";

  return (
    <>
      <section className="rounded-2xl border border-gray-200/80 bg-white overflow-hidden shadow-sm" aria-labelledby="mis-acuerdos-titulo">
        {/* 1 · Cabecera */}
        <div className="relative bg-primary text-white px-4 py-4 sm:px-6 sm:py-5">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
            style={{ background: "radial-gradient(120% 140% at 100% 0%, rgba(9,139,95,0.85) 0%, rgba(9,139,95,0) 60%)" }} />
          <div className="relative flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p id="mis-acuerdos-titulo" className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/75">
                <ListChecks className="w-3.5 h-3.5" aria-hidden />Mis acuerdos y tareas
              </p>
              <h2 className="mt-1.5 text-xl sm:text-2xl font-bold leading-tight">{titular}</h2>
              <p className="mt-1 text-sm text-white/80">{bajada}</p>
            </div>
            {avance.pctCumplido !== null && <Anillo pct={avance.pctCumplido} />}
          </div>

          {acuerdos.length > 0 && (
            <dl className="relative mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Cifra etiqueta="Vencidas" valor={vencidas} tono={vencidas > 0 ? "rojo" : "neutro"} />
              <Cifra etiqueta="Hoy o mañana" valor={pronto} tono={pronto > 0 ? "ambar" : "neutro"} />
              <Cifra etiqueta="Esta semana" valor={semana} tono="neutro" />
              <Cifra etiqueta="Hechas · 30 días" valor={avance.conteo.cumplido} tono="neutro" />
            </dl>
          )}
        </div>

        {/* 2 · Lo próximo */}
        {abiertas.length > 0 && (
          <div className="px-4 pt-4 sm:px-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lo próximo</h3>
            <ul className="mt-2 space-y-2">
              {abiertas.slice(0, PROXIMAS).map((a) => (
                <TareaProxima key={a.id} a={a} yo={yo} hoy={hoy} onAbrir={() => setAbierto(a.id)} onCambio={recargar} />
              ))}
            </ul>
          </div>
        )}
        {abiertas.length === 0 && acuerdos.length > 0 && (
          <div className="px-4 pt-4 sm:px-6 flex items-center gap-2 text-sm text-gray-600">
            <PartyPopper className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />
            Todas tus tareas están hechas. Las anteriores siguen en «Ver todas mis tareas».
          </div>
        )}

        {/* 3 · Todas las vistas (plegado) */}
        {acuerdos.length > 0 ? (
          <div className="px-4 py-4 sm:px-6">
            <button type="button" aria-expanded={todas} onClick={() => setTodas(!todas)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2.5 text-sm font-medium text-primary hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-primary">
              {todas ? "Ocultar" : `Ver todas mis tareas (${acuerdos.length})`}
              <ChevronDown className={`w-4 h-4 transition-transform ${todas ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {todas && (
              <div className="mt-4 space-y-3">
                <Segmentado valor={vista} onChange={setVista} tamano="sm" opciones={[
                  { valor: "mios", etiqueta: `Mis tareas${abiertas.length ? ` (${abiertas.length})` : ""}` },
                  { valor: "tablero", etiqueta: "Tablero" },
                  { valor: "cronograma", etiqueta: "Cronograma" },
                  { valor: "lista", etiqueta: "Lista" },
                ]} />
                <p className="text-xs text-gray-500">
                  {vista === "tablero" ? "Arrastra la tarjeta a otra columna para cambiar su estado. Toca la tarjeta para ver el detalle o comentar."
                    : vista === "cronograma" ? "Cada barra va desde el inicio del plazo hasta la fecha límite. La línea marca hoy."
                      : "Cambia el estado con el botón de color: No iniciado, En progreso o Hecho. Toca la tarea para ver el detalle o comentar."}
                </p>
                {vista === "mios" && <MisTareasPorUrgencia items={abiertas} yo={yo} hoy={hoy} comoResponsable onAbrir={setAbierto} onCambio={recargar} />}
                {vista === "tablero" && <Kanban acuerdos={acuerdos} yo={yo} hoy={hoy} comoResponsable onAbrir={setAbierto} onCambio={recargar} />}
                {vista === "cronograma" && <Cronograma acuerdos={acuerdos} hoy={hoy} onAbrir={setAbierto} />}
                {vista === "lista" && (
                  <Agrupado items={ordenAcuerdos(acuerdos, hoy)} por="estado" hoy={hoy} yo={yo} comoResponsable onAbrir={setAbierto} onCambio={recargar} />
                )}
              </div>
            )}
          </div>
        ) : <div className="h-1" />}
      </section>
      {enDetalle && <DetalleAcuerdo key={enDetalle.id} a={enDetalle} yo={yo} hoy={hoy} comoResponsable onCambio={recargar} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

/** El % hecho de los últimos 30 días, como anillo. */
function Anillo({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0 w-16 h-16 sm:w-[72px] sm:h-[72px]" title={`${pct}% de tus tareas de los últimos 30 días están hechas`}>
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="white" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`${pct >= 100 ? "text-sm sm:text-base" : "text-base sm:text-lg"} font-bold tabular-nums`}>{pct}%</span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wide text-white/70">hecho</span>
      </div>
    </div>
  );
}

const TONO_CIFRA = {
  rojo: "bg-red-500/90 text-white ring-red-300/40",
  ambar: "bg-amber-400 text-amber-950 ring-amber-200/40",
  neutro: "bg-white/10 text-white ring-white/15",
} as const;

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono: keyof typeof TONO_CIFRA }) {
  return (
    <div className={`rounded-xl px-3 py-2 ring-1 ring-inset ${TONO_CIFRA[tono]}`}>
      <dt className="text-[10px] font-medium uppercase tracking-wide opacity-80">{etiqueta}</dt>
      <dd className="text-lg font-bold tabular-nums leading-tight">{valor}</dd>
    </div>
  );
}

const BORDE_ALERTA: Record<Alerta | "normal", string> = {
  vencido: "border-l-red-500", hoy: "border-l-amber-400", manana: "border-l-amber-400", nuevo: "border-l-sky-500", normal: "border-l-primary-light",
};
const PASTILLA_ALERTA = { nuevo: "bg-sky-50 text-sky-700" } as const;

/** Una tarea de «Lo próximo»: grande, con su aviso, el plazo en palabras y el estado a un toque. */
function TareaProxima({ a, yo, hoy, onAbrir, onCambio }: { a: Acuerdo; yo: YoSesion; hoy: string; onAbrir: () => void; onCambio: () => void }) {
  const { cambiar, ocupado } = useCambiarEstado(onCambio);
  const alerta = alertaDe(a, hoy);
  const d = diasRestantes(a.fechaLimite, hoy);
  const plazo = textoPlazo(a.fechaLimite, hoy);
  const colorPlazo = d < 0 ? "text-red-700 font-semibold" : d <= 1 ? "text-amber-700 font-medium" : "text-gray-600";
  return (
    <li>
      <div role="button" tabIndex={0} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}
        className={`group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-xl border border-gray-200/80 border-l-4 ${BORDE_ALERTA[alerta ?? "normal"]} bg-white px-3 py-3 sm:px-4 cursor-pointer transition hover:shadow-md hover:border-gray-300 focus-visible:outline-2 focus-visible:outline-primary`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {a.prioridad === "alta" && <span className="mt-0.5"><PrioridadIcono p="alta" /></span>}
            <p className="text-[15px] font-medium text-gray-900 leading-snug line-clamp-2 break-words">{a.que}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {/* Vencida, hoy y mañana ya los dice el plazo en palabras; la pastilla solo marca lo nuevo. */}
            {alerta === "nuevo" && <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${PASTILLA_ALERTA.nuevo}`}>{ALERTA_LABEL.nuevo}</span>}
            <span className={`inline-flex items-center gap-1 ${colorPlazo}`}><CalendarClock className="w-3.5 h-3.5" aria-hidden />{plazo.replace(/^./, (c) => c.toUpperCase())}</span>
            <AreaTag area={a.area} />
            {a.comentarios > 0 && <span className="inline-flex items-center gap-0.5 text-gray-400"><MessageSquare className="w-3 h-3" aria-hidden />{a.comentarios}</span>}
            {a.reunionTitulo && <span className="text-gray-400 truncate max-w-[14rem]">· {a.reunionTitulo}</span>}
          </div>
        </div>
        <span className="block w-full sm:w-[120px] h-9 sm:shrink-0 rounded-lg overflow-hidden">
          <EstadoCelda estado={a.estado} puede={puede(yoPara(yo, a, true), a, "avanzar")} ocupado={ocupado === a.id} onCambiar={(n) => void cambiar(a, n)} />
        </span>
      </div>
    </li>
  );
}
