"use client";

/**
 * "Tu bono de este mes" — los 3 activadores lado a lado (pedido de Jahnn,
 * 16-sep-2026). Va debajo del Highlight: después de lo más importante del
 * día, lo primero que el administrador tiene que saber es si el equipo va
 * a cobrar y qué falta. La lógica (semáforos y textos) vive en
 * lib/incentives/bono-del-mes.ts; acá solo se dibuja.
 */

import { Trophy } from "lucide-react";
import { armarBonoDelMes, type Semaforo } from "@/lib/incentives/bono-del-mes";
import type { IncentiveDashboard } from "@/app/actions/incentives";

const COLOR: Record<Semaforo, { borde: string; punto: string; barra: string; texto: string }> = {
  verde: { borde: "border-emerald-200", punto: "bg-emerald-500", barra: "bg-emerald-500", texto: "text-emerald-800" },
  ambar: { borde: "border-amber-200", punto: "bg-amber-400", barra: "bg-amber-400", texto: "text-amber-800" },
  rojo: { borde: "border-red-200", punto: "bg-red-500", barra: "bg-red-500", texto: "text-red-800" },
  gris: { borde: "border-gray-200", punto: "bg-gray-300", barra: "bg-gray-300", texto: "text-gray-600" },
};
const FONDO_TITULAR: Record<Semaforo, string> = {
  verde: "bg-emerald-50 text-emerald-900 border-emerald-200",
  ambar: "bg-amber-50 text-amber-900 border-amber-200",
  rojo: "bg-red-50 text-red-900 border-red-200",
  gris: "bg-gray-50 text-gray-700 border-gray-200",
};

function hoyLima() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

export function BonoDelMesCard({ data, month }: { data: IncentiveDashboard; month: string }) {
  const p = data.progress;
  const hoy = hoyLima();
  const [y, m] = month.split("-").map(Number);
  const diasDelMes = new Date(y, m, 0).getDate();
  const esMesActual = hoy.slice(0, 7) === month;
  const nivel = p.nivelAlcanzado;
  const primero = [...data.config.levels].sort((a, b) => a.delta - b.delta)[0];

  const bono = armarBonoDelMes({
    mesCerrado: month < hoy.slice(0, 7),
    diasQueQuedan: esMesActual ? diasDelMes - Number(hoy.slice(8, 10)) + 1 : null,
    practica: !data.tresActivadores,
    ahoraISO: new Date().toISOString(),
    ticket: {
      diasRegistrados: p.daysLoaded,
      actual: p.ticketActual,
      primerNivel: primero ? { nombre: primero.nombre, metaTicket: data.config.ticketBase + primero.delta } : null,
      nivelAlcanzado: nivel
        ? { nombre: nivel.nombre, bonoEquipo: p.porNivel.find((n) => n.level.nombre === nivel.nombre)?.sumaBonos ?? 0 }
        : null,
      proximo: p.proximoNivel
        ? { nombre: p.proximoNivel.level.nombre, metaTicket: data.config.ticketBase + p.proximoNivel.level.delta, faltaSoles: p.proximoNivel.faltaSoles }
        : null,
    },
    ventas: data.equilibrio,
    supervision: data.supervisionMes,
    proximoVencimientoCritica: data.proximoVencimientoCritica,
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Tu bono de este mes
          </div>
          <div className="text-[11px] text-gray-500">
            Para cobrar se cumplen los 3. El nivel de ticket define cuánto se cobra.
          </div>
        </div>
        {bono.practica && (
          <span className="text-[11px] rounded-full px-2.5 py-1 border bg-sky-50 border-sky-200 text-sky-800">
            Práctica · desde octubre cuenta
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {bono.activadores.map((a, i) => {
          const c = COLOR[a.semaforo];
          return (
            <div key={a.clave} className={`rounded-xl border-2 ${c.borde} p-3 space-y-1.5`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${c.punto}`} />
                <span className="text-[11px] uppercase tracking-wide text-gray-500">{i + 1} · {a.titulo}</span>
              </div>
              <div className="text-xs text-gray-600">Meta: <strong className="text-gray-900">{a.meta}</strong></div>
              <div className="text-sm font-semibold text-gray-900">{a.avance}</div>
              {a.porcentaje !== null && (
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${c.barra}`} style={{ width: `${a.porcentaje}%` }} />
                </div>
              )}
              {a.falta && <div className={`text-xs ${c.texto}`}>{a.falta}</div>}
            </div>
          );
        })}
      </div>

      <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${FONDO_TITULAR[bono.semaforoGeneral]}`}>
        {bono.titular}
      </div>
      {bono.practica && (
        <div className="text-[11px] text-gray-500">
          Este mes el bono se paga como siempre: nivel de ticket y piso de tráfico. Los 3 activadores se muestran para que el equipo
          se familiarice; desde el 1 de octubre, sin la meta de ventas o con una crítica corregida tarde, no hay bono.
        </div>
      )}
    </div>
  );
}
