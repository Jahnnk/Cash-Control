"use client";

/**
 * Inicio del Panel de Sede (20-nov-2026): «Mis acuerdos y tareas» partido en dos tarjetas, como en el diseño que
 * pidió Jahnn — «Cumplimiento de acuerdos» (anillo + conteos) y «Tareas del día» (las más urgentes, con el estado a
 * un toque). «Ver todas» abre debajo, a todo el ancho, las mismas 4 vistas de antes (Mis tareas, Tablero,
 * Cronograma y Lista). No se pierde ningún dato de la tarjeta anterior: vencidas, hoy o mañana, esta semana y
 * hechas en 30 días siguen a la vista.
 *
 * Devuelve un fragmento: sus tarjetas se acomodan en la grilla del inicio, al lado de «Evolución de ventas».
 */

import { useMemo, useState } from "react";
import { CalendarCheck, ChevronDown, ClipboardCheck, Inbox, PartyPopper } from "lucide-react";
import type { Acuerdo } from "@/app/actions/acuerdos";
import { avancePorEstado, diasRestantes, estaAbierto, ordenAcuerdos } from "@/lib/acuerdos";
import { DetalleAcuerdo } from "@/components/acuerdos/detalle-acuerdo";
import { MisTareasPorUrgencia } from "@/components/acuerdos/mis-tareas";
import { Segmentado } from "@/components/productos/ui";
import { Kanban } from "@/app/grupo/acuerdos/kanban";
import { Cronograma } from "@/app/grupo/acuerdos/cronograma";
import { Agrupado } from "@/app/grupo/acuerdos/tablero";
import { TareaProxima, useMisAcuerdos, type Datos } from "./mis-acuerdos-card";
import { AvisoMenciones } from "@/components/acuerdos/aviso-menciones";
import { TarjetaInicio } from "./inicio-ui";

type Vista = "mios" | "tablero" | "cronograma" | "lista";
const PROXIMAS = 4;

/** Con su propia carga. Úsalo con `key` según «Ver como administrador» para que al cambiar muestre «cargando». */
export function AcuerdosEnInicio({ comoAdmin }: { comoAdmin: boolean }) {
  const { datos, cargado, recargar } = useMisAcuerdos(comoAdmin);
  return (
    <>
      {/* Las menciones son de quien entra: con «Ver como administrador» no se muestran las de la dirección. */}
      {!comoAdmin && <AvisoMenciones className="col-span-full order-first" onCambio={() => void recargar()} />}
      <AcuerdosTablero datos={datos} cargado={cargado} onCambio={() => void recargar()} />
    </>
  );
}

export function AcuerdosTablero({ datos, cargado, onCambio }: { datos: Datos | null; cargado: boolean; onCambio: () => void }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [todas, setTodas] = useState(false);
  const [vista, setVista] = useState<Vista>("mios");
  const hoy = datos?.hoy ?? "";
  const acuerdos = useMemo(() => datos?.acuerdos ?? [], [datos]);
  const abiertas = useMemo(() => ordenAcuerdos(acuerdos.filter((a) => estaAbierto(a.estado)), hoy), [acuerdos, hoy]);

  if (!cargado) {
    return (
      <>
        <div className="rounded-2xl border border-gray-200/80 bg-white h-72 animate-pulse xl:col-span-3" aria-hidden />
        <div className="rounded-2xl border border-gray-200/80 bg-white h-72 animate-pulse xl:col-span-4" aria-hidden />
      </>
    );
  }
  if (!datos) return null;
  const { yo } = datos;
  const enDetalle = abierto !== null ? acuerdos.find((a) => a.id === abierto) ?? null : null;

  return (
    <>
      <Cumplimiento acuerdos={acuerdos} abiertas={abiertas} hoy={hoy} />

      <TarjetaInicio
        className="xl:col-span-4"
        icono={CalendarCheck}
        titulo="Tareas del día"
        accion={acuerdos.length > 0 ? (
          <button type="button" aria-expanded={todas} onClick={() => setTodas(!todas)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-light hover:text-primary">
            {todas ? "Ocultar" : `Ver todas (${acuerdos.length})`}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${todas ? "rotate-180" : "-rotate-90"}`} aria-hidden />
          </button>
        ) : undefined}
      >
        {abiertas.length > 0 ? (
          <>
            <ul className="space-y-2">
              {abiertas.slice(0, PROXIMAS).map((a) => (
                <TareaProxima key={a.id} a={a} yo={yo} hoy={hoy} compacta onAbrir={() => setAbierto(a.id)} onCambio={onCambio} />
              ))}
            </ul>
            {abiertas.length > PROXIMAS && (
              <p className="mt-2 text-xs text-gray-500">
                Y {abiertas.length - PROXIMAS} más en «Ver todas».
              </p>
            )}
          </>
        ) : (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-primary-light">
              {acuerdos.length === 0 ? <Inbox className="h-5 w-5" aria-hidden /> : <PartyPopper className="h-5 w-5" aria-hidden />}
            </span>
            <p className="text-sm font-semibold text-gray-900">{acuerdos.length === 0 ? "Sin tareas asignadas" : "Todo al día"}</p>
            <p className="max-w-[16rem] text-xs text-gray-500">
              {acuerdos.length === 0 ? "Cuando la dirección te asigne una tarea, aparecerá aquí." : "No tienes nada pendiente. Buen trabajo."}
            </p>
          </div>
        )}
      </TarjetaInicio>

      {todas && acuerdos.length > 0 && (
        <section className="md:col-span-2 xl:col-span-12 rounded-2xl border border-gray-200/80 bg-white p-4 sm:p-5 shadow-sm space-y-3" aria-label="Todas mis tareas">
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
          {vista === "mios" && <MisTareasPorUrgencia items={abiertas} yo={yo} hoy={hoy} comoResponsable onAbrir={setAbierto} onCambio={onCambio} />}
          {vista === "tablero" && <Kanban acuerdos={acuerdos} yo={yo} hoy={hoy} comoResponsable onAbrir={setAbierto} onCambio={onCambio} />}
          {vista === "cronograma" && <Cronograma acuerdos={acuerdos} hoy={hoy} onAbrir={setAbierto} />}
          {vista === "lista" && <Agrupado items={ordenAcuerdos(acuerdos, hoy)} por="estado" hoy={hoy} yo={yo} comoResponsable onAbrir={setAbierto} onCambio={onCambio} />}
        </section>
      )}

      {enDetalle && <DetalleAcuerdo key={enDetalle.id} a={enDetalle} yo={yo} hoy={hoy} comoResponsable onCambio={onCambio} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

const TRAMOS = [
  { k: "cumplido", label: "Hechas", color: "#098B5F" },
  { k: "en_proceso", label: "En progreso", color: "#F5B638" },
  { k: "pendiente", label: "Sin iniciar", color: "#CBD5E1" },
  { k: "vencido", label: "Vencidas", color: "#E5484D" },
] as const;

/** Anillo de cumplimiento (últimos 30 días) con su leyenda y los plazos cercanos. */
function Cumplimiento({ acuerdos, abiertas, hoy }: { acuerdos: Acuerdo[]; abiertas: Acuerdo[]; hoy: string }) {
  const avance = avancePorEstado(acuerdos, hoy, 30);
  const dias = (a: Acuerdo) => diasRestantes(a.fechaLimite, hoy);
  const pronto = abiertas.filter((a) => dias(a) >= 0 && dias(a) <= 1).length;
  const semana = abiertas.filter((a) => dias(a) > 1 && dias(a) <= 7).length;

  const r = 42;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <TarjetaInicio className="xl:col-span-3" icono={ClipboardCheck} titulo="Cumplimiento de acuerdos" nota="Últimos 30 días">
      <div className="flex items-center gap-4 sm:gap-5 xl:flex-col 2xl:flex-row">
        <div className="relative h-32 w-32 shrink-0" role="img"
          aria-label={avance.pctCumplido === null ? "Sin tareas en los últimos 30 días" : `${avance.pctCumplido}% de cumplimiento`}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={r} fill="none" stroke="#EEF2F0" strokeWidth="11" />
            {avance.total > 0 && TRAMOS.map((t) => {
              const n = avance.conteo[t.k];
              if (!n) return null;
              const largo = (n / avance.total) * c;
              const el = (
                <circle key={t.k} cx="50" cy="50" r={r} fill="none" stroke={t.color} strokeWidth="11"
                  strokeDasharray={`${largo} ${c - largo}`} strokeDashoffset={-acumulado} />
              );
              acumulado += largo;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-2xl font-extrabold tabular-nums text-gray-900">{avance.pctCumplido === null ? "—" : `${avance.pctCumplido}%`}</span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">Cumplimiento</span>
          </div>
        </div>
        <dl className="min-w-0 flex-1 w-full space-y-1.5">
          {TRAMOS.map((t) => (
            <div key={t.k} className="flex items-center justify-between gap-2 text-sm">
              <dt className="flex items-center gap-2 text-gray-600">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} aria-hidden />{t.label}
              </dt>
              <dd className={`font-semibold tabular-nums ${t.k === "vencido" && avance.conteo.vencido > 0 ? "text-red-600" : "text-gray-900"}`}>{avance.conteo[t.k]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={`rounded-xl px-3 py-2 ${pronto > 0 ? "bg-amber-50 text-amber-900" : "bg-gray-50 text-gray-700"}`}>
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-75">Vencen hoy o mañana</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{pronto}</p>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2 text-gray-700">
          <p className="text-[10px] font-medium uppercase tracking-wide opacity-75">Esta semana</p>
          <p className="text-lg font-bold tabular-nums leading-tight">{semana}</p>
        </div>
      </div>
    </TarjetaInicio>
  );
}
