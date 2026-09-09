"use client";

import { CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import { fechaLarga } from "@/lib/frescura-datos";

/**
 * "¿Hasta cuándo tenemos datos?" — la banda que va ARRIBA DEL TODO.
 *
 * Pedido de Jahnn (9-sep-2026): "que sea lo primero que me jale la
 * vista". La misma información existía en dos tarjetas del dashboard,
 * pero las dos vivían plegadas detrás de "Ver detalle operativo" — o
 * sea, no se veían nunca.
 *
 * Por eso esta banda no es una tarjeta más: es una franja de ancho
 * completo, con color, antes de cualquier cifra. Cuando todo está al
 * día se pone discreta (verde, una línea); cuando falta algo, crece y
 * dice qué pedirle a Kelly y desde qué fecha.
 *
 * El componente es tonto: todo lo decide `resumirFrescura`.
 */

const ESTILO: Record<FrescuraGrupo["estado"], {
  caja: string; texto: string; icono: string; rotulo: string;
}> = {
  al_dia: {
    caja: "bg-emerald-50 border-emerald-200",
    texto: "text-emerald-900", icono: "text-emerald-600", rotulo: "Datos al día",
  },
  atrasado: {
    caja: "bg-amber-50 border-amber-300",
    texto: "text-amber-900", icono: "text-amber-600", rotulo: "Datos atrasados",
  },
  muy_atrasado: {
    caja: "bg-red-50 border-red-300",
    texto: "text-red-900", icono: "text-red-600", rotulo: "Faltan datos",
  },
  sin_datos: {
    caja: "bg-gray-50 border-gray-300",
    texto: "text-gray-800", icono: "text-gray-500", rotulo: "Sin datos",
  },
};

export function BandaFrescura({ frescura }: { frescura: FrescuraGrupo }) {
  const e = ESTILO[frescura.estado];
  const alDia = frescura.estado === "al_dia";
  const Icono = alDia ? CheckCircle2 : AlertTriangle;

  return (
    <section className={`rounded-xl border px-4 py-3 ${e.caja}`}>
      <div className="flex items-start gap-3">
        <Icono className={`w-5 h-5 shrink-0 mt-0.5 ${e.icono}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${e.icono}`}>
              {e.rotulo}
            </span>
            <span className="text-[10px] text-gray-400">
              acuerdo: Kelly entrega los viernes · próxima {fechaLarga(frescura.proximaEntrega)}
            </span>
          </div>
          <p className={`text-sm font-semibold mt-0.5 ${e.texto}`}>{frescura.titular}</p>

          {/* Qué pedir. Solo cuando hay algo que pedir: un aviso que
              aparece siempre deja de leerse. */}
          {frescura.accion && (
            <p className={`text-xs mt-1 ${e.texto} opacity-90`}>{frescura.accion}</p>
          )}

          {/* El detalle por sede, en una línea. Ordenado de la más
              atrasada a la más al día, que es el orden en que hay que
              actuar. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {frescura.sedes.map((s) => (
              <span key={s.businessId} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                <CalendarClock className="w-3 h-3 text-gray-400" />
                <span className="font-medium text-gray-700">{s.name.replace("Yayi's ", "")}</span>
                <span>
                  {s.lastDate
                    ? `${fechaLarga(s.lastDate)}${s.diasAtraso === 0 ? "" : ` · hace ${s.diasAtraso}d`}`
                    : "sin datos"}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
