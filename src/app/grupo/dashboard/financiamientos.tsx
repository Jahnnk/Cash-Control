"use client";

/**
 * Deudas que estamos pagando mes a mes (Diners, deuda antigua, congeladora…) bajo «Movimiento de dinero» (pedido de Jahnn,
 * 9-nov-2026). Informativo: el capital que se devuelve no es gasto. Muestra cuánto sale por mes, cuánto se pagó y cuánto falta;
 * lo que no se sabe todavía dice «falta dato» (lib/financiamientos.ts).
 */

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { getFinanciamientos } from "@/app/actions/financiamientos";
import { cuotaMensualTotal, type EstadoFinanciamiento } from "@/lib/financiamientos";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;

export function Financiamientos({ sede }: { sede: number | null }) {
  const [datos, setDatos] = useState<{ deudas: EstadoFinanciamiento[]; sinDeuda: number } | null>(null);
  useEffect(() => { void getFinanciamientos().then((r) => setDatos(r.ok ? { deudas: r.deudas, sinDeuda: r.sinDeuda.length } : { deudas: [], sinDeuda: 0 })); }, []);
  if (!datos) return null;
  const ver = datos.deudas.filter((d) => !d.saldado && (sede === null || d.businessId === sede));
  if (ver.length === 0) return null;
  return (
    <div className="mt-3 rounded-2xl bg-amber-50/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm text-gray-600"><Landmark className="h-4 w-4 text-amber-600" aria-hidden />Deudas que estamos pagando · sale cada mes</div>
        <b className="text-xl font-semibold tabular-nums text-gray-900">{soles(cuotaMensualTotal(ver))}</b>
      </div>
      <ul className="mt-1 divide-y divide-amber-100">
        {ver.map((d) => (
          <li key={d.id} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-700">{d.nombre} · {d.sede}</span>
              {d.saldo !== null
                ? <b className="text-lg font-semibold tabular-nums text-gray-900">falta {soles(d.saldo)}</b>
                : <span className="text-sm text-gray-400">falta dato</span>}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
              {d.cuota !== null && <>Cuota {soles(d.cuota)}{d.diaPago ? ` (día ${d.diaPago})` : ""} · </>}
              pagado {soles(d.pagado)} en {d.cuotasPagadas} {d.cuotasPagadas === 1 ? "mes" : "meses"}
              {d.cuotasFaltan !== null && <> · faltan {d.cuotasFaltan} cuotas</>}
              {d.faltaDato.length > 0 && <> · pendiente de saber: {d.faltaDato.join(", ")}</>}
            </p>
          </li>
        ))}
      </ul>
      {datos.sinDeuda > 0 && <p className="mt-1 text-[11px] text-amber-700">{datos.sinDeuda} pagos de «Préstamos y tarjetas» todavía no se reconocen como de ninguna deuda.</p>}
      <p className="mt-1 text-[11px] text-gray-500">Devolver el capital de una deuda no es gasto del negocio; solo lo son los intereses.</p>
    </div>
  );
}
