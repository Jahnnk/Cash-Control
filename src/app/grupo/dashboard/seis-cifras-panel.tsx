"use client";

/**
 * Las seis cifras del negocio (pedido de Jahnn, 3-oct-2026): Ventas, Costos,
 * Gastos, Caja, Margen y Ganancia real, cada una con su definición tal cual
 * y el número del grupo con el de cada sede debajo. El cálculo y la
 * traducción a las categorías: src/lib/seis-cifras.ts.
 */

import type { ReactNode } from "react";
import { Banknote, Package, Building2, Droplets, PieChart, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Sparkline, ProgressBar } from "@/components/ui/Sparkline";
import { Delta } from "./executive-hero";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import type { CifrasSede } from "@/lib/seis-cifras";

export type ApoyoSeisCifras = {
  /** Tendencia de venta diaria del grupo. */
  serie: number[];
  ventasDeltaPct: number | null;
  /** Liquidez de HOY (banco + caja). */
  liquidez: number;
  liquidezSedes: { businessId: number; nombre: string; total: number }[];
  equilibrioPct: number | null;
  mesCerrado: boolean;
};

const ORDEN = [2, 3, 1];
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`);
const soles = (n: number | null) => (n === null ? "—" : formatCurrency(n));
const dd = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const color = (n: number | null) => (n === null ? "text-gray-900" : n < 0 ? "text-red-600" : "text-gray-900");

function Tarjeta({ icono, titulo, definicion, grande, grandeClase = "text-gray-900", sub, children, pie }: {
  icono: ReactNode; titulo: string; definicion: string; grande: string; grandeClase?: string; sub?: ReactNode; children?: ReactNode; pie?: ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 min-w-0 flex flex-col">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
        <span className="text-primary">{icono}</span>{titulo}
      </h3>
      <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">{definicion}</p>
      <div className={`mt-4 text-[2rem] font-semibold tabular-nums tracking-[-0.03em] leading-none ${grandeClase}`}>{grande}</div>
      {sub && <div className="mt-2 text-xs text-gray-500">{sub}</div>}
      {children && <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3">{children}</div>}
      {pie && <div className="mt-3 text-[11px] text-gray-500 leading-relaxed">{pie}</div>}
    </section>
  );
}

function Fila({ nombre, valor, clase = "text-gray-800", nota, nota2 }: { nombre: string; valor: string; clase?: string; nota?: string; nota2?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-gray-600">{nombre}</span>
      <span className="text-right min-w-0">
        <span className={`font-medium tabular-nums ${clase}`}>{valor}</span>
        {nota && <span className="block text-[10px] text-gray-400 leading-tight">{nota}</span>}
        {nota2 && <span className="block text-[10px] text-emerald-700 leading-tight">{nota2}</span>}
      </span>
    </div>
  );
}

export function SeisCifrasPanel({ cifras, apoyo, periodo }: { cifras: SeisCifras | null; apoyo: ApoyoSeisCifras; periodo: string }) {
  if (!cifras) {
    return <p className="text-sm text-gray-500">No se pudieron calcular las cifras de {periodo}.</p>;
  }
  const g = cifras.grupo;
  const sedes: CifrasSede[] = ORDEN.map((id) => cifras.sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s);
  const pctVenta = (monto: number, ventas: number | null) => (ventas && ventas > 0 ? `${((monto / ventas) * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de la venta` : undefined);
  /** Una sede sin resultado dice por qué en lugar de un número engañoso. */
  const resultado = (s: CifrasSede, valor: string, clase?: string, nota?: string) =>
    s.conResultado ? <Fila key={s.businessId} nombre={s.sede} valor={valor} clase={clase} nota={nota} /> : <Fila key={s.businessId} nombre={s.sede} valor="—" clase="text-gray-400" nota={s.sinResultadoPorque ?? undefined} />;
  const vRes = sedes.filter((s) => s.conResultado).reduce((t, s) => t + (s.ventas ?? 0), 0) - (g.ventasInternas > 0 && sedes.some((s) => s.businessId === 1 && s.conResultado) ? g.ventasInternas : 0);
  const hayGrupo = g.ganancia !== null;
  const cortes = sedes.filter((s) => s.corte).map((s) => `${s.sede} ${dd(s.corte)}`).join(" · ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Las seis cifras · {periodo}</h2>
        {cortes && (
          <span className={`text-[11px] ${g.provisional ? "text-amber-700" : "text-gray-400"}`}>
            {g.provisional ? "Mes a medias · " : ""}costos y gastos hasta el último día con Excel: {cortes}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ventas */}
        <Tarjeta
          icono={<Banknote className="w-4 h-4" />} titulo="Ventas"
          definicion="Lo que facturaste en el período. El punto de partida, no el resultado."
          grande={soles(g.ventas)}
          sub={apoyo.ventasDeltaPct !== null ? <span className="inline-flex items-center gap-1.5"><Delta pct={apoyo.ventasDeltaPct} className="font-semibold" /> vs mes pasado</span> : undefined}
          pie={g.ventasInternas > 0 ? `Ya descontamos ${formatCurrency(g.ventasInternas)} que Atelier le vende a Fonavi y Centro: esa venta se cuenta una sola vez.` : undefined}
        >
          {apoyo.serie.length >= 2 && <Sparkline points={apoyo.serie} tone="neutral" height={32} />}
          {sedes.map((s) => <Fila key={s.businessId} nombre={s.sede} valor={soles(s.ventas)} clase={s.ventas === null ? "text-gray-400" : undefined}
            nota={s.ventasPosteriores > 0 ? `+${formatCurrency(s.ventasPosteriores)} después del ${dd(s.corte)}` : undefined} />)}
        </Tarjeta>

        {/* Costos */}
        <Tarjeta
          icono={<Package className="w-4 h-4" />} titulo="Costos"
          definicion="Lo que gastas directamente para producir o entregar lo que vendes."
          grande={hayGrupo || g.costos > 0 ? soles(g.costos) : "—"}
          sub={hayGrupo && vRes > 0 ? `${((g.costos / vRes) * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de la venta` : undefined}
          pie="Productos de Atelier, insumos, empaques, delivery y fletes: lo que sube y baja con la venta."
        >
          {sedes.map((s) => resultado(s, soles(s.costos), undefined, pctVenta(s.costos, s.ventas)))}
        </Tarjeta>

        {/* Gastos */}
        <Tarjeta
          icono={<Building2 className="w-4 h-4" />} titulo="Gastos"
          definicion="Lo que pagas para que el negocio funcione, independientemente de cuánto vendas."
          grande={hayGrupo || g.gastos > 0 ? soles(g.gastos) : "—"}
          sub={hayGrupo && vRes > 0 ? `${((g.gastos / vRes) * 100).toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de la venta` : undefined}
          pie="Planilla, alquiler, servicios, mantenimiento… y lo que todavía nadie clasificó (cuenta como gasto)."
        >
          {sedes.map((s) => resultado(s, soles(s.gastos), undefined, pctVenta(s.gastos, s.ventas)))}
        </Tarjeta>

        {/* Caja */}
        <Tarjeta
          icono={<Droplets className="w-4 h-4" />} titulo="Caja"
          definicion="El movimiento real del efectivo: lo que entra y lo que sale físicamente."
          grande={`${g.caja.flujo >= 0 ? "" : "−"}${formatCurrency(Math.abs(g.caja.flujo))}`}
          grandeClase={g.caja.flujo < 0 ? "text-red-600" : "text-gray-900"}
          sub={<>Entró <strong className="text-gray-700 tabular-nums">{formatCurrency(g.caja.entro)}</strong> · Salió <strong className="text-gray-700 tabular-nums">{formatCurrency(g.caja.salio)}</strong> en el mes
            {(g.fuera.ahorro + g.fuera.reparto) > 0 && (
              <span className="block mt-1 text-emerald-700">
                De lo que salió, {[g.fuera.ahorro > 0 && `${formatCurrency(g.fuera.ahorro)} fue a tu ahorro`, g.fuera.reparto > 0 && `${formatCurrency(g.fuera.reparto)} a socios`].filter(Boolean).join(" y ")}: sin eso, la caja del mes sería {formatCurrency(g.caja.flujo + g.fuera.ahorro + g.fuera.reparto)}.
              </span>
            )}</>}
          pie={<>Liquidez {apoyo.mesCerrado ? "de hoy" : "ahora"} (banco + caja): <strong className="text-gray-700 tabular-nums">{formatCurrency(apoyo.liquidez)}</strong>
            {apoyo.liquidezSedes.length > 0 && <> · {apoyo.liquidezSedes.map((x) => `${x.nombre} ${formatCurrency(x.total)}`).join(" · ")}</>}</>}
        >
          {sedes.map((s) => <Fila key={s.businessId} nombre={s.sede} valor={`${s.caja.flujo >= 0 ? "" : "−"}${formatCurrency(Math.abs(s.caja.flujo))}`} clase={color(s.caja.flujo)}
            nota={`entró ${formatCurrency(s.caja.entro)} · salió ${formatCurrency(s.caja.salio)}`}
            nota2={[s.fuera.ahorro > 0 && `a ahorro ${formatCurrency(s.fuera.ahorro)}`, s.fuera.reparto > 0 && `a socios ${formatCurrency(s.fuera.reparto)}`].filter(Boolean).join(" · ") || undefined} />)}
        </Tarjeta>

        {/* Margen */}
        <Tarjeta
          icono={<PieChart className="w-4 h-4" />} titulo="Margen"
          definicion="Qué porcentaje de cada venta te queda después de cubrir los costos directos."
          grande={pct(g.margenPct)}
          sub={g.margenPct !== null ? `De cada S/ 100 que vendes, S/ ${Math.round(g.margenPct)} quedan después de los costos.` : undefined}
          pie="Margen = (Ventas − Costos) ÷ Ventas. Con él se pagan los gastos."
        >
          {g.margenPct !== null && <ProgressBar pct={g.margenPct} tone="neutral" />}
          {sedes.map((s) => resultado(s, pct(s.margenPct)))}
        </Tarjeta>

        {/* Ganancia real */}
        <Tarjeta
          icono={<CheckCircle2 className="w-4 h-4" />} titulo="Ganancia real"
          definicion="Lo que efectivamente te queda después de todos los costos, gastos e impuestos."
          grande={g.ganancia === null ? "—" : `${g.ganancia < 0 ? "−" : ""}${formatCurrency(Math.abs(g.ganancia))}`}
          grandeClase={g.ganancia !== null && g.ganancia < 0 ? "text-red-600" : g.ganancia !== null ? "text-emerald-700" : "text-gray-900"}
          sub={g.gananciaPct !== null ? `${pct(g.gananciaPct)} de la venta${g.provisional ? " · provisional" : ""}` : undefined}
          pie={hayGrupo ? (
            <>
              Ventas − Costos − Gastos − Impuestos ({formatCurrency(g.impuestos)}).
              {(g.fuera.deudas + g.fuera.inversion + g.fuera.noEsGasto) > 0 && (
                <> Salió de la caja pero no cuenta aquí: deudas {formatCurrency(g.fuera.deudas)}, inversión {formatCurrency(g.fuera.inversion)}, ahorro y reparto {formatCurrency(g.fuera.noEsGasto)}.</>
              )}
            </>
          ) : undefined}
        >
          {sedes.map((s) => resultado(s, `${(s.ganancia ?? 0) < 0 ? "−" : ""}${formatCurrency(Math.abs(s.ganancia ?? 0))}`, (s.ganancia ?? 0) < 0 ? "text-red-600" : "text-emerald-700",
            s.gananciaPct !== null ? `${pct(s.gananciaPct)} de la venta` : undefined))}
        </Tarjeta>
      </div>

      {/* Punto de equilibrio: la ganancia, medida contra lo que hay que cubrir. */}
      {apoyo.equilibrioPct !== null && (
        <div className="bg-white rounded-2xl border border-gray-200/80 px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="text-sm font-semibold text-gray-900">Punto de equilibrio</div>
          <div className="flex-1 min-w-[10rem]"><ProgressBar pct={apoyo.equilibrioPct} tone={apoyo.equilibrioPct >= 100 ? "positive" : apoyo.equilibrioPct >= 80 ? "warning" : "negative"} /></div>
          <div className="text-sm text-gray-700 tabular-nums"><strong>{Math.round(apoyo.equilibrioPct)}%</strong> · {apoyo.equilibrioPct >= 100 ? "costos cubiertos" : "falta cubrir costos"}</div>
        </div>
      )}
    </div>
  );
}
