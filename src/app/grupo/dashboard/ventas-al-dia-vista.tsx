"use client";

import { ChevronDown, CircleCheck, TriangleAlert } from "lucide-react";
import { etiquetaDia } from "@/lib/kpis/llenado";
import type { SedeVentasAlDia, VentasAlDia } from "@/lib/kpis/ventas-al-dia";

/**
 * «Ventas al día» (pedido de Jahnn, 19-oct-2026): el Excel de finanzas llega una vez por semana y su reporte de Byte los
 * lunes; entre una carga y otra, lo que anota cada administrador en su Panel de Sede es la venta diaria. Esta vista
 * suma lo anotado en el mes por sede, dice hasta qué día llega y lo contrasta con Byte en los mismos días. Aparte de las
 * tarjetas de sede (que cuentan hasta el último día con Excel). La cifra oficial de ventas sigue siendo la de Byte.
 * Todo lo decide lib/kpis/ventas-al-dia.ts; aquí solo se dibuja.
 */

const soles = (n: number) => `${n < 0 ? "−" : ""}S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const solesFino = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}S/ ${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const lista = (fs: string[]) => fs.map(etiquetaDia).join(", ");

function Fila({ s }: { s: SedeVentasAlDia }) {
  const ok = s.estado === "cuadra";
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)] sm:items-start">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">{s.sede}</div>
        <div className="text-[11px] text-gray-500">{s.hasta ? `hasta el ${ddmm(s.hasta)} · ${s.diasConDato} días anotados` : "nada anotado este mes"}</div>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Lo que anotó</div>
        <div className="text-lg font-semibold tabular-nums text-gray-900">{soles(s.anotado)}</div>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Byte, mismos días</div>
        <div className="text-lg font-semibold tabular-nums text-gray-700">{s.estado === "sin-dato" ? "—" : soles(s.byteMismosDias)}</div>
        <div className="text-[10px] text-gray-400">{s.byteHasta ? `tu reporte llega al ${ddmm(s.byteHasta)}` : "sin reporte de Byte"}</div>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        {s.estado === "sin-dato" ? null : (
          <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
            {ok ? <CircleCheck className="h-3.5 w-3.5" aria-hidden /> : <TriangleAlert className="h-3.5 w-3.5" aria-hidden />}
            {ok ? "Cuadra con Byte" : "Revisar"}
            <span className="tabular-nums font-normal opacity-80">{Math.abs(s.diferencia) >= 0.005 ? solesFino(s.diferencia) : "S/ 0.00"}</span>
          </div>
        )}
        {s.repartoDistinto.map((g) => (
          <p key={g.join()} className="mt-1 text-[11px] leading-snug text-gray-500">Byte repartió distinto {lista(g)}; juntos casi coinciden (caja sin abrir).</p>
        ))}
        {s.sueltos.length > 0 && <p className="mt-1 text-[11px] leading-snug text-amber-800">No coincide con Byte: {lista(s.sueltos)}.</p>}
        {s.faltan.length > 0 && <p className="mt-1 text-[11px] leading-snug text-amber-800">Falta anotar: {lista(s.faltan)}.</p>}
      </div>
    </div>
  );
}

/** El estado de una sede en una frase corta, para la línea plegada. */
function estadoCorto(s: SedeVentasAlDia): { ok: boolean; texto: string } {
  if (s.estado === "sin-dato") return { ok: false, texto: "sin anotar" };
  if (s.estado === "revisar") return { ok: false, texto: "revisar" };
  if (s.faltan.length > 0) return { ok: false, texto: s.faltan.length === 1 ? "falta 1 día" : `faltan ${s.faltan.length} días` };
  return { ok: true, texto: "cuadra" };
}

/** Solo dibuja: recibe el resultado ya calculado (así se puede probar y ver sin base de datos). */
export function VistaVentasAlDia({ datos }: { datos: VentasAlDia }) {
  const fechas = [...new Set(datos.sedes.flatMap((s) => s.dias.map((d) => d.fecha)))].sort().reverse();
  const celda = (s: SedeVentasAlDia, f: string) => {
    const d = s.dias.find((x) => x.fecha === f);
    if (!d) return <span className="text-gray-300">—</span>;
    const mal = d.dif !== null && Math.abs(d.dif) >= 5;
    return (
      <span className="tabular-nums">
        {d.admin === null ? <span className="text-amber-700">sin anotar</span> : soles(d.admin)}
        <span className={`ml-1 text-[10px] ${mal ? "text-amber-700" : "text-gray-400"}`}>{d.byte === null ? "Byte: aún no" : `Byte ${soles(d.byte)}`}</span>
      </span>
    );
  };
  // Divulgación progresiva: plegado es UNA línea con el estado de cada sede; el detalle se abre solo si se pide
  // (si algo no coincide, el aviso de «Necesita tu atención» lleva hasta aquí y lo abre).
  return (
    <details id="ventas-al-dia" className="group scroll-mt-4 rounded-2xl border border-gray-200/80 bg-white" aria-label="Ventas al día según los administradores">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 className="text-sm font-semibold text-gray-900">Ventas al día <span className="font-normal text-gray-500">· lo que anotan los administradores</span></h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {datos.sedes.map((s) => {
              const e = estadoCorto(s);
              return (
                <span key={s.businessId} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${e.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
                  {e.ok ? <CircleCheck className="h-3 w-3" aria-hidden /> : <TriangleAlert className="h-3 w-3" aria-hidden />}
                  <b className="font-medium">{s.sede}</b> {e.texto}
                </span>
              );
            })}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
          Ver contra Byte <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>

      <div className="border-t border-gray-100 px-4 pb-4 pt-3 sm:px-6">
        <p className="text-xs text-gray-500">Entre una carga de Byte y la siguiente: la venta diaria que cada administrador anota en su Panel de Sede, contrastada con tu reporte de Byte.</p>

        <div className="mt-2">{datos.sedes.map((s) => <Fila key={s.businessId} s={s} />)}</div>

        <div className="mt-1 grid grid-cols-2 gap-x-4 rounded-xl bg-gray-50 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)]">
          <div className="text-sm font-semibold text-gray-900">Las 3 sedes</div>
          <div className="text-lg font-semibold tabular-nums text-gray-900">{soles(datos.grupo.anotado)}</div>
          <div className="text-lg font-semibold tabular-nums text-gray-700">{soles(datos.grupo.byteMismosDias)}</div>
          <div className="col-span-2 text-xs text-gray-600 sm:col-span-1">Diferencia <b className="tabular-nums">{solesFino(datos.grupo.diferencia)}</b></div>
        </div>

        {fechas.length > 0 && (
          <details className="group/dia mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
              Día por día <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/dia:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="py-1 pr-3 font-medium">Día</th>
                    {datos.sedes.map((s) => <th key={s.businessId} className="py-1 pr-3 font-medium">{s.sede}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fechas.map((f) => (
                    <tr key={f}>
                      <td className="py-1.5 pr-3 font-medium text-gray-800">{etiquetaDia(f)}</td>
                      {datos.sedes.map((s) => <td key={s.businessId} className="py-1.5 pr-3">{celda(s, f)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
