"use client";

/**
 * Presupuesto rediseñado (pedido de Jahnn, 6-oct-2026, capítulo «El presupuesto»): decidir ANTES
 * de gastar cómo se usa la plata. Empresa → sede → área → categoría, con Presupuestado / Real /
 * Variación / % de ejecución, los mayores desvíos y el editor para armar y aprobar el plan del
 * mes. Cálculo: lib/presupuesto.ts · datos: actions/presupuesto.ts.
 *
 * La usan Grupo → Presupuesto (las tres sedes) y el Presupuesto de cada sede (solo la suya).
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getPresupuesto, type DatosPresupuesto } from "@/app/actions/presupuesto";
import {
  armarEmpresa, armarSede, mayoresDesvios, NOMBRE_BLOQUE,
  type FilaArea, type FilaPresupuesto, type FilaSede, type Semaforo,
} from "@/lib/presupuesto";
import { Pastilla, SeccionDesplegable } from "@/components/productos/ui";
import { EditorPresupuesto } from "./editor-presupuesto";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
export const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const fechaCorta = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone: "UTC" });
const mesMas = (mes: string, n: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const TONO: Record<Semaforo, { barra: string; texto: string; nombre: string }> = {
  verde: { barra: "bg-emerald-600", texto: "text-emerald-700", nombre: "Dentro del plan" },
  ambar: { barra: "bg-amber-500", texto: "text-amber-700", nombre: "Ojo" },
  rojo: { barra: "bg-red-600", texto: "text-red-700", nombre: "Pasado" },
  "sin-plan": { barra: "bg-amber-500", texto: "text-amber-700", nombre: "Sin presupuesto" },
  neutro: { barra: "bg-gray-300", texto: "text-gray-500", nombre: "" },
};

// ── Celdas ──────────────────────────────────────────────────────────────
function Ejecucion({ f, avance }: { f: FilaPresupuesto; avance: number | null }) {
  if (f.semaforo === "sin-plan") return <Pastilla tono="ambar">sin presupuesto</Pastilla>;
  if (f.ejecucion === null) return <span className="text-gray-300">—</span>;
  const ancho = Math.min(f.ejecucion, 125) / 1.25;
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="relative h-2 w-12 sm:w-24 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
        <div className={`absolute inset-y-0 left-0 rounded-full ${TONO[f.semaforo].barra}`} style={{ width: `${ancho}%` }} />
        <div className="absolute inset-y-0 w-px bg-gray-500" style={{ left: "80%" }} title="100%" />
        {avance !== null && <div className="absolute -inset-y-0.5 w-0.5 bg-sky-500" style={{ left: `${Math.min(avance, 125) / 1.25}%` }} title="Avance del mes" />}
      </div>
      <span className={`w-11 sm:w-14 text-right tabular-nums text-xs font-medium ${TONO[f.semaforo].texto}`}>{pct(f.ejecucion)}</span>
    </div>
  );
}

/** Mes en curso: cuánto QUEDA del plan (no «de menos»: el mes no terminó). Mes cerrado: de más / de menos. */
function Variacion({ f, enCurso }: { f: FilaPresupuesto; enCurso: boolean }) {
  if (f.variacion === null) return <span className="text-gray-300">—</span>;
  if (Math.abs(f.variacion) < 0.5) return <span className="text-gray-500">S/0</span>;
  if (f.variacion > 0) return <span className="text-red-700 font-medium">+{soles(f.variacion)} de más</span>;
  return enCurso ? <span className="text-gray-600">{soles(f.variacion)}</span> : <span className="text-gray-600">−{soles(f.variacion)} de menos</span>;
}

function Cifras({ f, nivel, nombre, detalle, abierto, onToggle, avance, atenuado = false }: {
  f: FilaPresupuesto; nivel: number; nombre: ReactNode; detalle?: ReactNode; abierto?: boolean; onToggle?: () => void; avance: number | null; atenuado?: boolean;
}) {
  const pesos = ["font-semibold text-gray-900 text-[15px]", "font-semibold text-gray-900", "font-medium text-gray-800", "text-gray-700"];
  return (
    <tr className={`border-t border-gray-100 ${nivel === 0 ? "bg-primary-50/40" : nivel === 1 ? "bg-gray-50/60" : ""} ${atenuado ? "opacity-70" : ""}`}>
      <td className="py-2 pr-3" style={{ paddingLeft: `${0.5 + nivel * 1.1}rem` }}>
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-expanded={abierto} className={`inline-flex items-center gap-1.5 text-left ${pesos[nivel]} hover:text-primary focus-visible:outline-2 focus-visible:outline-primary rounded`}>
            <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${abierto ? "" : "-rotate-90"}`} />
            {nombre}
          </button>
        ) : <span className={`pl-5 inline-block ${pesos[nivel]}`}>{nombre}</span>}
        {detalle && <div className="hidden sm:block text-[11px] text-gray-500 pl-5 leading-tight">{detalle}</div>}
      </td>
      <td className="hidden sm:table-cell py-2 px-3 text-right tabular-nums text-gray-700">{f.presupuestado === null ? "—" : soles(f.presupuestado)}</td>
      <td className="py-2 px-2 sm:px-3 text-right tabular-nums text-gray-900 whitespace-nowrap">
        {soles(f.real)}
        {/* En el celular no hay columna de presupuesto: va debajo de lo real. */}
        {f.presupuestado !== null && <div className="sm:hidden text-[11px] text-gray-500">de {soles(f.presupuestado)}</div>}
      </td>
      <td className="hidden sm:table-cell py-2 px-3 text-right tabular-nums text-xs whitespace-nowrap"><Variacion f={f} enCurso={avance !== null} /></td>
      <td className="py-2 pl-2 sm:pl-3"><Ejecucion f={f} avance={avance} /></td>
    </tr>
  );
}

function FilasAreas({ areas, nivel, clave, abiertos, toggle, avance }: {
  areas: FilaArea[]; nivel: number; clave: string; abiertos: Set<string>; toggle: (k: string) => void; avance: number | null;
}) {
  const visibles = areas.filter((a) => (a.presupuestado ?? 0) > 0 || Math.abs(a.real) > 0.005);
  return (
    <>
      {visibles.map((a, i) => {
        const k = `${clave}/${a.area.id}`;
        const separador = i > 0 && a.area.bloque !== visibles[i - 1].area.bloque;
        return (
          <Fragment key={k}>
            {separador && (
              <tr><td colSpan={5} className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400" style={{ paddingLeft: `${0.5 + nivel * 1.1}rem` }}>
                {a.area.bloque === "fuera" ? "Se muestra, no se presupuesta" : NOMBRE_BLOQUE[a.area.bloque]}
              </td></tr>
            )}
            <Cifras f={a} nivel={nivel} nombre={a.area.nombre} abierto={abiertos.has(k)} onToggle={() => toggle(k)} avance={avance} atenuado={a.area.bloque === "fuera"} />
            {abiertos.has(k) && a.categorias.map((c) => (
              <Cifras key={c.categoria} f={c} nivel={3} nombre={c.categoria.charAt(0) + c.categoria.slice(1).toLowerCase()} avance={avance} atenuado={a.area.bloque === "fuera"}
                detalle={c.modo === "pct" && c.valor !== null ? `${pct(c.valor)} de la venta` : undefined} />
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

function Arbol({ empresa, sedes, avance, sedeFija }: {
  empresa: ReturnType<typeof armarEmpresa>; sedes: FilaSede[]; avance: number | null; sedeFija: boolean;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(sedeFija ? [`s${sedes[0]?.businessId}`] : ["empresa"]));
  const toggle = (k: string) => setAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full sm:min-w-[720px] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-gray-500">
            <th className="text-left font-medium py-2 pl-2"><span className="hidden sm:inline">Empresa → sede → área → categoría</span></th>
            <th className="hidden sm:table-cell text-right font-medium py-2 px-3">Presupuestado</th>
            <th className="text-right font-medium py-2 px-2 sm:px-3">Real</th>
            <th className="hidden sm:table-cell text-right font-medium py-2 px-3">{avance !== null ? "Queda" : "Variación"}</th>
            <th className="text-right font-medium py-2 pl-2 sm:pl-3">Ejecución</th>
          </tr>
        </thead>
        <tbody>
          {!sedeFija && <Cifras f={empresa} nivel={0} nombre="Yayi's (las tres sedes)" abierto={abiertos.has("empresa")} onToggle={() => toggle("empresa")} avance={avance} />}
          {(sedeFija || abiertos.has("empresa")) && sedes.map((s) => {
            const k = `s${s.businessId}`;
            return (
              <Fragment key={k}>
                <Cifras f={s} nivel={sedeFija ? 0 : 1} nombre={s.sede} abierto={abiertos.has(k)} onToggle={() => toggle(k)} avance={avance}
                  detalle={s.ventaBase ? `% sobre la venta ${s.ventaBaseEs === "real" ? "real" : "esperada"} de ${soles(s.ventaBase)}` : undefined} />
                {abiertos.has(k) && <FilasAreas areas={s.areas} nivel={sedeFija ? 1 : 2} clave={k} abiertos={abiertos} toggle={toggle} avance={avance} />}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Una frase en vez de cuatro tarjetas (UX, 8-oct-2026): cuánto del plan se usó, cuánto queda y cuánto
 * del mes pasó. En un mes cerrado, si se gastó de más o de menos.
 */
function ResumenPlan({ total, enCurso, avanceMes, corte }: { total: FilaPresupuesto; enCurso: boolean; avanceMes: number; corte: string | null }) {
  if (total.presupuestado === null) return null;
  const usado = total.ejecucion ?? 0;
  const ancho = Math.min(usado, 125) / 1.25;
  const pasado = (total.variacion ?? 0) > 0;
  return (
    <section className="bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{enCurso ? "Usado del plan" : "Se gastó"}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tabular-nums text-gray-900">{soles(total.real)}</span>
            <span className="text-sm text-gray-500">de {soles(total.presupuestado)} · {pct(usado)}</span>
          </div>
        </div>
        <div className={`text-sm font-medium ${pasado ? "text-red-700" : enCurso ? "text-gray-700" : "text-emerald-700"}`}>
          {pasado ? `${soles(total.variacion!)} por encima del plan` : enCurso ? `Quedan ${soles(-(total.variacion ?? 0))} para el resto del mes` : `${soles(-(total.variacion ?? 0))} por debajo del plan`}
        </div>
      </div>
      <div className="relative mt-4 h-2.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden>
        <div className={`absolute inset-y-0 left-0 rounded-full ${TONO[total.semaforo === "neutro" ? "verde" : total.semaforo].barra}`} style={{ width: `${ancho}%` }} />
        <div className="absolute inset-y-0 w-px bg-gray-500" style={{ left: "80%" }} />
        {enCurso && <div className="absolute -inset-y-0.5 w-0.5 bg-sky-500" style={{ left: `${Math.min(avanceMes, 125) / 1.25}%` }} />}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {enCurso ? `Van ${pct(avanceMes)} del mes (raya celeste). ` : ""}
        {corte ? `Gastos del Excel hasta el ${Number(corte.slice(8, 10))}/${corte.slice(5, 7)}.` : "Todavía no hay gastos cargados."}
      </p>
    </section>
  );
}


// ── La pantalla ─────────────────────────────────────────────────────────
export function PresupuestoVista({ sedeFija = null, mesInicial }: { sedeFija?: number | null; mesInicial?: string }) {
  const [mes, setMes] = useState<string | null>(mesInicial ?? null);
  const [res, setRes] = useState<Awaited<ReturnType<typeof getPresupuesto>> | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);

  const mesActual = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7), []);
  const mesVisto = mes ?? mesActual;
  const cargar = useCallback(async () => setRes(await getPresupuesto(mesVisto, sedeFija)), [mesVisto, sedeFija]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al cambiar de mes */
    cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  const abrirEditor = () => {
    setEditorKey((k) => k + 1);
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Presupuesto</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">
            Decide antes de gastar cuánto va a cada cosa, y compara cada mes lo presupuestado contra lo que de verdad salió.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
          <button type="button" onClick={() => { setRes(null); setMes(mesMas(mesVisto, -1)); }} className="p-1.5 rounded-lg hover:bg-white" aria-label="Mes anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="px-2 text-sm font-medium text-gray-900 min-w-32 text-center capitalize">{nombreMes(mesVisto)}</span>
          <button type="button" onClick={() => { setRes(null); setMes(mesMas(mesVisto, 1)); }} disabled={mesVisto > mesActual} className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </header>

      {!res ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-10"><Loader2 className="w-4 h-4 animate-spin" /> Cargando el presupuesto…</div>
      ) : !res.ok ? (
        <p className="text-sm text-red-700 py-10">{res.error}</p>
      ) : (
        <Contenido datos={res.data} sedeFija={sedeFija !== null} onIrAMes={(m) => { setRes(null); setMes(m); }} onAbrirEditor={abrirEditor}
          editor={
            <div ref={editorRef} className="scroll-mt-4">
              <SeccionDesplegable key={editorKey} abiertaAlInicio={editorKey > 0}
                titulo={`Armar el presupuesto de ${nombreMes(res.data.mes)}`}
                subtitulo="Escribe cuánto va a cada categoría (fijos en soles, variables en % de la venta) o llénalo con lo sugerido. Guárdalo y apruébalo antes de que empiece el mes.">
                <EditorPresupuesto datos={res.data} onGuardado={cargar} />
              </SeccionDesplegable>
            </div>
          } />
      )}
    </div>
  );
}

export function Contenido({ datos, sedeFija, onIrAMes, onAbrirEditor, editor }: {
  datos: DatosPresupuesto; sedeFija: boolean; onIrAMes: (m: string) => void; onAbrirEditor: () => void; editor: ReactNode;
}) {
  const ctx = { enCurso: datos.enCurso, avanceMes: datos.avanceMes };
  const futuro = !datos.enCurso && datos.avanceMes === 0;
  const sedes = useMemo(() => datos.sedes.map((s) => armarSede({
    businessId: s.businessId, sede: s.sede, lineas: s.lineas, ventaEsperada: s.cabecera?.ventaEsperada ?? null, ventaReal: s.ventaReal, real: s.real,
  }, ctx)), [datos]); // eslint-disable-line react-hooks/exhaustive-deps
  const empresa = useMemo(() => armarEmpresa(sedes, ctx), [sedes]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = sedeFija ? sedes[0] : empresa;
  const desvios = useMemo(() => mayoresDesvios(sedes), [sedes]);
  const interno = empresa.areas.find((a) => a.area.id === "produccion")?.categorias.find((c) => c.categoria === "PRODUCTOS ATELIER")?.real ?? 0;
  const avance = datos.enCurso ? datos.avanceMes : null;
  const sinPlan = datos.sedes.filter((s) => !s.lineas.length);
  const sinAprobar = datos.sedes.filter((s) => s.lineas.length && !s.cabecera?.aprobadoEl);
  const diaHoy = Number(datos.hoy.slice(8, 10));
  const proximo = mesMas(datos.mes, 1);

  return (
    <>
      {/* Estado del plan de cada sede: decidir ANTES de gastar. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {datos.sedes.map((s) => (
          <Pastilla key={s.businessId} tono={s.cabecera?.aprobadoEl ? "verde" : s.lineas.length ? "ambar" : "gris"}>
            {s.cabecera?.aprobadoEl ? <CheckCircle2 className="w-3 h-3" /> : null}
            {s.sede} · {s.cabecera?.aprobadoEl ? `aprobado el ${fechaCorta(s.cabecera.aprobadoEl)}` : s.lineas.length ? "borrador sin aprobar" : "sin presupuesto"}
            {s.cabecera?.aprobadoEl && s.cabecera.actualizadoEl > s.cabecera.aprobadoEl ? " (cambiado después)" : ""}
          </Pastilla>
        ))}
      </div>

      {(sinPlan.length > 0 || sinAprobar.length > 0) && !futuro && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {sinPlan.length > 0 && <p><b>{nombreMes(datos.mes)}</b> {datos.enCurso ? "empezó" : "pasó"} sin presupuesto en {sinPlan.map((s) => s.sede).join(", ")}: lo que salió no tiene contra qué compararse.</p>}
            {sinAprobar.length > 0 && <p>Falta aprobar el plan de {sinAprobar.map((s) => s.sede).join(", ")}.</p>}
            <button type="button" onClick={onAbrirEditor} className="mt-1 font-semibold underline underline-offset-2">Armar el presupuesto</button>
          </div>
        </div>
      )}

      {datos.enCurso && diaHoy >= 20 && (
        <button type="button" onClick={() => onIrAMes(proximo)} className="w-full text-left rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm text-primary hover:bg-primary-50">
          Faltan pocos días para <b className="capitalize">{nombreMes(proximo)}</b>: arma y aprueba su presupuesto ahora, antes de que empiece a salir la plata →
        </button>
      )}

      {futuro ? (
        <p className="text-sm text-gray-600">Este mes todavía no empieza: aquí se arma el plan. Lo real aparece cuando entren los gastos.</p>
      ) : (
        <>
          <ResumenPlan total={total} enCurso={datos.enCurso} avanceMes={datos.avanceMes}
            corte={datos.sedes.map((x) => x.corte).filter((x): x is string => !!x).sort()[0] ?? null} />

          <section className="bg-white rounded-2xl border border-gray-200/80 p-3 sm:p-5">
            <Arbol empresa={empresa} sedes={sedes} avance={avance} sedeFija={sedeFija} />
            <details className="mt-3 px-2 text-[11px] text-gray-500 leading-relaxed">
              <summary className="cursor-pointer font-medium text-gray-600 hover:text-gray-900">¿Cómo se calcula?</summary>
              {datos.enCurso
                ? "Mes en curso: los % se calculan sobre la venta esperada. La raya celeste marca cuánto del mes ya pasó; un costo variable que va muy por delante de ella está gastando más rápido de lo planeado."
                : "Mes cerrado: los % se calculan sobre la venta real, así un buen mes de ventas no pinta de rojo los insumos. Hasta 10% de más es «ojo»; más es «pasado»."}
              {" "}Real = lo que salió de la sede (de un gasto compartido, solo su parte).
              {!sedeFija && interno > 0 && <> En el total de la empresa van {soles(interno)} que las cafeterías le pagan a Atelier: esa plata no sale de Yayi&apos;s.</>}
            </details>
          </section>

          {desvios.length > 0 && (
            <section className="bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6">
              <h3 className="text-[15px] font-semibold text-gray-900">Dónde se está yendo la plata fuera del plan</h3>
              <ul className="mt-3 divide-y divide-gray-100">
                {desvios.map((d) => (
                  <li key={`${d.businessId}-${d.categoria}`} className="py-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                    <span className="text-gray-900"><b>{d.categoria.charAt(0) + d.categoria.slice(1).toLowerCase()}</b>{!sedeFija && <> · {d.sede}</>} <span className="text-gray-500">({d.area})</span></span>
                    <span className="text-gray-700">
                      {d.sinPlan
                        ? <>Salieron <b className="text-amber-700">{soles(d.variacion)}</b> sin estar presupuestados: agrégalo al plan o frénalo.</>
                        : <><b className="text-red-700">+{soles(d.variacion)}</b> de más ({pct(d.ejecucion ?? 0)}). {datos.enCurso ? "Revisa antes de seguir comprando." : "Corrige el gasto o ajusta el plan del próximo mes."}</>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {editor}
    </>
  );
}
