"use client";

/**
 * "Candidatos a reemplazo" (Grupo → Productos → El mes). Qué productos de la
 * carta de Fonavi y Centro conviene sacar o revisar, por qué y cuándo. El
 * motor y sus reglas están en lib/productos/candidatos.ts; esta vista las
 * repite en "Cómo decide" para que cada veredicto se pueda auditar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, Link2, Loader2 } from "lucide-react";
import {
  archivarProductos, getCandidatosReemplazo, restaurarProducto, vincularCostoCarta, type CandidatosReemplazo,
} from "@/app/actions/productos-panorama";
import type { Candidato, MotivoArchivo, ProductoEnSede, Veredicto } from "@/lib/productos/candidatos";
import { UMBRAL_CANDIDATO, UMBRAL_OBSERVAR } from "@/lib/productos/candidatos";
import { Barra, Pastilla, PuntoFamilia, Seccion, fechaCorta, nombreMes } from "@/components/productos/ui";
import { useToast } from "@/components/toast-provider";

const VEREDICTOS: Record<Veredicto, { titulo: string; corto: string; tono: "rojo" | "ambar" | "azul" | "gris"; barra: string; ayuda: string }> = {
  sacar: { titulo: "Sacar de carta", corto: "Sacar", tono: "rojo", barra: "#C2412D", ayuda: "Flojo en las dos sedes" },
  preparar: { titulo: "Preparar reemplazo", corto: "Preparar", tono: "ambar", barra: "#C8893B", ayuda: "Flojo en una, en duda en la otra" },
  revisar: { titulo: "Revisar en una sede", corto: "Revisar", tono: "azul", barra: "#3F8DAE", ayuda: "Mal en una, bien en la otra" },
  confirmar: { titulo: "¿Ya salieron?", corto: "Confirmar", tono: "gris", barra: "#8A948F", ayuda: "Dos meses sin ventas" },
  observar: { titulo: "En observación", corto: "Observar", tono: "gris", barra: "#B6BCB8", ayuda: "Flojos, todavía sin decidir" },
};

const ORDEN: Veredicto[] = ["sacar", "preparar", "revisar", "confirmar", "observar"];

const soles = (n: number) => `S/${n.toFixed(2)}`;

/** Qué significa archivar desde cada lista (solo "Sacar de carta" y "¿Ya salieron?" archivan). */
const ARCHIVAR: Partial<Record<Veredicto, { motivo: MotivoArchivo; boton: string; confirmar: (n: number) => string }>> = {
  confirmar: {
    motivo: "ya-no-se-vende", boton: "Ya no se vende · Archivar",
    confirmar: (n) => `¿Archivar ${n === 1 ? "este producto" : `los ${n} productos`} de «¿Ya salieron?»? Dejan de aparecer; si alguno vuelve a venderse, reaparece solo.`,
  },
  sacar: {
    motivo: "sacado-de-carta", boton: "Ya lo saqué de carta · Archivar",
    confirmar: (n) => `¿Archivar ${n === 1 ? "este producto" : `los ${n} productos`} de «Sacar de carta» porque ya salieron de la carta? Si alguno vuelve a venderse, reaparece solo.`,
  },
};

const MOTIVO_TEXTO: Record<MotivoArchivo, string> = { "ya-no-se-vende": "ya no se vende", "sacado-de-carta": "sacado de carta" };

export function CandidatosReemplazo({ month }: { month: string }) {
  const [data, setData] = useState<CandidatosReemplazo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Veredicto>("sacar");
  const [archivando, setArchivando] = useState<string | null>(null);
  const { showToast } = useToast();

  const cargar = useCallback(async () => {
    const r = await getCandidatosReemplazo(month);
    if (r.ok) setData(r.data); else setError(r.error);
  }, [month]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar/cambiar mes */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  const conteo = useMemo(() => {
    const c: Record<Veredicto, number> = { sacar: 0, preparar: 0, revisar: 0, confirmar: 0, observar: 0 };
    for (const x of data?.candidatos ?? []) c[x.veredicto]++;
    return c;
  }, [data]);

  const lista = (data?.candidatos ?? []).filter((c) => c.veredicto === filtro);
  const accion = ARCHIVAR[filtro];

  async function archivar(cs: Candidato[], clave: string) {
    if (!accion || cs.length === 0) return;
    if (cs.length > 1 && !window.confirm(accion.confirmar(cs.length))) return;
    setArchivando(clave);
    const r = await archivarProductos(cs.map((c) => ({ nombre: c.nombre, motivo: accion.motivo })));
    setArchivando(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(r.archivados === 1 ? `«${cs[0].nombre}» archivado.` : `${r.archivados} productos archivados.`, "success");
    void cargar();
  }

  async function restaurar(clave: string, nombre: string) {
    setArchivando(clave);
    const r = await restaurarProducto(clave);
    setArchivando(null);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast(`«${nombre}» vuelve a evaluarse.`, "success");
    void cargar();
  }

  // "(hasta el 19 set)" si las dos sedes llegan al mismo día; si no, cada una.
  const cortes = (data?.hasta ?? []).filter((h) => h.hasta);
  const hastaTexto = cortes.length === 0 ? ""
    : new Set(cortes.map((h) => h.hasta)).size === 1 ? ` (hasta el ${fechaCorta(cortes[0].hasta!)})`
    : ` (hasta el ${cortes.map((h) => `${fechaCorta(h.hasta!)} en ${h.sede}`).join(" y ")})`;
  const periodo = data && data.meses.length > 0
    ? `${nombreMes(data.meses[0], true)}–${nombreMes(data.meses[data.meses.length - 1], true)}${hastaTexto}`
    : "";

  return (
    <Seccion
      titulo="Candidatos a reemplazo"
      subtitulo={
        data
          ? <>Fonavi y Centro juntas · decide con {periodo} · costos del Excel de pricing para el {data.coberturaCosto}% de lo vendido
            {data.semanas > 1 ? ` · ${data.semanas} semanas guardadas` : " · las semanas se ven desde las próximas cargas del sábado"}</>
          : "Qué productos de la carta conviene sacar o revisar, por qué y cuándo."
      }
    >
      {error ? (
        <p className="text-sm text-gray-500">{error}</p>
      ) : !data ? (
        <div className="flex justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            {ORDEN.map((v) => {
              const meta = VEREDICTOS[v];
              const activo = filtro === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFiltro(v)}
                  aria-pressed={activo}
                  className={`text-left rounded-xl border px-3.5 py-3 transition-colors ${
                    activo ? "border-primary bg-primary-50/60 ring-1 ring-primary/30" : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta.barra }} />
                    <span className="text-xs font-medium text-gray-700">{meta.titulo}</span>
                  </div>
                  <div className="text-2xl font-semibold text-gray-900 tabular-nums mt-1 leading-none">{conteo[v]}</div>
                  <div className="text-[11px] text-gray-500 mt-1">{meta.ayuda}</div>
                </button>
              );
            })}
          </div>

          {accion && lista.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3.5 py-2.5">
              <p className="text-xs text-gray-600">
                ¿Ya revisaste {filtro === "confirmar" ? "que ninguno se vende" : "que salieron de la carta"}? Archívalos todos de una vez.
              </p>
              <button type="button" disabled={archivando !== null} onClick={() => void archivar(lista, "__todos")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg disabled:opacity-50">
                {archivando === "__todos" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                Archivar los {lista.length}
              </button>
            </div>
          )}

          {lista.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">Ningún producto en «{VEREDICTOS[filtro].titulo}».</p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {lista.map((c) => (
                <Tarjeta
                  key={c.clave} c={c} carta={data.carta} onVinculado={cargar}
                  archivar={accion ? { texto: accion.boton, ocupado: archivando === c.clave, bloqueado: archivando !== null, onClick: () => void archivar([c], c.clave) } : null}
                />
              ))}
            </div>
          )}

          {data.archivados.length > 0 && <Archivados items={data.archivados} ocupado={archivando} onRestaurar={restaurar} />}
          <ComoDecide />
          {data.sinCosto.length > 0 && <SinCosto items={data.sinCosto} carta={data.carta} onVinculado={cargar} />}
        </div>
      )}
    </Seccion>
  );
}

function Tarjeta({ c, carta, onVinculado, archivar }: {
  c: Candidato;
  carta: CandidatosReemplazo["carta"];
  onVinculado: () => void;
  archivar: { texto: string; ocupado: boolean; bloqueado: boolean; onClick: () => void } | null;
}) {
  const meta = VEREDICTOS[c.veredicto];
  const sinCosto = c.sedes.every((s) => s.costo === null);
  return (
    <article className="rounded-2xl border border-gray-200/80 bg-white p-4 space-y-3 min-w-0">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 flex items-start gap-2 leading-snug">
            <span className="mt-1.5"><PuntoFamilia familia={c.familia} /></span>
            <span className="break-words">{c.nombre}</span>
          </h4>
          <p className="text-[11px] text-gray-500 mt-0.5 pl-[18px]">{c.familia}</p>
        </div>
        <Pastilla tono={meta.tono}>{meta.corto}</Pastilla>
      </header>

      <div className="flex items-center gap-3">
        <div className="flex-1"><Barra pct={c.puntos} color={meta.barra} alto="h-2" /></div>
        <span className="text-xs tabular-nums text-gray-600 whitespace-nowrap">Riesgo {c.puntos}/100</span>
      </div>

      {c.volvioAVenderse && (
        <p className="text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">
          Volvió a venderse: lo habías archivado el {fechaCorta(c.volvioAVenderse.archivadoEl)} ({MOTIVO_TEXTO[c.volvioAVenderse.motivo]}).
        </p>
      )}

      <p className="text-[13px] text-gray-700 leading-relaxed">{c.razon}</p>

      <div className={`grid gap-2.5 ${c.sedes.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {c.sedes.map((s) => <Sede key={s.businessId} s={s} />)}
      </div>

      <footer className="pt-2 border-t border-gray-100 space-y-1.5 text-xs">
        <div className="text-gray-800"><span className="font-medium">Cuándo:</span> {c.cuando}</div>
        {c.referencia && (c.veredicto === "sacar" || c.veredicto === "preparar") && (
          <div className="text-gray-500">
            En su familia manda <span className="text-gray-700 font-medium">{c.referencia.nombre}</span>
            {c.referencia.gananciaDia !== null ? `: gana ${soles(c.referencia.gananciaDia)} al día` : `: vende ${soles(c.referencia.ventaDia)} al día`}.
          </div>
        )}
        {sinCosto && <Vincular nombre={c.nombre} carta={carta} onVinculado={onVinculado} />}
        {archivar && (
          <div className="pt-1">
            <button type="button" onClick={archivar.onClick} disabled={archivar.bloqueado}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-50">
              {archivar.ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
              {archivar.texto}
            </button>
          </div>
        )}
      </footer>
    </article>
  );
}

const ESTADO_SEDE: Record<ProductoEnSede["estado"], { texto: string; tono: "rojo" | "ambar" | "verde" | "gris" }> = {
  candidato: { texto: "flojo", tono: "rojo" },
  observar: { texto: "en duda", tono: "ambar" },
  bien: { texto: "va bien", tono: "verde" },
  nuevo: { texto: "nuevo", tono: "gris" },
  "dejo-de-venderse": { texto: "sin ventas", tono: "gris" },
  acompanamiento: { texto: "acompañamiento", tono: "gris" },
};

function Sede({ s }: { s: ProductoEnSede }) {
  const e = ESTADO_SEDE[s.estado];
  return (
    <div className="rounded-xl bg-gray-50/80 px-3 py-2.5 space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-800">{s.sede}</span>
        <div className="flex items-center gap-1.5">
          {s.variacion !== null && (
            <span className={`text-[11px] tabular-nums ${s.variacion <= -20 ? "text-red-700" : s.variacion >= 20 ? "text-emerald-700" : "text-gray-500"}`}>
              {s.variacion > 0 ? "+" : ""}{s.variacion}%
            </span>
          )}
          <Pastilla tono={e.tono}>{e.texto}</Pastilla>
        </div>
      </div>
      <Curva puntos={s.porMes.map((m) => ({ etiqueta: nombreMes(m.month, true), valor: m.ventaDia, detalle: `${m.unidades} und · ${soles(m.ingresos)}` }))} />
      {s.porSemana.length >= 3 && <Semanas semanas={s.porSemana} />}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Dato t="Vende al día" v={soles(s.ventaDia)} />
        <Dato t="Por semana" v={`${s.unidadesSemana} und`} />
        <Dato t="Margen" v={s.margenPct !== null ? `${s.margenPct}% · ${soles(s.margenUnidad!)}/und` : "sin costo"} />
        <Dato t="Gana al día" v={s.gananciaDia !== null ? soles(s.gananciaDia) : "—"} />
      </dl>
    </div>
  );
}

function Dato({ t, v }: { t: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-gray-500">{t}</dt>
      <dd className="text-gray-900 font-medium tabular-nums truncate">{v}</dd>
    </div>
  );
}

/**
 * Venta por día de cada mes: línea de 2px con área suave, el último mes
 * marcado. Pasando el mouse por un punto se ve el mes y sus números.
 */
function Curva({ puntos }: { puntos: { etiqueta: string; valor: number; detalle: string }[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  if (puntos.length === 0) return null;
  const W = 240, H = 44, pad = 4;
  const max = Math.max(...puntos.map((p) => p.valor), 0.01);
  const x = (i: number) => (puntos.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (puntos.length - 1));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const linea = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(puntos.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const ult = puntos.length - 1;
  const mostrar = activo ?? ult;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px] text-gray-500 mb-0.5">
        <span>Venta por día</span>
        <span className="tabular-nums text-gray-700">{puntos[mostrar].etiqueta}: {soles(puntos[mostrar].valor)} · {puntos[mostrar].detalle}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-11" role="img" aria-label={puntos.map((p) => `${p.etiqueta} ${soles(p.valor)}`).join(", ")} onMouseLeave={() => setActivo(null)}>
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="#E5E7EB" strokeWidth="1" />
        <path d={area} fill="#098B5F" fillOpacity="0.1" />
        <path d={linea} fill="none" stroke="#098B5F" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {activo !== null && <line x1={x(activo)} x2={x(activo)} y1={pad} y2={H - pad} stroke="#9CA3AF" strokeWidth="1" strokeDasharray="2 2" />}
        <circle cx={x(mostrar)} cy={y(puntos[mostrar].valor)} r="3.5" fill="#004C40" stroke="white" strokeWidth="1.5" />
        {puntos.map((p, i) => (
          <rect key={i} x={x(i) - (W / puntos.length) / 2} y={0} width={W / puntos.length} height={H} fill="transparent" onMouseEnter={() => setActivo(i)} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{puntos[0].etiqueta}</span><span>{puntos[ult].etiqueta}</span>
      </div>
    </div>
  );
}

/** Unidades por semana (normalizadas a 7 días: la primera "semana" del mes puede ser más larga). */
function Semanas({ semanas }: { semanas: ProductoEnSede["porSemana"] }) {
  const datos = semanas.map((s) => {
    const dias = Math.max(1, Math.round((Date.parse(`${s.hasta}T12:00:00Z`) - Date.parse(`${s.desde}T12:00:00Z`)) / 86_400_000) + 1);
    return { ...s, porSemana: Math.round((s.unidades / dias) * 7 * 10) / 10 };
  });
  const max = Math.max(...datos.map((d) => d.porSemana), 1);
  return (
    <div>
      <div className="text-[10px] text-gray-500 mb-1">Unidades por semana</div>
      <div className="flex items-end gap-1 h-8">
        {datos.map((d) => (
          <div key={d.desde} className="flex-1 flex flex-col justify-end h-full" title={`${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}: ${d.unidades} und (${d.porSemana} por semana)`}>
            <div className="rounded-t-[4px] bg-primary-light/70" style={{ height: `${Math.max(4, (d.porSemana / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Vincular({ nombre, carta, onVinculado }: { nombre: string; carta: CandidatosReemplazo["carta"]; onVinculado: () => void }) {
  const { showToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  async function elegir(ref: string) {
    if (!ref) return;
    setGuardando(true);
    const r = await vincularCostoCarta(nombre, ref);
    setGuardando(false);
    if (!r.ok) { showToast(r.error, "error"); return; }
    showToast("Costo vinculado.", "success");
    onVinculado();
  }
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
        <Link2 className="w-3.5 h-3.5" /> Sin costo del Excel: vincularlo
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <select defaultValue="" disabled={guardando} onChange={(e) => void elegir(e.target.value)}
        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white">
        <option value="" disabled>¿Qué producto del Excel es «{nombre}»?</option>
        {carta.map((c) => <option key={c.ref} value={c.ref}>{c.nombre} · costo {soles(c.costo)}{c.precio ? ` · carta ${soles(c.precio)}` : ""}</option>)}
      </select>
      {guardando && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  );
}

function SinCosto({ items, carta, onVinculado }: { items: CandidatosReemplazo["sinCosto"]; carta: CandidatosReemplazo["carta"]; onVinculado: () => void }) {
  return (
    <details className="group rounded-xl border border-gray-200 px-4 py-3">
      <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-gray-800">
        Productos sin costo ({items.length}): su rentabilidad no se mide
        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
      </summary>
      <p className="text-xs text-gray-500 mt-2">
        El sistema enlaza solo los nombres de Byte con tu Excel. Estos no los reconoció: vincúlalos una vez y queda guardado.
      </p>
      <ul className="mt-3 space-y-2.5">
        {items.map((i) => (
          <li key={i.nombre} className="text-xs space-y-1">
            <div className="flex justify-between gap-3"><span className="text-gray-800">{i.nombre}</span><span className="tabular-nums text-gray-500 whitespace-nowrap">{soles(i.ventaDia)} al día</span></div>
            <Vincular nombre={i.nombre} carta={carta} onVinculado={onVinculado} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function Archivados({ items, ocupado, onRestaurar }: {
  items: CandidatosReemplazo["archivados"];
  ocupado: string | null;
  onRestaurar: (clave: string, nombre: string) => void;
}) {
  const volvieron = items.filter((i) => i.volvio).length;
  return (
    <details className="group rounded-xl border border-gray-200 px-4 py-3">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-medium text-gray-800">
        <span>
          Archivados ({items.length})
          {volvieron > 0 && <span className="ml-2 text-xs font-normal text-sky-700">{volvieron} volvió a venderse</span>}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
      </summary>
      <p className="text-xs text-gray-500 mt-2">
        No aparecen en los candidatos. Si alguno vuelve a venderse en un mes posterior, reaparece solo; también puedes restaurarlo a mano.
      </p>
      <ul className="mt-3 divide-y divide-gray-100">
        {items.map((i) => (
          <li key={i.clave} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="text-gray-800">{i.nombre}</div>
              <div className="text-gray-500">
                {MOTIVO_TEXTO[i.motivo]} · {fechaCorta(i.archivadoEl)}{i.archivadoPor ? ` · ${i.archivadoPor === "kelly" ? "Kelly" : "Jahnn"}` : ""}
                {i.volvio && <span className="text-sky-700"> · volvió a venderse</span>}
              </div>
            </div>
            <button type="button" onClick={() => onRestaurar(i.clave, i.nombre)} disabled={ocupado !== null}
              className="inline-flex items-center gap-1 text-primary font-medium hover:underline disabled:opacity-50">
              {ocupado === i.clave ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5" />} Restaurar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ComoDecide() {
  return (
    <details className="group rounded-xl border border-gray-200 px-4 py-3">
      <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-gray-800">
        Cómo decide
        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" />
      </summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2 text-xs text-gray-600 leading-relaxed">
        <div>
          <div className="font-medium text-gray-800 mb-1">Puntos de riesgo en cada sede (últimos 3 meses, por día)</div>
          <ul className="space-y-1 list-disc pl-4">
            <li><b>Vende poco:</b> está en el 20% de la carta que menos factura y vende menos de la mitad que el producto típico (35 pts; hasta el 35%, 20 pts).</li>
            <li><b>Gana poco:</b> unidades × (precio − costo) al día en el 20% más bajo y menos de la mitad de lo típico (25 pts; hasta el 35%, 12). Si pierde plata en cada venta, 30.</li>
            <li><b>Viene cayendo:</b> el último mes vendió 40% menos por día que los dos anteriores (25 pts; 20% menos, 15). Solo si vendía 6 o más al mes.</li>
            <li><b>Rota lento:</b> menos de 3 unidades por semana (15 pts; menos de 7, 8).</li>
          </ul>
          <p className="mt-2">{UMBRAL_CANDIDATO} puntos o más = flojo en esa sede; de {UMBRAL_OBSERVAR} a {UMBRAL_CANDIDATO - 1} = en duda.</p>
        </div>
        <div>
          <div className="font-medium text-gray-800 mb-1">Las dos sedes deciden juntas</div>
          <ul className="space-y-1 list-disc pl-4">
            <li><b>Sacar de carta:</b> flojo en las dos (o en la única que lo vende). En el próximo cambio de carta.</li>
            <li><b>Preparar reemplazo:</b> flojo en una y en duda en la otra. Decidir en 4 semanas.</li>
            <li><b>Revisar en una sede:</b> flojo en una y bien en la otra: el problema es de esa sede (precio, vitrina, cómo se ofrece).</li>
            <li><b>¿Ya salieron?:</b> dos meses sin ventas y antes sí.</li>
          </ul>
          <p className="mt-2">No se juzgan los productos nuevos (menos de 2 meses) ni los acompañamientos (huevos, humitas, porciones).</p>
        </div>
      </div>
    </details>
  );
}
