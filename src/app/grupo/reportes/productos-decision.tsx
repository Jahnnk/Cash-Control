"use client";

/**
 * Reportes · «Productos: qué potenciar y qué reemplazar» (Fase 2, punto 8 de Jahnn, 23-oct-2026). Dos listas cortas para la
 * carta de Fonavi y Centro: las ESTRELLAS de la matriz (venden mucho y dejan mucho: potenciar) y los candidatos a SACAR o
 * con reemplazo por preparar. Es el mismo cerebro de Grupo → Productos (matriz-carta.ts y candidatos.ts); el análisis
 * completo vive allí.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Repeat } from "lucide-react";
import { getCandidatosReemplazo, type CandidatosReemplazo } from "@/app/actions/productos-panorama";
import { armarMatriz } from "@/lib/productos/matriz-carta";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const MAX = 6;

export function ProductosDecision({ mes }: { mes: string }) {
  const [res, setRes] = useState<{ mes: string; data: CandidatosReemplazo | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    getCandidatosReemplazo(mes)
      .then((r) => { if (vivo) setRes({ mes, data: r.ok ? r.data : null }); })
      .catch(() => { if (vivo) setRes({ mes, data: null }); });
    return () => { vivo = false; };
  }, [mes]);
  return <VistaProductosDecision data={res?.mes === mes ? res.data : undefined} />;
}

/** Solo dibuja. `undefined` = cargando; `null` = no se pudo leer. */
export function VistaProductosDecision({ data }: { data: CandidatosReemplazo | null | undefined }) {

  const potenciar = useMemo(() => {
    if (!data) return [];
    const m = armarMatriz(data.matriz, data.cartas, { sedeId: null, familia: null });
    return m.puntos.filter((p) => p.cuadrante === "estrella").sort((a, b) => b.gananciaMes - a.gananciaMes).slice(0, MAX);
  }, [data]);
  const reemplazar = useMemo(() => (data?.candidatos ?? [])
    .filter((c) => c.veredicto === "sacar" || c.veredicto === "preparar")
    .sort((a, b) => (a.veredicto === b.veredicto ? b.puntos - a.puntos : a.veredicto === "sacar" ? -1 : 1))
    .slice(0, MAX), [data]);

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white px-4 py-4 sm:px-6 sm:py-5" aria-label="Qué productos potenciar y cuáles reemplazar">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Productos <span className="font-normal text-gray-500">· qué potenciar y qué reemplazar</span></h2>
          <p className="mt-0.5 text-xs text-gray-500">Carta de Fonavi y Centro, con los reportes de rotación de Byte y el costo de cada plato.</p>
        </div>
        <Link href="/grupo/productos" className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">Ver la matriz completa <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>

      {data === undefined ? (
        <div className="mt-3 h-40 rounded-xl bg-gray-50 motion-safe:animate-pulse" aria-label="Cargando productos" />
      ) : data === null ? (
        <p className="mt-3 text-sm text-gray-500">No se pudieron leer los productos.</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800"><ArrowUpRight className="h-4 w-4" aria-hidden />Potenciar <span className="font-normal text-emerald-700">· estrellas: venden mucho y dejan mucho</span></h3>
            {potenciar.length === 0 ? <p className="mt-2 text-xs text-gray-500">Sin estrellas con los datos de estos meses.</p> : (
              <ol className="mt-2 space-y-1.5">
                {potenciar.map((p) => (
                  <li key={p.clave} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-gray-800">{p.nombre}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-gray-500">deja <b className="text-gray-800">{soles(p.gananciaMes)}</b>/mes · {Math.round(p.unidadesSemana)} u/sem</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50/40 px-3 py-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-800"><Repeat className="h-4 w-4" aria-hidden />Reemplazar <span className="font-normal text-red-700">· venden poco y cuestan mantener</span></h3>
            {reemplazar.length === 0 ? <p className="mt-2 text-xs text-gray-500">Ningún producto para sacar con los datos de estos meses.</p> : (
              <ol className="mt-2 space-y-2">
                {reemplazar.map((c) => (
                  <li key={c.clave} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-gray-800">{c.nombre}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.veredicto === "sacar" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{c.veredicto === "sacar" ? "Sacar" : "Preparar reemplazo"}</span>
                    </div>
                    {/* La primera frase de la razón; el detalle completo está en Grupo → Productos. */}
                    <p className="text-[11px] leading-snug text-gray-500">{c.razon.split(";")[0].trim()}.</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-500">Atelier se decide por canal: los productos Y- según lo que venden las cafeterías, los P- por su venta a otros clientes. <Link href="/grupo/productos" className="font-medium text-primary hover:underline">Ver Atelier por canal</Link>.</p>
    </section>
  );
}
