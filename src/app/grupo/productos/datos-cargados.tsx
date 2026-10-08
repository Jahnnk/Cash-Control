"use client";

/**
 * "¿Desde qué fecha hasta qué fecha tengo datos de productos?" (Grupo → Productos).
 * Pedido de Jahnn, 4-oct-2026: ver de un vistazo, por sede, qué cubren los reportes
 * de mayor y menor rotación de Byte que ya se subieron, y qué días faltan en el medio.
 * El cálculo: lib/productos/cobertura-datos.ts. El detalle por mes sigue en «Cargas de Byte».
 * UX (8-oct-2026): una sola línea («hasta qué día hay datos» por sede); si falta algo, lo dice
 * en ámbar; las fechas completas de mayor y menor rotación quedan a un toque.
 */

import { useEffect, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { getDatosCargadosProductos, type DatosCargadosSede } from "@/app/actions/productos-panorama";
import { diasHasta, fechaCorta, textoHueco, type Cobertura } from "@/lib/productos/cobertura-datos";

const ORDEN = [2, 3, 1];
/** Días sin dato nuevo desde los que se avisa. */
const DIAS_ATRASO = 7;

function Rango({ c, hoy, avisarAtraso }: { c: Cobertura; hoy: string; avisarAtraso: boolean }) {
  if (!c.desde || !c.hasta) return <span className="text-amber-700">sin cargar</span>;
  const atraso = diasHasta(c.hasta, hoy);
  return (
    <span>
      <strong className="font-semibold text-gray-900 tabular-nums">{fechaCorta(c.desde)} → {fechaCorta(c.hasta)}</strong>
      {c.huecos.length > 0 && <span className="text-amber-700"> · faltan: {c.huecos.map(textoHueco).join(", ")}</span>}
      {avisarAtraso && atraso > DIAS_ATRASO && <span className="text-amber-700"> · último dato hace {atraso} días</span>}
    </span>
  );
}

/** Cuántas cosas hay que mirar en una sede: huecos en cualquiera de los dos reportes o un dato viejo. */
function avisosDe(s: DatosCargadosSede, hoy: string): number {
  const viejo = s.mayor.hasta && diasHasta(s.mayor.hasta, hoy) > DIAS_ATRASO ? 1 : 0;
  const sinCargar = (!s.mayor.hasta ? 1 : 0) + (!s.menor.hasta ? 1 : 0);
  return s.mayor.huecos.length + s.menor.huecos.length + viejo + sinCargar;
}

export function VistaDatosCargados({ datos, soloSede = null }: { datos: { hoy: string; sedes: DatosCargadosSede[] }; soloSede?: number | null }) {
  const filas = ORDEN.filter((id) => soloSede === null || id === soloSede)
    .map((id) => datos.sedes.find((s) => s.businessId === id)).filter((s): s is DatosCargadosSede => !!s);
  const avisos = filas.reduce((t, s) => t + avisosDe(s, datos.hoy), 0);
  return (
    <details className="group rounded-2xl border border-gray-200/80 bg-white px-4 py-2.5 sm:px-5" aria-label="Datos de productos cargados">
      <summary className="flex cursor-pointer list-none items-center gap-x-3 gap-y-1 flex-wrap text-xs text-gray-600">
        <CalendarRange className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-gray-500">Datos hasta</span>
        {filas.map((s) => (
          <span key={s.businessId} className="whitespace-nowrap">
            {filas.length > 1 && <span className="text-gray-500">{s.sede} </span>}
            <b className="font-semibold text-gray-900 tabular-nums">{s.mayor.hasta ? fechaCorta(s.mayor.hasta) : "—"}</b>
          </span>
        ))}
        {avisos > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">{avisos} {avisos === 1 ? "aviso" : "avisos"}</span>}
        <ChevronDown className="ml-auto w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <dl className="mt-2.5 mb-1 space-y-2 text-xs text-gray-600">
        {filas.map((s) => (
          <div key={s.businessId} className="grid grid-cols-1 sm:grid-cols-[5rem_1fr_1fr] gap-x-4 gap-y-0.5">
            <dt className="font-medium text-gray-900">{s.sede}</dt>
            <dd><span className="text-gray-500">Mayor rotación · </span><Rango c={s.mayor} hoy={datos.hoy} avisarAtraso /></dd>
            <dd><span className="text-gray-500">Menor rotación · </span><Rango c={s.menor} hoy={datos.hoy} avisarAtraso={false} /></dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function DatosCargados({ version, soloSede = null }: { version: number; soloSede?: number | null }) {
  const [datos, setDatos] = useState<{ hoy: string; sedes: DatosCargadosSede[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    getDatosCargadosProductos().then((r) => { if (vivo && r.ok) setDatos({ hoy: r.hoy, sedes: r.sedes }); });
    return () => { vivo = false; };
  }, [version]);

  return datos ? <VistaDatosCargados datos={datos} soloSede={soloSede} /> : null;
}
