"use client";

/**
 * Rastreador de progreso estilo pedido de delivery (Rappi / PedidosYa):
 * una línea de tiempo con hitos, el paso actual latiendo, la barra que
 * avanza y una frase que dice qué pasa ahora y qué sigue. Es la regla
 * «visibilidad del estado del sistema» (Nielsen): el usuario nunca tiene que
 * adivinar en qué va. Mismo diseño que el seguimiento de listas y dinero de
 * Control de Caja. Las reglas viven en lib/seguimiento.ts.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle, CalendarCheck, CalendarClock, Check, CheckCircle2, ClipboardList, Inbox,
  PackageCheck, Sun, TrendingDown, Upload, Users, Wallet, ArrowRight,
} from "lucide-react";
import type { AccionPaso, Seguimiento } from "@/lib/seguimiento";

const ICONO: Record<string, typeof Check> = {
  highlight: Sun,
  registro: ClipboardList,
  reportes: Upload,
  cierre: PackageCheck,
  revision: CalendarCheck,
  bandeja: Inbox,
  equipo: Users,
  presupuesto: Wallet,
  menor: TrendingDown,
  siguiente: CalendarClock,
};

const TONO = {
  normal: { caja: "border-emerald-100 bg-emerald-50/30", texto: "text-gray-900", icono: null },
  alerta: { caja: "border-amber-200 bg-amber-50/50", texto: "text-amber-900", icono: AlertTriangle },
  listo: { caja: "border-emerald-200 bg-emerald-50/60", texto: "text-emerald-900", icono: CheckCircle2 },
} as const;

/** «hace un momento», «hace 3 min» — se refresca solo. */
function useHace(iso: string | null): string {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return "";
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60_000));
  return min < 1 ? "hace un momento" : `hace ${min} min`;
}

export function SeguimientoTracker({
  seguimiento: s,
  subtitulo,
  actualizado,
  onEvento,
  cargando = false,
}: {
  seguimiento: Seguimiento;
  subtitulo?: string;
  /** ISO de la última lectura: se muestra «actualizado hace X». */
  actualizado?: string | null;
  /** Para las acciones que se resuelven en la misma pantalla (registrar, subir, Highlight). */
  onEvento?: (accion: Extract<AccionPaso, { tipo: "evento" }>) => void;
  cargando?: boolean;
}) {
  const t = TONO[s.tono];
  const alerta = s.tono === "alerta";
  const n = s.pasos.length;
  const borde = `${50 / n}%`;
  const largo = 100 - 100 / n;
  const accion = s.pasos.find((p) => p.estado === "actual")?.accion ?? null;
  const hace = useHace(actualizado ?? null);

  return (
    <section className={`rounded-2xl border px-4 pb-4 pt-3 ${t.caja}`} aria-label={`${s.titulo}: ${s.mensaje}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">
          {s.titulo}
          {subtitulo && <span className="ml-1.5 font-normal text-gray-500">· {subtitulo}</span>}
        </h2>
        {hace && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-500 shrink-0" title="Se actualiza solo">
            <span className={`h-1.5 w-1.5 rounded-full ${cargando ? "bg-amber-400 motion-safe:animate-pulse" : "bg-emerald-500"}`} aria-hidden />
            {cargando ? "actualizando…" : hace}
          </span>
        )}
      </div>

      <p className={`mt-1.5 flex items-start gap-1.5 text-sm font-medium ${t.texto}`} aria-live="polite">
        {t.icono && <t.icono className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{s.mensaje}</span>
      </p>

      <div className="relative mt-4">
        {/* Riel y avance: del centro del primer punto al centro del último */}
        <div className="absolute top-4 h-1 -translate-y-1/2 rounded-full bg-gray-200" style={{ left: borde, right: borde }} aria-hidden />
        <div
          className="absolute top-4 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ left: borde, width: `${s.avance * largo}%` }}
          aria-hidden
        />
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {s.pasos.map((p) => {
            const Icono = p.estado === "hecho" ? Check : ICONO[p.clave] ?? Check;
            const actual = p.estado === "actual";
            const enAlerta = actual && p.alerta;
            const color = p.estado === "hecho"
              ? "bg-primary text-white"
              : actual
                ? (enAlerta ? "bg-white text-amber-600 ring-2 ring-amber-500" : "bg-white text-primary ring-2 ring-primary")
                : p.alerta ? "bg-white text-amber-500 ring-1 ring-amber-300" : "bg-white text-gray-300 ring-1 ring-gray-200";
            return (
              <li key={p.clave} className="flex min-w-0 flex-col items-center px-0.5 text-center" aria-current={actual ? "step" : undefined}>
                <span className="relative flex h-8 w-8 items-center justify-center">
                  {actual && <span className={`absolute inset-0 rounded-full motion-safe:animate-ping ${enAlerta ? "bg-amber-400/30" : "bg-primary/25"}`} aria-hidden />}
                  <span className={`relative flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-colors duration-500 ${color}`}>
                    <Icono className="h-[15px] w-[15px]" strokeWidth={2.4} />
                  </span>
                </span>
                <span className={`mt-1.5 text-[11px] font-semibold leading-tight sm:text-xs ${p.estado === "pendiente" ? "text-gray-400" : "text-gray-900"}`}>{p.titulo}</span>
                <span className="text-[10px] leading-tight text-gray-500 sm:text-[11px]">{p.cuando}</span>
                {p.detalle && (
                  <span className={`text-[10px] font-medium leading-tight sm:text-[11px] ${p.alerta ? "text-amber-700" : p.estado === "hecho" ? "text-emerald-700" : "text-gray-500"}`}>
                    {p.detalle}
                  </span>
                )}
                <span className="sr-only">
                  {p.estado === "hecho" ? "hecho" : actual ? "paso actual" : "pendiente"}{p.alerta ? ", atrasado" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {accion && (
        <div className="mt-3 flex justify-center">
          {accion.tipo === "ir" ? (
            <Link href={accion.href}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white ${alerta ? "bg-amber-600 hover:bg-amber-700" : "bg-primary hover:bg-primary-light"}`}>
              {accion.texto} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : onEvento ? (
            <button type="button" onClick={() => onEvento(accion)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white ${alerta ? "bg-amber-600 hover:bg-amber-700" : "bg-primary hover:bg-primary-light"}`}>
              {accion.texto} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Versión de una línea: los puntos y el paso actual (para la fila de cada sede). */
export function SeguimientoMini({ seguimiento: s }: { seguimiento: Seguimiento }) {
  const alerta = s.tono === "alerta";
  const actual = s.pasos[s.indiceActual] ?? null;
  const etiqueta = actual ? `${actual.titulo}${actual.detalle ? ` · ${actual.detalle}` : ""}` : "Semana entregada";
  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={s.mensaje} aria-label={`${etiqueta}. ${s.mensaje}`}>
      <span className="relative inline-flex h-2.5 w-16 shrink-0 items-center" aria-hidden>
        <span className="absolute inset-x-1 h-0.5 rounded-full bg-gray-200" />
        <span className="absolute left-1 h-0.5 rounded-full bg-primary transition-[width] duration-700" style={{ width: `calc((100% - 0.5rem) * ${s.avance})` }} />
        <span className="relative flex w-full justify-between">
          {s.pasos.map((p) => (
            <span key={p.clave}
              className={`h-2.5 w-2.5 rounded-full ${p.estado === "hecho" ? "bg-primary" : p.estado === "actual" ? `bg-white ring-2 ${alerta ? "ring-amber-500" : "ring-primary"}` : "bg-gray-200"}`} />
          ))}
        </span>
      </span>
      <span className={`truncate text-xs font-medium ${alerta ? "text-amber-700" : s.tono === "listo" ? "text-emerald-700" : "text-gray-800"}`}>{etiqueta}</span>
    </span>
  );
}

/** Aviso para que los rastreadores abiertos se actualicen al instante tras una acción (cerrar Highlight, subir, registrar). */
export const EVENTO_SEGUIMIENTO = "yayis:seguimiento";
export function avisarSeguimiento() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_SEGUIMIENTO));
}

/**
 * Trae el seguimiento y lo mantiene vivo: al abrir, al volver a la pestaña,
 * cada minuto mientras se ve, y al instante cuando otra parte de la pantalla
 * avisa un cambio (`avisarSeguimiento`).
 */
export function useSeguimientoVivo<T extends { ok: boolean }>(leer: () => Promise<T>, refrescar = 0) {
  const [data, setData] = useState<T | null>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      setCargando(true);
      try {
        const r = await leer();
        if (vivo) setData(r);
      } catch (e) {
        console.error("[useSeguimientoVivo]", e);
      } finally {
        if (vivo) setCargando(false);
      }
    };
    void cargar();
    const alVolver = () => { if (document.visibilityState === "visible") void cargar(); };
    const cada = setInterval(() => { if (document.visibilityState === "visible") void cargar(); }, 60_000);
    window.addEventListener(EVENTO_SEGUIMIENTO, cargar);
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearInterval(cada);
      window.removeEventListener(EVENTO_SEGUIMIENTO, cargar);
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [leer, refrescar]);
  return { data, cargando };
}
