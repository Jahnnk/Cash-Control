"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info } from "lucide-react";
import { getListoParaReunion } from "@/app/actions/listo-reunion";
import type { ListoReunion, SedeListo, Hallazgo } from "@/lib/kpis/listo-reunion";

/**
 * «¿Llego a la reunión con los datos completos?» — la hermana de la banda de «Datos al día» (que habla del
 * Excel de Kelly): esta habla de lo que suben los administradores (KPIs diarios y archivos del sábado) para el
 * rango del reporte. Pedido de Jahnn, 19-oct-2026. El componente es tonto: todo lo decide
 * lib/kpis/listo-reunion.ts. Sin sesión de dirección no se pinta nada.
 */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const rangoTexto = (a: string, b: string) => (a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))}–${corto(b)}` : `${corto(a)} – ${corto(b)}`);

const ICONO: Record<Hallazgo["nivel"], { Icono: typeof Info; cls: string }> = {
  falta: { Icono: AlertTriangle, cls: "text-red-600" },
  aviso: { Icono: AlertTriangle, cls: "text-amber-600" },
  info: { Icono: Info, cls: "text-gray-400" },
};

function Sede({ s, abiertaAlInicio }: { s: SedeListo; abiertaAlInicio: boolean }) {
  const sinPendientes = s.estado === "listo";
  const chip = s.estado === "listo" ? "bg-emerald-100 text-emerald-800" : s.estado === "aviso" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  const texto = s.estado === "listo" ? "Completa" : s.estado === "aviso" ? "Para revisar" : "Faltan datos";
  const pendientes = s.hallazgos.filter((h) => h.nivel !== "info");
  return (
    <details className="group rounded-lg bg-white/70 border border-black/5" open={abiertaAlInicio && !sinPendientes}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-gray-900">{s.sede}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip}`}>{texto}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">
          {pendientes.length === 0 ? "KPIs diarios, Byte y archivos del sábado al día" : pendientes.map((h) => h.titulo.split(":")[0]).join(" · ")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="space-y-1.5 border-t border-black/5 px-3 py-2">
        {s.hallazgos.length === 0 && <li className="text-xs text-gray-500">Todo lo que sube esta sede para el rango está completo.</li>}
        {s.hallazgos.map((h, i) => {
          const { Icono, cls } = ICONO[h.nivel];
          return (
            <li key={i} className="flex gap-2 text-xs">
              <Icono className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cls}`} aria-hidden />
              <span className="min-w-0"><b className="font-semibold text-gray-800">{h.titulo}.</b> <span className="text-gray-600">{h.detalle}</span></span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function EstadoDatosReunion({ start, end, compacto = false }: { start: string; end: string; compacto?: boolean }) {
  // El resultado se guarda con el rango que se pidió: si las fechas cambian, el viejo deja de valer sin tener
  // que «limpiar» nada dentro del efecto.
  const [res, setRes] = useState<{ clave: string; datos: ListoReunion | null } | null>(null);
  const clave = `${start}|${end}`;
  const rangoValido = !!start && !!end && end >= start;

  useEffect(() => {
    if (!rangoValido) return;
    let vivo = true;
    getListoParaReunion(start, end)
      .then((r) => { if (vivo) setRes({ clave, datos: r.ok ? r.data : null }); })
      .catch(() => { if (vivo) setRes({ clave, datos: null }); });
    return () => { vivo = false; };
  }, [start, end, clave, rangoValido]);

  if (!rangoValido) return null;
  if (res?.clave !== clave) return <p className="text-xs text-gray-400">Revisando que los datos de {rangoTexto(start, end)} estén completos…</p>;
  if (!res.datos) return null; // sin sesión de dirección o sin conexión: no se pinta nada
  return <VistaDatosReunion datos={res.datos} start={start} end={end} compacto={compacto} />;
}

/** Solo dibuja: recibe el resultado ya calculado (así se puede probar y ver sin base de datos). */
export function VistaDatosReunion({ datos, start, end, compacto = false }: { datos: ListoReunion; start: string; end: string; compacto?: boolean }) {
  const ok = datos.listo;
  const caja = ok ? "bg-emerald-50 border-emerald-200" : datos.faltas > 0 ? "bg-red-50/60 border-red-200" : "bg-amber-50 border-amber-300";
  const Icono = ok ? CheckCircle2 : AlertTriangle;
  const icono = ok ? "text-emerald-600" : datos.faltas > 0 ? "text-red-600" : "text-amber-600";
  return (
    <section className={`rounded-xl border ${compacto ? "px-3 py-2.5" : "px-4 py-3"} ${caja}`} aria-label="Datos de los administradores para la reunión">
      <div className="flex items-start gap-3">
        <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${icono}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${icono}`}>Datos de los administradores · {rangoTexto(start, end)}</span>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">{datos.resumen}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">KPIs diarios (venta, NPS, mermas, tiempos), reporte de Byte y archivos del sábado.</p>
          <div className="mt-2 space-y-1.5">
            {datos.sedes.map((s) => <Sede key={s.businessId} s={s} abiertaAlInicio={!compacto} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
