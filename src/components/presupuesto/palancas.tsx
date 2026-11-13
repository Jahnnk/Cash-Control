"use client";

/**
 * Palancas del EBITDA (pedido de Jahnn, 13-nov-2026). Perillas a la izquierda, medidores a la derecha. Parte de la
 * realidad (promedio de los últimos meses cerrados). Fase 1: simulador (lib/palancas.ts). Fase 2: la ruta de 90 días y
 * «Convertir en presupuesto», que guarda un BORRADOR del plan del mes (lib/palancas-presupuesto.ts).
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { getBasePalancas, type DatosPalancas } from "@/app/actions/palancas";
import { getPresupuesto, guardarPresupuesto } from "@/app/actions/presupuesto";
import { sugerir } from "@/lib/presupuesto";
import { planDesdePalancas, rutaDe90Dias, type Grupo, type PlanDesdePalancas } from "@/lib/palancas-presupuesto";
import { useToast } from "@/components/toast-provider";
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


const mesMas = (mes: string, n: number) => {
  const i = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};
const mesDeHoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
const bonita = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
const NOMBRE_GRUPO: Record<Grupo, string> = { variable: "Costo variable", planilla: "Planilla", otrosFijos: "Otros fijos", sinMover: "No se mueve (sale del EBITDA)" };

type Vista = { plan: PlanDesdePalancas; aprobado: boolean; habiaPlan: boolean };

/** Fase 2: lo que marcan las palancas se guarda como BORRADOR del presupuesto del mes elegido. Nunca aprueba. */
function Convertir({ sede, sedeNombre, pos, onGuardado }: { sede: number; sedeNombre: string; pos: Pos; onGuardado?: () => void }) {
  const { showToast } = useToast();
  const actual = mesDeHoy();
  const [mes, setMes] = useState(mesMas(actual, 1));
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ver" | "guardar" | null>(null);
  const [guardado, setGuardado] = useState(false);
  // Si se mueve una palanca, la sede o el mes, lo que se veía ya no vale.
  const huella = `${sede}|${mes}|${pos.ventas}|${pos.variablePct}|${pos.planilla}|${pos.otrosFijos}`;
  const [huellaVista, setHuellaVista] = useState<string | null>(null);
  const vigente = huellaVista === huella ? vista : null;

  async function ver() {
    setBusy("ver"); setError(null); setGuardado(false);
    const r = await getPresupuesto(mes, sede);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    const s = r.data.sedes[0];
    if (!s) { setError("No encontré esa sede."); return; }
    const plan = planDesdePalancas(pos, sugerir(s.historial).lineas, { ventaEsperada: s.cabecera?.ventaEsperada ?? null, lineas: s.lineas });
    setVista({ plan, aprobado: !!s.cabecera?.aprobadoEl, habiaPlan: s.lineas.length > 0 });
    setHuellaVista(huella);
  }
  async function guardar() {
    if (!vigente || vigente.aprobado) return;
    setBusy("guardar");
    const r = await guardarPresupuesto({ businessId: sede, mes, ventaEsperada: vigente.plan.ventaEsperada, lineas: vigente.plan.lineas });
    setBusy(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    setGuardado(true);
    showToast(`Borrador de ${nombreMes(mes)} guardado para ${sedeNombre}.`, "success");
    onGuardado?.();
  }
  const total = (g: Grupo, campo: "antes" | "ahora") => (vigente?.plan.cambios ?? []).filter((c) => c.grupo === g).reduce((t, c) => t + (c[campo] ?? 0), 0);

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Convertir en presupuesto</h3>
      <p className="mt-0.5 text-xs text-gray-500">Lo que marcan las palancas pasa a ser el borrador del plan de {sedeNombre}. No se aprueba solo: lo revisas y lo apruebas en «Plan del mes».</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmentado tamano="sm" opciones={[{ valor: actual, etiqueta: nombreMes(actual) }, { valor: mesMas(actual, 1), etiqueta: nombreMes(mesMas(actual, 1)) }]} valor={mes} onChange={setMes} />
        <button type="button" onClick={ver} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50">
          {busy === "ver" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ver cómo quedaría
        </button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {vigente && (
        <div className="mt-3">
          <p className="text-xs text-gray-600">Venta esperada: <b className="tabular-nums text-gray-900">{soles(vigente.plan.ventaEsperada)}</b></p>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-100">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-gray-500"><tr><th className="px-3 py-1.5 text-left font-medium">Categoría</th><th className="px-3 py-1.5 text-right font-medium">{vigente.habiaPlan ? "Plan de hoy" : "Sin plan"}</th><th className="px-3 py-1.5 text-right font-medium">Con las palancas</th></tr></thead>
              <tbody>
                {(["variable", "planilla", "otrosFijos", "sinMover"] as Grupo[]).map((g) => {
                  const filas = vigente.plan.cambios.filter((c) => c.grupo === g);
                  if (filas.length === 0) return null;
                  return [
                    <tr key={g} className="border-t border-gray-100 bg-gray-50/60"><td className="px-3 py-1.5 font-semibold text-gray-800">{NOMBRE_GRUPO[g]}</td><td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-500">{vigente.habiaPlan ? soles(total(g, "antes")) : "—"}</td><td className="px-3 py-1.5 text-right font-semibold tabular-nums text-gray-900">{soles(total(g, "ahora"))}</td></tr>,
                    ...filas.map((c) => (
                      <tr key={c.categoria} className="border-t border-gray-100"><td className="px-3 py-1 pl-5 text-gray-600">{bonita(c.categoria)}</td><td className="px-3 py-1 text-right tabular-nums text-gray-400">{c.antes === null ? "—" : soles(c.antes)}</td><td className="px-3 py-1 text-right tabular-nums text-gray-800">{c.ahora === null ? "se quita" : soles(c.ahora)}</td></tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
          {vigente.plan.sinRepartir > 0 && <p className="mt-2 text-[11px] text-amber-700">No hay historial de gastos fijos para repartir {soles(vigente.plan.sinRepartir)} de «Otros fijos»: agrégalos a mano en «Plan del mes».</p>}
          {vigente.aprobado
            ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">El plan de {nombreMes(mes)} ya está aprobado. Para cambiarlo, primero reábrelo en «Plan del mes».</p>
            : guardado
              ? <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Borrador guardado. Míralo en «Plan del mes», eligiendo {nombreMes(mes)}, y apruébalo cuando estés conforme.</p>
              : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={guardar} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                    {busy === "guardar" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar como borrador de {nombreMes(mes)}
                  </button>
                  {vigente.habiaPlan && <span className="text-[11px] text-amber-700">Reemplaza el borrador que ya existe de ese mes.</span>}
                </div>
              )}
        </div>
      )}
    </div>
  );
}

export function Palancas({ onGuardado }: { onGuardado?: () => void } = {}) {
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
  const ruta = lecturaReal ? rutaDe90Dias(lecturaReal.ebitdaPct, 25) : [];
  const hayCambios = !!movidas[sede];

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden />Palancas del EBITDA</h2>
          <p className="text-sm text-gray-500">Mueve una palanca y mira qué pasa. Nada se guarda hasta que pulses «Guardar como borrador».</p>
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
                {ruta.length > 0 && (
                  <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Ruta de 90 días a 25%</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                      <span className="tabular-nums">Hoy {pct(lecturaReal.ebitdaPct)}</span>
                      {ruta.map((paso, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5">
                          <span aria-hidden>→</span>
                          <button type="button" onClick={() => setMeta(paso)} aria-pressed={meta === paso} className={`rounded-lg border px-2 py-1 tabular-nums ${meta === paso ? "border-primary bg-white font-semibold text-primary" : "border-gray-300 bg-white text-gray-700 hover:border-primary"}`}>
                            {nombreMes(mesMas(mesDeHoy(), i + 1)).split(" ")[0]} {pct(paso)}
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">Toca un escalón para ver qué palanca mover ese mes. La ruta parte del promedio real y se recalcula cuando cierra un mes.</p>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-600">Para llegar a <b className="tabular-nums text-gray-900">{pct(meta)}</b>:</p>
                <Caminos pos={pos} meta={meta} onAplicar={aplicar} />
                <p className="mt-2 text-[11px] text-gray-400">Cada línea mueve una sola palanca y deja las demás quietas. En la práctica se combinan.</p>
              </div>

              <Convertir sede={sede} sedeNombre={actual?.sede ?? ""} pos={pos} onGuardado={onGuardado} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
