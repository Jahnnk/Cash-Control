"use client";

/**
 * Palancas del EBITDA (pedido de Jahnn, 13-nov-2026) · Fase 1: simulador. Perillas a la izquierda, medidores a la
 * derecha. Parte de la realidad (promedio de los últimos meses cerrados) y NO guarda nada. El cálculo vive en
 * lib/palancas.ts.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { getBasePalancas, type DatosPalancas } from "@/app/actions/palancas";
import { paraLlegar, simular, type Camino, type Palancas as Pos } from "@/lib/palancas";
import { ETIQUETA_TERMOMETRO, TOPE_PLANILLA_PCT, type Termometro } from "@/lib/regla-33";
import { nombreMes } from "@/lib/financiamientos";
import { Segmentado } from "@/components/productos/ui";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const conSigno = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}S/ ${Math.abs(Math.round(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("es-PE")}%`;
const TONO: Record<Termometro, string> = { fragil: "text-red-600", en_camino: "text-amber-700", eficiente: "text-emerald-700" };

function Perilla({ titulo, ayuda, valor, real, min, max, paso, formato, onChange }: {
  titulo: string; ayuda: string; valor: number; real: number; min: number; max: number; paso: number;
  formato: (n: number) => string; onChange: (n: number) => void;
}) {
  const movida = Math.abs(valor - real) > paso / 2;
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium text-gray-900">{titulo}</label>
        <b className="text-xl font-semibold tabular-nums text-gray-900">{formato(valor)}</b>
      </div>
      <input type="range" aria-label={titulo} min={min} max={Math.max(max, valor)} step={paso} value={valor} onChange={(e) => onChange(Number(e.target.value))} className="mt-2 w-full accent-[#004C40]" />
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-500">
        <span>{ayuda}</span>
        <span className="shrink-0 tabular-nums">
          Real: {formato(real)}
          {movida && <button type="button" onClick={() => onChange(real)} className="ml-2 font-medium text-primary hover:underline">volver</button>}
        </span>
      </div>
    </div>
  );
}

const NOMBRE_CAMINO: Record<Camino["palanca"], string> = { ventas: "Solo vendiendo más", variable: "Solo bajando el costo variable", fijos: "Solo recortando fijos" };

function Caminos({ pos, meta, onAplicar }: { pos: Pos; meta: number; onAplicar: (c: Camino) => void }) {
  const caminos = paraLlegar(pos, meta);
  if (caminos[0].yaLlego) return <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Con las palancas así ya llegas a {pct(meta)} de EBITDA.</p>;
  return (
    <ul className="mt-2 divide-y divide-gray-100">
      {caminos.map((c) => (
        <li key={c.palanca} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0 text-gray-700">
            {NOMBRE_CAMINO[c.palanca]}
            <span className="block text-[11px] text-gray-500">
              {c.valor === null || c.cambio === null ? "No alcanza con esta sola palanca." : c.palanca === "ventas"
                ? `vender ${soles(c.valor)} al mes (${conSigno(c.cambio)}, ${pct((c.cambio / pos.ventas) * 100)} más)`
                : c.palanca === "variable" ? `llevarlo a ${pct(c.valor)} (${Math.abs(c.cambio).toLocaleString("es-PE")} puntos menos)`
                : `dejarlos en ${soles(c.valor)} (${conSigno(c.cambio)} al mes)`}
            </span>
          </span>
          {c.valor !== null && <button type="button" onClick={() => onAplicar(c)} className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-primary hover:text-primary">Probar</button>}
        </li>
      ))}
    </ul>
  );
}

function Fila({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="text-sm text-gray-600">{etiqueta}{nota && <span className="block text-[11px] text-gray-400">{nota}</span>}</span>
      <b className={`shrink-0 tabular-nums ${tono ?? "text-gray-900"}`}>{valor}</b>
    </li>
  );
}

export function Palancas() {
  const [datos, setDatos] = useState<DatosPalancas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sede, setSede] = useState<number>(2);
  const [movidas, setMovidas] = useState<Record<number, Pos>>({});
  const [meta, setMeta] = useState<number>(25);
  useEffect(() => { void getBasePalancas().then((r) => { if (r.ok) setDatos(r.data); else setError(r.error); }); }, []);

  const actual = datos?.sedes.find((s) => s.businessId === sede) ?? null;
  const base = actual?.base ?? null;
  const pos = movidas[sede] ?? base?.palancas ?? null;
  const lectura = useMemo(() => (pos ? simular(pos) : null), [pos]);
  const lecturaReal = useMemo(() => (base ? simular(base.palancas) : null), [base]);

  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!datos) return <p className="inline-flex items-center gap-2 p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo los últimos meses cerrados…</p>;

  const mover = (cambio: Partial<Pos>) => { if (pos) setMovidas({ ...movidas, [sede]: { ...pos, ...cambio } }); };
  const aplicar = (c: Camino) => {
    if (!pos || c.valor === null) return;
    if (c.palanca === "ventas") mover({ ventas: Math.ceil(c.valor) });
    else if (c.palanca === "variable") mover({ variablePct: c.valor });
    else { // el recorte de fijos se reparte en proporción entre planilla y otros fijos
      const total = pos.planilla + pos.otrosFijos, k = total > 0 ? c.valor / total : 1;
      mover({ planilla: Math.floor(pos.planilla * k), otrosFijos: Math.floor(pos.otrosFijos * k) });
    }
  };
  const metaDestino = Math.round(datos.ebitdaMetaPct * 10) / 10;
  const hayCambios = !!movidas[sede];

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden />Palancas del EBITDA</h2>
          <p className="text-sm text-gray-500">Mueve una palanca y mira qué pasa. Es un simulador: no guarda ni cambia nada.</p>
        </div>
        <Segmentado opciones={datos.sedes.map((s) => ({ valor: s.businessId, etiqueta: s.sede }))} valor={sede} onChange={setSede} />
      </div>

      {!base || !pos || !lectura || !lecturaReal ? <p className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">{actual?.sede ?? "Esta sede"} todavía no tiene un mes cerrado con ventas y Excel completos para partir de la realidad.</p> : (
        <>
          <p className="text-xs text-gray-500">
            Punto de partida: promedio de {base.meses.length === 1 ? nombreMes(base.meses[0]) : `${nombreMes(base.meses[0])} a ${nombreMes(base.meses[base.meses.length - 1])}`} ({base.meses.length} {base.meses.length === 1 ? "mes cerrado" : "meses cerrados"}).
            {sede === 1 && <> Atelier vende a las sedes a precio interno: su meta propia está por definir.</>}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* ── Perillas ── */}
            <div className="space-y-3">
              <Perilla titulo="1. Venta del mes" ayuda="Lo que esperas vender" valor={pos.ventas} real={base.palancas.ventas} min={Math.round(base.palancas.ventas * 0.5 / 100) * 100} max={Math.round(base.palancas.ventas * 2 / 100) * 100} paso={100} formato={soles} onChange={(n) => mover({ ventas: n })} />
              <Perilla titulo="2. Costo variable" ayuda="Insumos, empaques… de cada S/ 100 vendidos" valor={pos.variablePct} real={base.palancas.variablePct} min={15} max={75} paso={0.5} formato={pct} onChange={(n) => mover({ variablePct: n })} />
              <Perilla titulo="3. Planilla" ayuda={`Tope sano: ${TOPE_PLANILLA_PCT}% de la venta`} valor={pos.planilla} real={base.palancas.planilla} min={Math.round(base.palancas.planilla * 0.4 / 50) * 50} max={Math.round(base.palancas.planilla * 1.5 / 50) * 50} paso={50} formato={soles} onChange={(n) => mover({ planilla: n })} />
              <Perilla titulo="4. Otros fijos" ayuda="Alquiler, servicios y el resto de la estructura" valor={pos.otrosFijos} real={base.palancas.otrosFijos} min={Math.round(base.palancas.otrosFijos * 0.4 / 50) * 50} max={Math.round(base.palancas.otrosFijos * 1.5 / 50) * 50} paso={50} formato={soles} onChange={(n) => mover({ otrosFijos: n })} />
              <Perilla titulo="5. Utilidad que apartas primero" ayuda="Profit First: % de la venta" valor={pos.utilidadPct} real={base.palancas.utilidadPct} min={0} max={40} paso={1} formato={pct} onChange={(n) => mover({ utilidadPct: n })} />
              {hayCambios && <button type="button" onClick={() => { const r = { ...movidas }; delete r[sede]; setMovidas(r); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Volver todo a la realidad</button>}
            </div>

            {/* ── Medidores ── */}
            <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <div className="rounded-2xl bg-gray-50 p-4 sm:p-5" aria-live="polite">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-600">EBITDA del mes</div>
                    <div className={`mt-1 text-4xl font-semibold tabular-nums tracking-tight ${TONO[lectura.termometro]}`}>{soles(lectura.ebitda)}</div>
                    {hayCambios && <div className="mt-0.5 text-xs text-gray-500">Hoy: {soles(lecturaReal.ebitda)} · cambio {conSigno(lectura.ebitda - lecturaReal.ebitda)}</div>}
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-semibold tabular-nums ${TONO[lectura.termometro]}`}>{pct(lectura.ebitdaPct)}</div>
                    <div className={`text-xs font-semibold ${TONO[lectura.termometro]}`}>{ETIQUETA_TERMOMETRO[lectura.termometro]}</div>
                    {hayCambios && <div className="text-xs text-gray-500">Hoy: {pct(lecturaReal.ebitdaPct)}</div>}
                  </div>
                </div>
                {/* De cada S/ 100: variables, fijos y lo que queda. */}
                <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-gray-200" role="img" aria-label="De cada S/ 100 vendidos: costos variables, costos fijos y EBITDA">
                  <span style={{ width: `${Math.min(100, pos.variablePct)}%`, background: "#DCA64F" }} />
                  <span style={{ width: `${Math.min(100 - Math.min(100, pos.variablePct), pos.ventas > 0 ? (lectura.fijos / pos.ventas) * 100 : 0)}%`, background: "#5B7FB0" }} />
                  <span style={{ width: `${Math.max(0, lectura.ebitdaPct)}%`, background: "#4A8B72" }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#DCA64F" }} />Variables {pct(pos.variablePct)}</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#5B7FB0" }} />Fijos {pct(pos.ventas > 0 ? (lectura.fijos / pos.ventas) * 100 : 0)}</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#4A8B72" }} />EBITDA {pct(lectura.ebitdaPct)}</span>
                </div>
              </div>

              <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200/80 bg-white px-4">
                <Fila etiqueta="Punto de equilibrio" nota="venta mínima del mes para no perder" valor={lectura.equilibrio === null ? "—" : soles(lectura.equilibrio)} />
                <Fila etiqueta="Piso diario de ventas" nota="(fijos + costo variable) ÷ 30" valor={soles(lectura.pisoDiario)} />
                <Fila etiqueta="Planilla sobre la venta" nota={`tope ${TOPE_PLANILLA_PCT}%`} valor={pct(lectura.planillaPct)} tono={lectura.planillaPasada ? "text-red-600" : undefined} />
                <Fila etiqueta="Utilidad que se aparta" nota={lectura.cabe ? "la operación cabe en lo que queda" : "el EBITDA no alcanza para apartarla"} valor={soles(lectura.utilidad)} tono={lectura.cabe ? undefined : "text-red-600"} />
                <Fila etiqueta="Queda para impuestos, inversión y deudas" nota={`hoy salen en promedio ${soles(base.bolsaComprometida)} al mes por esto`} valor={conSigno(lectura.bolsa)} tono={lectura.bolsa < base.bolsaComprometida ? "text-red-600" : "text-emerald-700"} />
              </ul>

              <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">Llévame a la meta</h3>
                  <Segmentado tamano="sm" opciones={[{ valor: 25, etiqueta: "25% · paso" }, { valor: metaDestino, etiqueta: `${pct(metaDestino)} · destino` }]} valor={meta} onChange={setMeta} />
                </div>
                <Caminos pos={pos} meta={meta} onAplicar={aplicar} />
                <p className="mt-2 text-[11px] text-gray-400">Cada línea mueve una sola palanca y deja las demás quietas. En la práctica se combinan.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
