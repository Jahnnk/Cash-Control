"use client";

/**
 * Vendido → Ingresado → Ganancia real: tres barras por sede y por mes. Pedido
 * de Jahnn, 3-oct-2026, tomado de un libro ("facturación, efectivo y beneficio");
 * desde el 14-oct-2026 es lo PRIMERO del Resumen de Grupo, porque junta las dos
 * fuentes sin contradecirse: Byte (lo vendido) y el Excel de finanzas (lo que
 * ingresó a banco y caja). «Ingresado» se llamaba «Cobrado»: chocaba con «Por
 * cobrar». Los números y la regla de cada barra: src/lib/venta-a-ganancia.ts.
 */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { barrasDelMes, type BarrasSede } from "@/lib/venta-a-ganancia";
import type { SeisCifras } from "@/app/actions/seis-cifras";

/** Lo que el Resumen agrega a cada tarjeta: a dónde lleva, su etiqueta y una línea de estado al pie. */
export type ExtraSede = { href: string; flag: "atencion" | "mejor" | null; pie: ReactNode };

const ALTO = 112;
const dd = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

const BARRAS = [
  { clave: "vendido", n: 1, nombre: "Vendido", sub: "según Byte", color: "bg-[#004C40]", texto: "text-[#004C40]" },
  { clave: "cobrado", n: 2, nombre: "Ingresado", sub: "por ventas", color: "bg-[#098B5F]", texto: "text-[#098B5F]" },
  { clave: "ganancia", n: 3, nombre: "Ganancia real", sub: "después de todo", color: "bg-[#D9A441]", texto: "text-[#A7771B]" },
] as const;

function Sede({ b, extra }: { b: BarrasSede; extra?: ExtraSede }) {
  const valores = { vendido: b.vendido, cobrado: b.cobrado, ganancia: b.ganancia };
  const tope = Math.max(b.vendido ?? 0, b.cobrado ?? 0, b.ganancia ?? 0, 1);
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 p-5 min-w-0 flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        {extra ? (
          <Link href={extra.href} className="group inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:text-primary">
            {b.sede}<ArrowUpRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-primary" aria-hidden />
          </Link>
        ) : <h4 className="text-sm font-semibold text-gray-900">{b.sede}</h4>}
        <span className="flex items-center gap-2">
          {extra?.flag === "atencion" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">Atención</span>}
          {extra?.flag === "mejor" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">Mejor</span>}
          {b.corte && !extra && <span className="text-[11px] text-gray-400">hasta el {dd(b.corte)}</span>}
        </span>
      </div>
      {!b.conBarras ? (
        <p className="mt-6 mb-2 text-sm text-gray-400">{b.vendido === null || b.vendido <= 0 ? "Sin ventas cargadas." : "Sin Excel de este mes."}</p>
      ) : (
        <>
          <div className="mt-4 flex items-end justify-between gap-3" style={{ height: ALTO + 44 }}>
            {BARRAS.map((x) => {
              const v = valores[x.clave];
              const negativa = v !== null && v < 0;
              const alto = v === null ? 0 : Math.max(Math.round((Math.max(v, 0) / tope) * ALTO), v !== 0 ? 4 : 0);
              return (
                <div key={x.clave} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                  <span className={`mb-1.5 text-[13px] font-semibold tabular-nums whitespace-nowrap ${negativa ? "text-red-600" : x.texto}`}>
                    {v === null ? "—" : `${negativa ? "−" : ""}S/ ${Math.round(Math.abs(v)).toLocaleString("es-PE")}`}
                  </span>
                  {v === null
                    ? <div className="w-full rounded-t-md border border-dashed border-gray-300" style={{ height: 24 }} />
                    : <div className={`w-full rounded-t-md ${x.color}`} style={{ height: alto }} />}
                </div>
              );
            })}
          </div>
          <div className="border-t border-gray-300 flex justify-between gap-3 pt-2">
            {BARRAS.map((x) => (
              <div key={x.clave} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <span className={`w-5 h-5 rounded-full text-[11px] font-semibold text-white flex items-center justify-center ${x.color}`}>{x.n}</span>
                <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{x.nombre}</span>
                <span className="-mt-0.5 text-[10px] text-gray-400 text-center leading-tight">{x.sub}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1.5 text-xs text-gray-500 leading-relaxed">
            {b.gananciaPct !== null
              ? <p><strong className="text-gray-800">{pct(b.gananciaPct)}</strong> de lo vendido queda como ganancia.</p>
              : <p>Sin ganancia todavía: {(b.sinGananciaPorque ?? "faltan datos").toLowerCase()}.</p>}
            {b.nota && <p>{b.nota}</p>}
            {b.otrosIngresos !== null && b.otrosIngresos >= 1 && (
              <p>Además entraron <strong className="text-gray-700">S/ {Math.round(b.otrosIngresos).toLocaleString("es-PE")}</strong> que no son ventas (devoluciones, depósitos y filas sin grupo).</p>
            )}
          </div>
        </>
      )}
      {extra?.pie && <div className="mt-3 border-t border-gray-100 pt-2.5 text-[11px] leading-relaxed text-gray-500">{extra.pie}</div>}
    </div>
  );
}

/** Las tres tarjetas de sede. `extras` (por businessId) agrega enlace, etiqueta y estado al pie. */
export function BarrasVentaAGanancia({ cifras, periodo, extras }: { cifras: SeisCifras | null; periodo: string; extras?: Record<number, ExtraSede> }) {
  const barras = cifras ? barrasDelMes(cifras.sedes) : [];
  if (barras.length === 0) return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {periodo}.</p>;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{barras.map((b) => <Sede key={b.businessId} b={b} extra={extras?.[b.businessId]} />)}</div>
      <p className="mt-3 text-[11px] text-gray-400 leading-relaxed">
        Vendido = ventas de Byte · Ingresado = lo que entró por ventas, según el Excel (filas con Grupo «Ventas») · Ganancia real = ventas − costos − gastos − impuestos. Todo hasta el último día con Excel de cada sede.
      </p>
    </>
  );
}
