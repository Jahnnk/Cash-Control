"use client";

/**
 * «Regla 33-33-33» — el EBITDA como termómetro (pedido de Jahnn, 15-oct-2026, de una
 * asesoría con su coach). De cada S/ 100 vendidos: un tercio a costos variables, un
 * tercio a costos fijos y un tercio de EBITDA. Cada sede muestra cómo se reparte su
 * venta de verdad, con marcas en los tercios, y dónde está la diferencia con la meta.
 * Reglas y números: src/lib/regla-33.ts (sale de las seis cifras, nada nuevo que cuadrar).
 */

import { SeccionDesplegable } from "@/components/productos/ui";
import {
  regla33, dondeFalta, ETIQUETA_TERMOMETRO, META_BLOQUE_PCT, TOPE_PLANILLA_PCT, EBITDA_FRAGIL_PCT, EBITDA_EFICIENTE_PCT,
  type FilaRegla, type Termometro,
} from "@/lib/regla-33";
import type { SeisCifras } from "@/app/actions/seis-cifras";

const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const dd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const ESTILO_TERMOMETRO: Record<Termometro, { chip: string; texto: string }> = {
  fragil: { chip: "bg-red-50 text-red-700 ring-red-200", texto: "text-red-700" },
  en_camino: { chip: "bg-amber-50 text-amber-800 ring-amber-200", texto: "text-amber-700" },
  eficiente: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", texto: "text-emerald-700" },
};

/** Lo que se dice debajo de la barra: dónde está la diferencia con el tercio de EBITDA. */
function frase(f: FilaRegla): string {
  const d = dondeFalta(f);
  if (!d || !f.ebitda) return "";
  if (d.llegaAlTercio) return `Llega a su tercio: el EBITDA supera la meta por ${soles(f.ebitda.difMeta)}.`;
  const partes: string[] = [];
  if (d.masCostos >= 1) partes.push(`${soles(d.masCostos)} en costos variables`);
  if (d.masFijos >= 1) partes.push(`${soles(d.masFijos)} en costos fijos`);
  return `Para llegar a su tercio faltan ${soles(f.ebitda.difMeta)}: se pasó ${partes.join(" y ")}.`;
}

function Barra({ f }: { f: FilaRegla }) {
  const c = f.costos!.pct, fi = f.fijos!.pct, e = Math.max(0, f.ebitda!.pct);
  // Si costos + fijos pasan de 100 no queda EBITDA: la barra se escala para que quepan.
  const total = Math.max(100, c + fi);
  const w = (n: number) => `${(n / total) * 100}%`;
  const marca = (n: number) => ({ left: `${(n / total) * 100}%` });
  return (
    <div className="mt-2.5">
      <div
        className="relative flex h-3 overflow-hidden rounded-full bg-gray-100"
        role="img"
        aria-label={`De cada 100 soles vendidos: ${c.toFixed(0)} en costos variables, ${fi.toFixed(0)} en costos fijos y ${f.ebitda!.pct.toFixed(0)} de EBITDA`}
      >
        <div className="h-full bg-amber-400" style={{ width: w(c) }} />
        <div className="h-full bg-slate-400" style={{ width: w(fi) }} />
        <div className="h-full bg-emerald-600" style={{ width: w(e) }} />
      </div>
      {/* Los tercios: dónde terminaría cada bloque si se cumpliera la regla. */}
      <div className="relative mt-0.5 h-2" aria-hidden>
        <span className="absolute top-0 h-2 w-px bg-gray-400" style={marca(META_BLOQUE_PCT)} />
        <span className="absolute top-0 h-2 w-px bg-gray-400" style={marca(META_BLOQUE_PCT * 2)} />
      </div>
    </div>
  );
}

function Punto({ clase, children }: { clase: string; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className={`h-2 w-2 rounded-full ${clase}`} aria-hidden />{children}</span>;
}

function Tarjeta({ f, finDeMes }: { f: FilaRegla; finDeMes: string }) {
  const aMedias = !f.mesCompleto && (f.esGrupo || (f.corte !== null && f.corte < finDeMes));
  const t = f.termometro;
  return (
    <div className={`min-w-0 rounded-xl px-4 py-3.5 ${f.esGrupo ? "bg-gray-50" : "border border-gray-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900">{f.etiqueta}</span>
          {!f.esGrupo && f.corte && aMedias && <span className="text-[10px] text-amber-700">datos hasta el {dd(f.corte)}</span>}
        </div>
        {t && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${ESTILO_TERMOMETRO[t].chip}`}>{ETIQUETA_TERMOMETRO[t]}</span>}
      </div>

      {f.ebitda && f.costos && f.fijos ? (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tabular-nums leading-none ${t ? ESTILO_TERMOMETRO[t].texto : ""}`}>{pct(f.ebitda.pct)}</span>
            <span className="text-xs text-gray-500">de EBITDA · meta {Math.round(META_BLOQUE_PCT)}% · {f.ebitda.monto < 0 ? "−" : ""}{soles(f.ebitda.monto)}</span>
          </div>
          <Barra f={f} />
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 tabular-nums">
            <Punto clase="bg-amber-400">Costos variables {pct(f.costos.pct)}</Punto>
            <Punto clase="bg-slate-400">Costos fijos {pct(f.fijos.pct)}</Punto>
            <Punto clase="bg-emerald-600">EBITDA {pct(f.ebitda.pct)}</Punto>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-gray-600">{frase(f)}</p>
          {f.planilla && (
            <p className={`mt-1 text-[11px] leading-snug ${f.planilla.pasaDelTope ? "text-amber-700" : "text-gray-500"}`}>
              Planilla {pct(f.planilla.pct)} de la venta (tope {TOPE_PLANILLA_PCT}%){f.planilla.pasaDelTope ? `: ${soles(f.planilla.monto - (f.ventas! * TOPE_PLANILLA_PCT) / 100)} sobre el tope.` : "."}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-xs text-gray-400">{f.sinResultadoPorque ?? "Sin datos"}: todavía no hay EBITDA.</p>
      )}
    </div>
  );
}

export function Regla33({ cifras, periodo }: { cifras: SeisCifras | null; periodo: string }) {
  if (!cifras) return null;
  const filas = regla33(cifras);
  const [y, m] = cifras.mes.split("-").map(Number);
  const finDeMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const g = filas.find((x) => x.esGrupo);
  const resumen = g?.ebitda && g.termometro
    ? <p className="text-xs text-gray-600">Grupo: EBITDA <b className={ESTILO_TERMOMETRO[g.termometro].texto}>{pct(g.ebitda.pct)}</b> de la venta · meta {Math.round(META_BLOQUE_PCT)}% · {ETIQUETA_TERMOMETRO[g.termometro].toLowerCase()}</p>
    : <p className="text-xs text-gray-500">Todavía sin EBITDA para {periodo}.</p>;

  return (
    <SeccionDesplegable
      titulo="Regla 33-33-33 · EBITDA"
      subtitulo="De cada S/ 100 que vendes: un tercio a costos variables, un tercio a costos fijos y un tercio de EBITDA."
      resumen={resumen}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filas.map((f) => <Tarjeta key={f.etiqueta} f={f} finDeMes={finDeMes} />)}
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500">
          Las rayitas de la barra marcan cada tercio. El EBITDA es lo que queda de la venta después de los costos variables y los fijos, antes de impuestos:
          un termómetro de qué tan eficiente es la operación. Menos de {EBITDA_FRAGIL_PCT}% es una operación frágil; {EBITDA_EFICIENTE_PCT}% o más, un modelo eficiente.
          Costos variables = lo que sube y baja con la venta; costos fijos = planilla, alquiler y servicios (y lo que aún no se clasificó).
          {" "}Cifras de {periodo.toLowerCase()}, las mismas de «Las seis cifras».
        </p>
      </div>
    </SeccionDesplegable>
  );
}
