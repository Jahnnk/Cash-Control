"use client";

/**
 * «Qué sacar y qué mantener» (Grupo → Productos). Mira cuánto cuesta MANTENER cada producto flojo, no solo cuánto
 * vende: lo que producimos se saca; lo que se compra hecho y dura mucho se queda en el exhibidor. La lectura sale de
 * `lecturaDe` (lib/productos/candidatos.ts), con las reglas a la vista abajo.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Candidato, Lectura } from "@/lib/productos/candidatos";
import { Pastilla } from "@/components/productos/ui";

const COLUMNAS: { tipo: Lectura["tipo"]; titulo: string; ayuda: string; barra: string; fondo: string }[] = [
  { tipo: "sacar", titulo: "Sacar", ayuda: "Lo que produces y rota poco: cuesta insumos, tiempo y energía", barra: "#C2412D", fondo: "bg-red-50/50 border-red-100" },
  { tipo: "mantener", titulo: "Mantener aunque venda poco", ayuda: "Lo que compras hecho y dura mucho", barra: "#098B5F", fondo: "bg-emerald-50/50 border-emerald-100" },
  { tipo: "revisar", titulo: "Revisar antes de decidir", ayuda: "Casos dudosos o con datos por completar", barra: "#C8893B", fondo: "bg-amber-50/50 border-amber-100" },
];

const ORIGEN: Record<NonNullable<Candidato["origen"]>, { texto: string; tono: "azul" | "marca" | "verde" | "gris" }> = {
  tienda: { texto: "Se prepara en tienda", tono: "azul" },
  atelier: { texto: "Lo hace Atelier", tono: "marca" },
  reventa: { texto: "Reventa", tono: "verde" },
  "por-definir": { texto: "Origen por definir", tono: "gris" },
};

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

export function QueSacar({ candidatos }: { candidatos: Candidato[] }) {
  const lista = candidatos.filter((c) => c.lectura && c.veredicto !== "observar");
  const sinOrigen = lista.filter((c) => c.origen === null || c.origen === "por-definir").length;
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900">Qué sacar y qué mantener de mi carta</h4>
        <p className="text-xs text-gray-500 mt-0.5">
          No solo mira cuánto vende cada producto, sino cuánto te cuesta mantenerlo: lo que produces se pierde si no se vende; lo que compras hecho y dura, no.
        </p>
      </div>
      {sinOrigen > 0 && (
        <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
          {sinOrigen === lista.length
            ? "Todavía no sé de dónde sale cada producto. Sube el Excel de pricing en la pestaña «Reportes de rotación» de Productos y esta lectura se afina sola."
            : `${sinOrigen} producto${sinOrigen === 1 ? "" : "s"} sin origen en el Excel de pricing: ${sinOrigen === 1 ? "queda" : "quedan"} en «Revisar».`}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        {COLUMNAS.map((col) => {
          const items = lista.filter((c) => c.lectura!.tipo === col.tipo);
          return (
            <div key={col.tipo} className={`rounded-xl border p-3 ${col.fondo}`}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.barra }} />
                <span className="text-sm font-semibold text-gray-900">{col.titulo}</span>
                <span className="ml-auto text-xl font-semibold tabular-nums text-gray-900">{items.length}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">{col.ayuda}</p>
              <ul className="space-y-2">
                {items.length === 0 && <li className="text-xs text-gray-400 py-3 text-center">Ninguno</li>}
                {items.map((c) => <Ficha key={c.clave} c={c} />)}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Ficha({ c }: { c: Candidato }) {
  const [abierta, setAbierta] = useState(false);
  const o = c.origen ? ORIGEN[c.origen] : null;
  const porSemana = Math.round(c.sedes.reduce((s, x) => s + x.unidadesSemana, 0) * 10) / 10;
  return (
    <li className="rounded-lg bg-white border border-gray-200 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 leading-snug">{c.nombre}</span>
        {o && <Pastilla tono={o.tono}>{o.texto}</Pastilla>}
      </div>
      {(c.seccion || c.enCarta === false) && (
        <p className="text-[11px] text-gray-400 mt-0.5">{c.enCarta === false ? "Solo exhibidor · no está en la carta" : `En la carta · ${c.seccion}`}</p>
      )}
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{c.lectura!.porQue}</p>
      <p className="text-[11px] text-gray-500 mt-1">
        Vende <b className="tabular-nums text-gray-700">{porSemana}</b> por semana (las dos sedes)
        {c.impactoMes.ganancia !== null && <> · deja <b className="tabular-nums text-gray-700">{soles(c.impactoMes.ganancia)}</b> de ganancia al mes</>}
      </p>
      <button type="button" onClick={() => setAbierta(!abierta)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline" aria-expanded={abierta}>
        <ChevronDown className={`w-3 h-3 transition-transform ${abierta ? "rotate-180" : ""}`} /> Por qué aparece
      </button>
      {abierta && <p className="text-[11px] text-gray-500 mt-1">{c.razon} {c.cuando}.</p>}
    </li>
  );
}
