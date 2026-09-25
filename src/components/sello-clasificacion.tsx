"use client";

/**
 * El sello de confiabilidad de la clasificación de egresos: qué parte del
 * gasto está bien clasificada y cuánta plata está en duda (Por definir).
 * Va junto al punto de equilibrio y al reporte de gastos por categoría:
 * esos números valen lo que vale la clasificación (Jahnn, 25-sep-2026).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getSellosClasificacionGrupo, getSelloClasificacionMes, type SelloClasificacion } from "@/app/actions/clasificacion";

/** 98% o más = confiable. */
const CONFIABLE = 98;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const mes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1];

function Pct({ s }: { s: SelloClasificacion }) {
  const ok = s.pctSeguro !== null && s.pctSeguro >= CONFIABLE;
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-700" : "text-amber-700"}`}>
      {ok ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
      <strong className="tabular-nums">{s.pctSeguro === null ? "—" : `${s.pctSeguro}%`}</strong>
    </span>
  );
}

/** Grupo → Finanzas: una línea por sede, en la ventana del punto de equilibrio. */
export function SelloClasificacionGrupo({ month }: { month: string }) {
  const [sellos, setSellos] = useState<SelloClasificacion[] | null>(null);
  useEffect(() => {
    let vivo = true;
    void getSellosClasificacionGrupo(month).then((r) => { if (vivo && r.ok) setSellos(r.sellos); });
    return () => { vivo = false; };
  }, [month]);
  if (!sellos || sellos.length === 0) return null;
  const enDuda = sellos.reduce((t, s) => t + s.calidad.baja, 0);
  const gastos = sellos.reduce((t, s) => t + s.calidad.filasBaja, 0);
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span className="text-gray-500">
        Clasificación de egresos ({mes(sellos[0].desde)}–{mes(sellos[0].hasta)}):
      </span>
      {sellos.map((s) => (
        <span key={s.businessId} className="inline-flex items-center gap-1.5 text-gray-700">{s.sede} <Pct s={s} /></span>
      ))}
      {enDuda > 0 ? (
        <Link href="/grupo/por-definir" className="ml-auto text-amber-800 hover:underline">
          {formatCurrency(enDuda)} en revisión ({gastos} gasto{gastos === 1 ? "" : "s"}) → Por definir
        </Link>
      ) : (
        <span className="ml-auto text-emerald-700">Nada en revisión</span>
      )}
    </div>
  );
}

/** Reporte mensual de la sede: el mes elegido. */
export function SelloClasificacionMes({ month }: { month: string }) {
  const [s, setS] = useState<SelloClasificacion | null>(null);
  useEffect(() => {
    let vivo = true;
    void getSelloClasificacionMes(month).then((r) => { if (vivo && r.ok) setS(r.sello); });
    return () => { vivo = false; };
  }, [month]);
  if (!s || s.calidad.total <= 0) return null;
  return (
    <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
      Clasificación del mes: <Pct s={s} /> segura
      {s.calidad.baja > 0 && (
        <Link href="/grupo/por-definir" className="text-amber-800 hover:underline">
          · {formatCurrency(s.calidad.baja)} en revisión ({s.calidad.filasBaja})
        </Link>
      )}
    </div>
  );
}
