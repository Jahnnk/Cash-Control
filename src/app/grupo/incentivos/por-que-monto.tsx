"use client";

/**
 * «¿Por qué este monto?» — tarjeta corta que explica, nivel por nivel, de dónde sale lo que cada sede
 * tiene que repartir (pedido de Jahnn, 16-oct-2026: Fonavi S/538 y Centro S/391 en el Nivel 1 eran
 * correctos, pero no se entendía de un vistazo). Solo MUESTRA lo que el motor ya calculó
 * (lib/incentives/explicacion-bono.ts): no tiene cuentas propias.
 * Cerrada por defecto, con el resumen visible.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ExplicacionBono } from "@/lib/incentives/explicacion-bono";

export function PorQueMonto({ x, nivelActual, abiertaAlInicio = false }: { x: ExplicacionBono; nivelActual: string | null; abiertaAlInicio?: boolean }) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  const [i, setI] = useState(() => Math.max(0, x.niveles.findIndex((n) => n.nombre === nivelActual)));
  const n = x.niveles[i];
  if (!n) return null;
  const hayColchon = n.colchon !== null && n.pozo !== null;
  const alcanza = hayColchon && n.colchon! >= 0;

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/50">
      <button type="button" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-primary hover:bg-gray-50 rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
        <span>¿Por qué este monto?</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${abierta ? "rotate-180" : ""}`} />
      </button>

      {abierta && (
        <div className="px-3 pb-3 text-sm text-gray-800 space-y-3">
          <div role="tablist" aria-label="Nivel" className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-gray-100 p-1">
            {x.niveles.map((l, k) => (
              <button key={l.nombre} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${k === i ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {l.nombre}
              </button>
            ))}
          </div>

          <div>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{formatCurrency(n.total)}</div>
            <div className="text-xs text-gray-500">
              se reparten entre {x.personas.length} personas
              {n.premioMv > 0 && <> + {formatCurrency(n.premioMv)} del mejor vendedor</>}
            </div>
          </div>

          <div className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-gray-800">Se paga por horas.</strong>{" "}
            En este nivel cada hora vale <strong>S/{n.tarifaHora.toFixed(2)}</strong>: un medio turno ({x.horasMedioTurno} h) cobra {formatCurrency(n.bonoMedioTurno)}.
            Administración cobra un monto fijo por el puesto ({formatCurrency(n.bonoAdmin)}).{" "}
            {x.horasDe === "planilla" ? "Las horas son las trabajadas del mes, de Planilla." : "Este mes se usan las horas del contrato: a Planilla le falta cargar horas de alguien."}
          </div>

          <ul className="divide-y divide-gray-100 rounded-lg bg-white border border-gray-100">
            {x.personas.map((q) => (
              <li key={q.nombre} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate text-gray-800">
                  {q.nombre}
                  <span className="text-gray-400"> · {q.esAdmin ? "puesto fijo" : q.horas !== null ? `${q.horas} h` : q.rol}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-gray-900">{formatCurrency(q.montos[i])}</span>
              </li>
            ))}
            {n.premioMv > 0 && (
              <li className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-xs bg-amber-50/60">
                <span className="text-amber-900">Premio al mejor vendedor</span>
                <span className="shrink-0 font-medium tabular-nums text-amber-900">{formatCurrency(n.premioMv)}</span>
              </li>
            )}
          </ul>

          {x.excluidos.length > 0 && (
            <div className="text-xs text-gray-600 leading-relaxed">
              <strong className="text-gray-800">No entran al reparto:</strong>
              <ul className="mt-0.5 space-y-0.5">
                {x.excluidos.map((e) => <li key={e.nombre}>{e.nombre} <span className="text-gray-400">· {e.motivo}</span></li>)}
              </ul>
            </div>
          )}

          <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${!hayColchon ? "bg-gray-100 text-gray-600" : alcanza ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>
            {!hayColchon
              ? "Todavía no hay pozo calculado para este nivel."
              : alcanza
                ? <>✓ <strong>Alcanza.</strong> El pozo de este nivel es {formatCurrency(n.pozo!)}; después de pagar los bonos sobran {formatCurrency(n.colchon!)}.</>
                : <>⚠ <strong>No alcanza.</strong> El pozo de este nivel es {formatCurrency(n.pozo!)} y los bonos suman {formatCurrency(n.total)}: faltan {formatCurrency(-n.colchon!)}.</>}
          </div>

          <div className="text-[11px] text-gray-400">
            Por eso cada sede reparte un monto distinto en el mismo nivel: más gente o más horas, más bono.
          </div>
        </div>
      )}
    </div>
  );
}
