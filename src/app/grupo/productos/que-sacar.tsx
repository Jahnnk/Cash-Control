"use client";

/**
 * «Qué sacar y qué mantener» (Grupo → Productos). Mira cuánto cuesta MANTENER cada producto flojo, no solo cuánto
 * vende: lo que producimos se saca; lo que se compra hecho y dura mucho se queda en el exhibidor. La lectura sale de
 * `lecturaDe` (lib/productos/candidatos.ts), con las reglas a la vista abajo.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { getCandidatosReemplazo, type CandidatosReemplazo } from "@/app/actions/productos-panorama";
import type { Candidato, Lectura, ReventaQueSeMantiene } from "@/lib/productos/candidatos";
import { Pastilla } from "@/components/productos/ui";
import { GraficoDemanda, type SerieDemanda } from "@/components/productos/grafico-demanda";
import { evidenciaDe } from "@/lib/productos/tendencia";

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

export function QueSacar({ candidatos, reventa = [] }: { candidatos: Candidato[]; reventa?: ReventaQueSeMantiene[] }) {
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
            ? "Todavía no sé de dónde sale cada producto. Sube el Excel de pricing con el botón «Subir pricing» de Productos y esta lectura se afina sola."
            : `${sinOrigen} producto${sinOrigen === 1 ? "" : "s"} sin origen en el Excel de pricing: ${sinOrigen === 1 ? "queda" : "quedan"} en «Revisar».`}
        </p>
      )}
      <ColumnaSacar items={lista.filter((c) => c.lectura!.tipo === "sacar")} />
      <div className="grid gap-3 lg:grid-cols-2">
        {COLUMNAS.filter((col) => col.tipo !== "sacar").map((col) => {
          const items = lista.filter((c) => c.lectura!.tipo === col.tipo);
          const total = items.length + (col.tipo === "mantener" ? reventa.length : 0);
          return (
            <div key={col.tipo} className={`rounded-xl border p-3 ${col.fondo}`}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.barra }} />
                <span className="text-sm font-semibold text-gray-900">{col.titulo}</span>
                <span className="ml-auto text-xl font-semibold tabular-nums text-gray-900">{total}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">{col.ayuda}</p>
              <ul className="space-y-2">
                {total === 0 && <li className="text-xs text-gray-400 py-3 text-center">Ninguno</li>}
                {items.map((c) => <Ficha key={c.clave} c={c} />)}
                {col.tipo === "mantener" && reventa.map((r) => <FichaReventa key={r.nombre} r={r} />)}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** El top 5 para sacar (ya viene ordenado: primero lo que más cuesta mantener) y el resto en un desplegable. */
function ColumnaSacar({ items }: { items: Candidato[] }) {
  const [verResto, setVerResto] = useState(false);
  const col = COLUMNAS[0];
  const top = items.slice(0, 5), resto = items.slice(5);
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${col.fondo}`}>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.barra }} />
        <span className="text-sm font-semibold text-gray-900">Tu top {Math.min(5, items.length) || 5} para sacar</span>
        <span className="ml-auto text-xs text-gray-500">{items.length} en total</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5 mb-3">{col.ayuda}. Empieza por los primeros: están ordenados por lo que más cuesta mantenerlos.</p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center">Ninguno</p>
      ) : (
        <ol className="grid gap-2 xl:grid-cols-2">
          {top.map((c, i) => <Ficha key={c.clave} c={c} puesto={i + 1} />)}
        </ol>
      )}
      {resto.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setVerResto(!verResto)} aria-expanded={verResto}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg px-3 py-1.5">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verResto ? "rotate-180" : ""}`} />
            {verResto ? "Ocultar el resto" : `Ver los ${resto.length} restantes`}
          </button>
          {verResto && <ol className="grid gap-2 xl:grid-cols-2 mt-3">{resto.map((c, i) => <Ficha key={c.clave} c={c} puesto={i + 6} />)}</ol>}
        </div>
      )}
    </div>
  );
}

const COLOR_SEDE: Record<number, Pick<SerieDemanda, "color" | "forma">> = {
  2: { color: "#098B5F", forma: "circulo" },
  3: { color: "#6B4FA0", forma: "cuadrado" },
};
const TONO_EVIDENCIA = { rojo: "text-red-800 bg-red-50 border-red-200", verde: "text-emerald-800 bg-emerald-50 border-emerald-200", ambar: "text-amber-900 bg-amber-50 border-amber-200", gris: "text-gray-700 bg-gray-50 border-gray-200" };

type SerieSede = { sede: string; businessId: number; porMes: { month: string; completo: boolean; unidadesDia: number }[] };
/** La evolución del producto: unidades por semana, mes a mes, una línea por sede. */
function Evolucion({ sedes, evidencia }: { sedes: SerieSede[]; evidencia?: { titulo: string; tono: keyof typeof TONO_EVIDENCIA } }) {
  const series: SerieDemanda[] = sedes.map((s) => ({
    nombre: s.sede,
    ...(COLOR_SEDE[s.businessId] ?? { color: "#004C40", forma: "circulo" as const }),
    puntos: s.porMes.map((m) => ({ month: m.month, completo: m.completo, porSemana: m.unidadesDia * 7 })),
  }));
  return (
    <div className="space-y-2 mt-2">
      {evidencia && <p className={`text-xs font-medium rounded-lg border px-2.5 py-1.5 ${TONO_EVIDENCIA[evidencia.tono]}`}>{evidencia.titulo}</p>}
      <GraficoDemanda series={series} />
    </div>
  );
}

function Ficha({ c, puesto }: { c: Candidato; puesto?: number }) {
  const [abierta, setAbierta] = useState(false);
  const o = c.origen ? ORIGEN[c.origen] : null;
  const porSemana = Math.round(c.sedes.reduce((s, x) => s + x.unidadesSemana, 0) * 10) / 10;
  return (
    <li className="rounded-lg bg-white border border-gray-200 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 leading-snug">{puesto !== undefined && <span className="text-gray-400 tabular-nums mr-1.5">{puesto}.</span>}{c.nombre}</span>
        {o && <Pastilla tono={o.tono}>{o.texto}</Pastilla>}
      </div>
      {(c.seccion || c.enCarta === false) && (
        <p className="text-[11px] text-gray-400 mt-0.5">{c.enCarta === false ? (c.origen === "reventa" ? "Solo exhibidor · no está en la carta" : "Fuera de la carta digital") : `En la carta · ${c.seccion}`}</p>
      )}
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{c.lectura!.porQue}</p>
      <p className="text-[11px] text-gray-500 mt-1">
        Vende <b className="tabular-nums text-gray-700">{porSemana}</b> por semana (las dos sedes)
        {c.impactoMes.ganancia !== null && <> · deja <b className="tabular-nums text-gray-700">{soles(c.impactoMes.ganancia)}</b> de ganancia al mes</>}
      </p>
      {c.lectura?.tipo === "sacar" && c.compras.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {c.compras.map((x) => (
            <li key={x.insumo} className="text-[11px] text-gray-600">
              <span className="text-gray-400">Compra · </span>
              {x.otros.length === 0
                ? <>Dejas de comprar <b className="text-gray-800">{x.insumo}</b>.</>
                : <>Seguirías comprando <b className="text-gray-800">{x.insumo}</b> para {x.otros.length === 6 ? "6 o más" : x.otros.length} producto{x.otros.length === 1 ? "" : "s"} más ({x.otros.slice(0, 3).join(", ")}{x.otros.length > 3 ? "…" : ""}).</>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => setAbierta(!abierta)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline" aria-expanded={abierta}>
        <ChevronDown className={`w-3 h-3 transition-transform ${abierta ? "rotate-180" : ""}`} /> Ver evolución y por qué aparece
      </button>
      {abierta && (
        <>
          <p className="text-[11px] text-gray-500 mt-1">{c.razon} {c.cuando}.</p>
          <Evolucion sedes={c.sedes} evidencia={evidenciaDe(c.sedes.map((x) => ({ sede: x.sede, tendencia: x.tendencia })))} />
        </>
      )}
    </li>
  );
}

/** La pestaña «Qué sacar» de Productos: carga los candidatos del mes y muestra el apartado. */
export function QueSacarPestana({ month }: { month: string }) {
  const [data, setData] = useState<CandidatosReemplazo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void getCandidatosReemplazo(month).then((r) => {
      if (!vivo) return;
      if (r.ok) { setData(r.data); setError(null); } else setError(r.error);
    });
    return () => { vivo = false; };
  }, [month]);
  if (error) return <p className="text-sm text-gray-500">{error}</p>;
  if (!data) return <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6">
      <QueSacar candidatos={data.candidatos} reventa={data.reventaQueSeMantiene} />
    </section>
  );
}

function FichaReventa({ r }: { r: ReventaQueSeMantiene }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <li className="rounded-lg bg-white border border-gray-200 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 leading-snug">{r.nombre}</span>
        <Pastilla tono="verde">Reventa</Pastilla>
      </div>
      <p className="text-[11px] text-gray-400 mt-0.5">{r.enCarta === false ? "Solo exhibidor · no está en la carta" : r.seccion ? `En la carta · ${r.seccion}` : ""}</p>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{r.porQue}</p>
      <p className="text-[11px] text-gray-500 mt-1">
        Vende <b className="tabular-nums text-gray-700">{r.unidadesSemana}</b> por semana (las dos sedes)
        {r.gananciaMes !== null && <> · deja <b className="tabular-nums text-gray-700">{soles(r.gananciaMes)}</b> de ganancia al mes</>}
      </p>
      <button type="button" onClick={() => setAbierta(!abierta)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline" aria-expanded={abierta}>
        <ChevronDown className={`w-3 h-3 transition-transform ${abierta ? "rotate-180" : ""}`} /> Ver evolución
      </button>
      {abierta && <Evolucion sedes={r.sedes} />}
    </li>
  );
}
