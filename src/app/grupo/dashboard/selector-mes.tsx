"use client";

/**
 * Elegir el mes del dashboard de Grupo (pedido de Jahnn, 3-oct-2026: "ver
 * desde aquí los meses anteriores, cómo nos fue en septiembre, agosto…").
 * El mes viaja en la dirección (?mes=2026-09): se puede guardar o compartir
 * el enlace, y el botón "atrás" vuelve al mes anterior que se miraba.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** El primer mes con datos del sistema (marzo 2026). */
const PRIMER_MES = "2026-03";

const etiqueta = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function sumar(m: string, n: number): string {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function SelectorMes({ mes, mesActual }: { mes: string; mesActual: string }) {
  const router = useRouter();
  const [cargando, ir] = useTransition();

  const meses: string[] = [];
  for (let m = mesActual; m >= PRIMER_MES; m = sumar(m, -1)) meses.push(m);

  function cambiar(nuevo: string) {
    if (nuevo === mes) return;
    ir(() => router.push(nuevo === mesActual ? "/grupo/dashboard" : `/grupo/dashboard?mes=${nuevo}`));
  }

  const hayAnterior = mes > PRIMER_MES;
  const haySiguiente = mes < mesActual;
  const boton = "p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white";

  return (
    <div className="inline-flex items-center gap-1.5">
      <button type="button" className={boton} disabled={!hayAnterior || cargando} onClick={() => cambiar(sumar(mes, -1))} aria-label="Mes anterior">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <select
        value={mes}
        onChange={(e) => cambiar(e.target.value)}
        disabled={cargando}
        aria-label="Mes"
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 font-medium"
      >
        {meses.map((m) => (
          <option key={m} value={m}>{etiqueta(m)}{m === mesActual ? " · en curso" : ""}</option>
        ))}
      </select>
      <button type="button" className={boton} disabled={!haySiguiente || cargando} onClick={() => cambiar(sumar(mes, 1))} aria-label="Mes siguiente">
        <ChevronRight className="w-4 h-4" />
      </button>
      {cargando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  );
}
