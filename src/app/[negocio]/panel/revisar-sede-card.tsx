"use client";

/**
 * "Productos a revisar en tu sede" (panel del administrador de Fonavi/Centro).
 *
 * Pedido de Jahnn (24-sep-2026): los productos que andan flojos en ESTA sede
 * y bien en la otra — la misma carta vende distinto, así que el problema es
 * de la sede (precio, vitrina, cómo se ofrece). Se ve lo que vende la otra
 * sede como referencia y el plan de acción que decidió dirección con su
 * resultado. El administrador solo lee; los planes se deciden en Grupo.
 * Plegada por defecto (regla de orden visual de Jahnn).
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getRevisarEnMiSede, type RevisarEnMiSede } from "@/app/actions/productos-panorama";
import { PuntoFamilia, SeccionDesplegable } from "@/components/productos/ui";
import { EstadoPlan } from "@/components/productos/plan-sede";
import type { ProductoEnSede } from "@/lib/productos/candidatos";
import type { Familia } from "@/lib/productos/panorama";

const soles = (n: number) => `S/${n.toFixed(2)}`;

export function RevisarSedeCard({ month }: { month: string }) {
  const [data, setData] = useState<RevisarEnMiSede | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await getRevisarEnMiSede(month);
    if (r.ok) setData(r.data); else setError(r.error);
  }, [month]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  if (data === null) return null; // Atelier u otra sede sin cafetería
  const n = data?.productos.length ?? 0;
  const conPlan = data?.productos.filter((p) => p.plan).length ?? 0;

  return (
    <SeccionDesplegable
      titulo="Productos a revisar en tu sede"
      subtitulo="Productos de la carta que en tu sede se venden mucho menos que en la otra: el problema suele ser cómo se ofrecen, la vitrina o el precio."
      resumen={data && (
        <span className="text-xs text-gray-700">
          {n === 0 ? "Ninguno por ahora." : <><b>{n}</b> {n === 1 ? "producto" : "productos"}{conPlan > 0 && <> · <b>{conPlan}</b> con plan de acción</>}</>}
        </span>
      )}
    >
      {error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : !data ? (
        <div className="flex justify-center py-6 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : n === 0 && data.planesSinLista.length === 0 ? (
        <p className="text-sm text-gray-500">Ningún producto anda flojo solo en {data.sede}. Bien.</p>
      ) : (
        <div className="space-y-3">
          {data.productos.map((p) => (
            <article key={p.nombre} className="rounded-xl border border-gray-200 p-3 space-y-2.5">
              <h4 className="text-sm font-semibold text-gray-900 flex items-start gap-2">
                <span className="mt-1.5"><PuntoFamilia familia={p.familia as Familia} /></span>
                <span className="break-words">{p.nombre}</span>
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <Lado titulo={`En ${data.sede}`} s={p.mia} destacar />
                {p.otra && <Lado titulo={`En ${p.otra.sede}`} s={p.otra} />}
              </div>
              {p.conclusion && <p className="text-xs text-gray-700">{p.conclusion}</p>}
              {p.plan
                ? <EstadoPlan p={p.plan} />
                : <p className="text-[11px] text-gray-500">Dirección todavía no definió un plan para este producto.</p>}
            </article>
          ))}
          {data.planesSinLista.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700">Planes en curso que ya salieron de la lista</div>
              {data.planesSinLista.map((p) => (
                <div key={p.id} className="space-y-1">
                  <div className="text-xs text-gray-800">{p.nombre}</div>
                  <EstadoPlan p={p} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SeccionDesplegable>
  );
}

function Lado({ titulo, s, destacar = false }: { titulo: string; s: ProductoEnSede; destacar?: boolean }) {
  return (
    <div className={`rounded-lg px-2.5 py-2 text-[11px] ${destacar ? "bg-red-50/60 border border-red-100" : "bg-gray-50 border border-gray-100"}`}>
      <div className="font-semibold text-gray-800 mb-1">{titulo}</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
        <span className="text-gray-500">Vende al día</span><span className="text-right text-gray-900">{soles(s.ventaDia)}</span>
        <span className="text-gray-500">Por semana</span><span className="text-right text-gray-900">{s.unidadesSemana} und</span>
        <span className="text-gray-500">Precio</span><span className="text-right text-gray-900">{s.precio !== null ? soles(s.precio) : "—"}</span>
      </div>
    </div>
  );
}
