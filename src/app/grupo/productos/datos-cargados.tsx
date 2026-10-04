"use client";

/**
 * "¿Desde qué fecha hasta qué fecha tengo datos de productos?" (Grupo → Productos).
 * Pedido de Jahnn, 4-oct-2026: ver de un vistazo, por sede, qué cubren los reportes
 * de mayor y menor rotación de Byte que ya se subieron, y qué días faltan en el medio.
 * El cálculo: lib/productos/cobertura-datos.ts. El detalle por mes sigue en «Cargas de Byte».
 */

import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
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

export function VistaDatosCargados({ datos }: { datos: { hoy: string; sedes: DatosCargadosSede[] } }) {
  const filas = ORDEN.map((id) => datos.sedes.find((s) => s.businessId === id)).filter((s): s is DatosCargadosSede => !!s);
  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3.5 sm:px-5" aria-label="Datos de productos cargados">
      <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-gray-500">
        <CalendarRange className="w-3.5 h-3.5" /> Datos de productos que tiene el sistema
      </h2>
      <dl className="mt-2.5 space-y-2 text-xs text-gray-600">
        {filas.map((s) => (
          <div key={s.businessId} className="grid grid-cols-1 sm:grid-cols-[5rem_1fr_1fr] gap-x-4 gap-y-0.5">
            <dt className="font-medium text-gray-900">{s.sede}</dt>
            <dd><span className="text-gray-500">Mayor rotación · </span><Rango c={s.mayor} hoy={datos.hoy} avisarAtraso /></dd>
            <dd><span className="text-gray-500">Menor rotación · </span><Rango c={s.menor} hoy={datos.hoy} avisarAtraso={false} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DatosCargados({ version }: { version: number }) {
  const [datos, setDatos] = useState<{ hoy: string; sedes: DatosCargadosSede[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    getDatosCargadosProductos().then((r) => { if (vivo && r.ok) setDatos({ hoy: r.hoy, sedes: r.sedes }); });
    return () => { vivo = false; };
  }, [version]);

  return datos ? <VistaDatosCargados datos={datos} /> : null;
}
