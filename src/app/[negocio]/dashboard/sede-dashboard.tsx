"use client";

/**
 * Dashboard de una sede (rediseño UX, 8-oct-2026) con la misma lógica que el Resumen de Grupo:
 *   1. ¿Cómo va la sede este mes? Una cifra de ventas, su meta, el ritmo y tres datos de apoyo.
 *   2. ¿Qué necesita mi atención? Solo lo de esta sede, con su botón.
 *   3. El detalle, plegado: comparación de ventas, las seis cifras y el diagnóstico automático.
 *
 * Todas las cifras salen de las MISMAS fuentes que el Grupo (no hay dos saldos de banco distintos):
 * liquidez = lectura del banco del Excel (getLiquidezGrupo), ventas = Byte, equilibrio = el del
 * grupo para esta sede, ganancia = las seis cifras.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { EstadoMes, type EstadoMesProps } from "@/app/grupo/dashboard/estado-mes";
import { AtencionCard } from "@/app/grupo/dashboard/atencion-card";
import { SelectorMes } from "@/app/grupo/dashboard/selector-mes";
import { SeccionDesplegable } from "@/components/productos/ui";
import { InternalTransferModal } from "@/components/banking/InternalTransferModal";
import type { Atencion } from "@/lib/grupo/atencion";
import type { CifrasSede } from "@/lib/seis-cifras";
import { SalesComparisonSection } from "./sales-comparison-section";
import { CapitalCard } from "./capital-card";

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const conSigno = (n: number) => `${n < 0 ? "−" : ""}${soles(n)}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

function Cifra({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: "bien" | "mal" }) {
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{titulo}</div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${tono === "bien" ? "text-emerald-700" : tono === "mal" ? "text-red-700" : "text-gray-900"}`}>{valor}</div>
      {detalle && <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{detalle}</div>}
    </div>
  );
}

/** Las seis cifras de ESTA sede (ventas, costos, gastos, caja, margen, ganancia real). */
function SeisCifrasSede({ c }: { c: CifrasSede }) {
  const sin = c.sinResultadoPorque;
  return (
    <div className="space-y-3">
      {c.corte && <p className="text-xs text-gray-500">Costos y gastos hasta el {Number(c.corte.slice(8, 10))}/{c.corte.slice(5, 7)} (último día con Excel).</p>}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        <Cifra titulo="Ventas" valor={c.ventas !== null ? soles(c.ventas) : "—"} detalle="Lo facturado: el punto de partida" />
        <Cifra titulo="Costos" valor={c.ganancia !== null ? soles(c.costos) : "—"} detalle={c.ganancia !== null ? "Lo que sube y baja con la venta" : sin ?? undefined} />
        <Cifra titulo="Gastos" valor={c.ganancia !== null ? soles(c.gastos) : "—"} detalle={c.ganancia !== null ? "Lo que se paga venda o no" : sin ?? undefined} />
        <Cifra titulo="Caja" valor={conSigno(c.caja.flujo)} detalle={`Entró ${soles(c.caja.entro)} · salió ${soles(c.caja.salio)}`} tono={c.caja.flujo < 0 ? "mal" : undefined} />
        <Cifra titulo="Margen" valor={c.margenPct !== null ? pct(c.margenPct) : "—"} detalle="Lo que queda de cada venta tras los costos" />
        <Cifra titulo="Ganancia real" valor={c.ganancia !== null ? conSigno(c.ganancia) : "—"} detalle={c.ganancia !== null ? `${c.gananciaPct !== null ? pct(c.gananciaPct) : ""} de lo vendido` : sin ?? undefined}
          tono={c.ganancia === null ? undefined : c.ganancia < 0 ? "mal" : "bien"} />
      </div>
    </div>
  );
}

export type SedeDashboardProps = {
  sede: string;
  code: string;
  mes: string;
  mesActual: string;
  estado: EstadoMesProps;
  atencion: Atencion[];
  cifras: CifrasSede | null;
  /** El diagnóstico automático (Centro de Comando), solo en el mes en curso. */
  diagnostico: ReactNode;
};

export function SedeDashboard(p: SedeDashboardProps) {
  const [transferencia, setTransferencia] = useState(false);
  const enCurso = p.mes === p.mesActual;
  const irA = () => false;

  return (
    <div className="space-y-6 pb-4 max-w-[1400px] min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{p.sede}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SelectorMes mes={p.mes} mesActual={p.mesActual} ruta={`/${p.code}/dashboard`} />
          <button type="button" onClick={() => setTransferencia(true)} title="Mover dinero entre la caja efectivo y la cuenta BCP"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs sm:text-sm text-gray-600 hover:bg-gray-50">
            <ArrowRightLeft className="w-4 h-4" /> <span className="hidden sm:inline">Transferencia interna</span>
          </button>
        </div>
      </header>
      <InternalTransferModal open={transferencia} onClose={() => setTransferencia(false)} />

      <div className={`grid grid-cols-1 gap-5 items-start ${enCurso ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
        <EstadoMes {...p.estado} />
        {enCurso && <AtencionCard items={p.atencion} onIr={irA} />}
      </div>

      <SeccionDesplegable titulo="Ventas: semana y mes comparados" subtitulo="La semana contra la anterior y el mes contra los mismos días del mes pasado, con gráficas.">
        <SalesComparisonSection />
      </SeccionDesplegable>

      {p.cifras && (
        <SeccionDesplegable titulo="Las seis cifras de la sede" subtitulo="Ventas, costos, gastos, caja, margen y ganancia real del mes.">
          <SeisCifrasSede c={p.cifras} />
        </SeccionDesplegable>
      )}

      {/* Plata que entró y no es venta: aportes del socio, préstamos… (se oculta sola si no hay). */}
      <CapitalCard />

      {enCurso && p.diagnostico && (
        <SeccionDesplegable titulo="Diagnóstico automático" subtitulo="La lectura del Centro de Comando. A inicios de mes, con el Excel incompleto, sus conclusiones son preliminares.">
          {p.diagnostico}
        </SeccionDesplegable>
      )}

      <p className="text-xs text-gray-400">
        ¿Buscas el punto de equilibrio, el flujo de caja o los márgenes? Están en <Link href="/grupo/reportes" className="underline hover:text-gray-600">Grupo → Reportes</Link>.
      </p>
    </div>
  );
}
