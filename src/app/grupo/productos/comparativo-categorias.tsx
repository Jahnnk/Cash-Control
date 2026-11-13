"use client";

/**
 * Comparativo por sede y categoría en un periodo de meses elegido (pedido de Jahnn, 13-nov-2026): «¿bajó pastelería desde
 * que trabaja una sola persona, o bajó toda la sede?». Solo lee: usa el mismo historial del buscador de producto y el
 * cálculo de lib/productos/comparativo.ts. Empieza cerrada y carga los datos al abrirse (regla de orden visual).
 */

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { getHistorialProductos } from "@/app/actions/productos-panorama";
import type { HistorialProductos } from "@/lib/productos/historial-producto";
import { FAMILIAS } from "@/lib/productos/panorama";
import { antesDespues, comparativo, productosQueCambian, TODAS, type CeldaMes, type FilaComparativo, type FiltroFamilia, type ProductoCambio } from "@/lib/productos/comparativo";
import { SeccionDesplegable, Segmentado } from "@/components/productos/ui";
import { mesLargo } from "@/lib/productos/texto-tramo";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];
const corto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const unid = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 1, minimumFractionDigits: n < 100 ? 1 : 0 });
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const conSigno = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}`;
const tono = (n: number | null) => (n === null || Math.abs(n) < 3 ? "text-gray-700" : n > 0 ? "text-emerald-700" : "text-red-600");

type Medida = "venta" | "unidades" | "parte";
type Vista = "sedes" | "categorias";
const campo = "rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800";

function valorDe(c: CeldaMes, medida: Medida): string {
  if (c.dias === 0) return "—";
  if (medida === "venta") return soles(c.ventaDia);
  if (medida === "unidades") return unid(c.unidadesDia);
  return c.pctSede === null ? "100%" : pct(c.pctSede);
}

function Lista({ titulo, items }: { titulo: string; items: ProductoCambio[] }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{titulo}</p>
      {items.length === 0 ? <p className="mt-1 text-xs text-gray-400">Ninguno.</p> : (
        <ul className="mt-1 space-y-0.5">
          {items.map((p) => (
            <li key={p.clave} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-gray-700">{p.nombre}</span>
              <span className="shrink-0 tabular-nums text-gray-500">{soles(p.antesDia)} → {soles(p.despuesDia)} <b className={tono(p.cambioDia)}>({conSigno(p.cambioDia)})</b></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Productos({ h, fila, desde, hasta, corte }: { h: HistorialProductos; fila: FilaComparativo; desde: string; hasta: string; corte: string }) {
  const lista = useMemo(() => productosQueCambian(h, fila.sedeId, fila.familia, desde, hasta, corte), [h, fila.sedeId, fila.familia, desde, hasta, corte]);
  const bajan = lista.filter((p) => p.cambioDia < 0).slice(0, 5), suben = lista.filter((p) => p.cambioDia > 0).slice(-5).reverse();
  return (
    <div className="grid grid-cols-1 gap-4 rounded-xl bg-gray-50 p-3 sm:grid-cols-2">
      <Lista titulo="Los que más bajaron · S/ por día" items={bajan} />
      <Lista titulo="Los que más subieron · S/ por día" items={suben} />
    </div>
  );
}

export function ComparativoCategorias({ month }: { month: string }) {
  const [h, setH] = useState<HistorialProductos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("sedes");
  const [familia, setFamilia] = useState<FiltroFamilia>("Postres y pastelería");
  const [sede, setSede] = useState<number>(2);
  const [medida, setMedida] = useState<Medida>("venta");
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [corteElegido, setCorte] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);

  function cargar() {
    if (h) return;
    getHistorialProductos(month, 12).then((r) => { if (r.ok) setH(r.data); else setError(r.error); }).catch(() => setError("No se pudo leer el historial de productos."));
  }

  // Solo los meses en que alguna sede tiene reporte de productos.
  const conDatos = useMemo(() => (h ? h.meses.filter((m) => h.sedes.some((s) => s.meses.some((x) => x.mes === m && x.total > 0))) : []), [h]);
  const desde = rango?.desde ?? conDatos[Math.max(0, conDatos.length - 6)] ?? month;
  const hasta = rango?.hasta ?? conDatos[conDatos.length - 1] ?? month;
  const comp = useMemo(() => (h ? comparativo(h, desde, hasta) : null), [h, desde, hasta]);
  const meses = comp?.meses ?? [];
  const corte = corteElegido && meses.includes(corteElegido) && corteElegido !== meses[0] ? corteElegido : meses[Math.ceil(meses.length / 2)] ?? null;

  const filas = (comp?.filas ?? []).filter((f) => (vista === "sedes" ? f.familia === familia : f.sedeId === sede));
  const totalDe = (sedeId: number) => comp?.filas.find((f) => f.sedeId === sedeId && f.familia === TODAS)?.serie ?? null;
  const etiqueta = (f: FilaComparativo) => (vista === "sedes" ? f.sede : f.familia === TODAS ? "Toda la sede" : f.familia);
  const idFila = (f: FilaComparativo) => `${f.sedeId}|${f.familia}`;
  const hayMarcados = filas.some((f) => f.serie.some((c) => c.dias > 0 && (!c.confiable || c.aMedias)));

  return (
    <SeccionDesplegable
      titulo="Comparar sedes y categorías"
      subtitulo="Elige los meses y mira cómo se movió una categoría en cada sede, o todas las categorías de una sede."
      resumen="Venta por día, unidades por día y parte de la venta, mes a mes. Con antes y después de un mes."
      onAbrir={cargar}
    >
      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : !h || !comp ? <p className="inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo los reportes de productos…</p> : conDatos.length < 2 ? <p className="text-sm text-gray-500">Hace falta tener al menos dos meses con reportes de productos.</p> : (
        <div className="space-y-4">
          {/* ── Qué comparar ── */}
          <div className="flex flex-wrap items-end gap-3">
            <Segmentado tamano="sm" valor={vista} onChange={(v) => { setVista(v); setDetalle(null); }} opciones={[{ valor: "sedes" as Vista, etiqueta: "Una categoría en cada sede" }, { valor: "categorias" as Vista, etiqueta: "Las categorías de una sede" }]} />
            {vista === "sedes" ? (
              <label className="text-xs text-gray-600"><span className="mb-1 block">Categoría</span>
                <select value={familia} onChange={(e) => { setFamilia(e.target.value as FiltroFamilia); setDetalle(null); }} className={campo}>
                  <option value={TODAS}>Toda la venta</option>
                  {FAMILIAS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select></label>
            ) : (
              <label className="text-xs text-gray-600"><span className="mb-1 block">Sede</span>
                <select value={sede} onChange={(e) => { setSede(Number(e.target.value)); setDetalle(null); }} className={campo}>
                  {h.sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select></label>
            )}
            <label className="text-xs text-gray-600"><span className="mb-1 block">Desde</span>
              <select value={desde} onChange={(e) => setRango({ desde: e.target.value, hasta: e.target.value > hasta ? e.target.value : hasta })} className={campo}>
                {conDatos.map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
              </select></label>
            <label className="text-xs text-gray-600"><span className="mb-1 block">Hasta</span>
              <select value={hasta} onChange={(e) => setRango({ desde: e.target.value < desde ? e.target.value : desde, hasta: e.target.value })} className={campo}>
                {conDatos.map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
              </select></label>
            <Segmentado tamano="sm" valor={medida} onChange={setMedida} opciones={[{ valor: "venta" as Medida, etiqueta: "Venta por día" }, { valor: "unidades" as Medida, etiqueta: "Unidades por día" }, { valor: "parte" as Medida, etiqueta: "Parte de la sede" }]} />
          </div>

          {/* ── Mes a mes ── */}
          {filas.length === 0 ? <p className="text-sm text-gray-500">No hay ventas de esa categoría en esos meses.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-3 font-medium">{vista === "sedes" ? "Sede" : "Categoría"}</th>
                    {meses.map((m) => <th key={m} className={`px-2 py-2 text-right font-medium ${corte && m === corte ? "border-l-2 border-primary/40" : ""}`}>{corto(m)}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filas.map((f) => (
                    <tr key={idFila(f)} className={f.familia === TODAS && vista === "categorias" ? "font-semibold" : ""}>
                      <td className="py-2 pr-3 text-gray-800">{etiqueta(f)}</td>
                      {f.serie.map((c) => (
                        <td key={c.mes} className={`px-2 py-2 text-right tabular-nums ${corte && c.mes === corte ? "border-l-2 border-primary/40" : ""} ${c.dias > 0 && (!c.confiable || c.aMedias) ? "text-gray-400" : "text-gray-900"}`} title={c.dias > 0 ? `${mesLargo(c.mes)}: ${soles(c.venta)} · ${Math.round(c.unidades).toLocaleString("es-PE")} u · ${c.dias} días` : "Sin reporte de productos"}>
                          {valorDe(c, medida)}{c.dias > 0 && c.aMedias ? "*" : c.dias > 0 && !c.confiable ? "†" : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {hayMarcados && <p className="mt-1 text-[11px] text-gray-400">* Mes en curso: lleva pocos días. † El reporte de productos no cuadra con la venta de Byte: no entra al antes y después.</p>}
            </div>
          )}

          {/* ── Antes y después ── */}
          {corte && filas.length > 0 && (
            <div>
              <div className="flex flex-wrap items-end gap-3">
                <h4 className="text-sm font-semibold text-gray-900">Antes y después</h4>
                <label className="text-xs text-gray-600"><span className="mr-2">El cambio empezó en</span>
                  <select value={corte} onChange={(e) => setCorte(e.target.value)} className={campo}>
                    {meses.slice(1).map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
                  </select></label>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">Promedio por día de los meses anteriores contra el de {mesLargo(corte)} en adelante. El mes en curso entra solo si su reporte cuadra con Byte.</p>
              <ul className="mt-2 divide-y divide-gray-100">
                {filas.map((f) => {
                  const total = f.familia === TODAS ? null : totalDe(f.sedeId);
                  const ad = antesDespues(f.serie, corte, total);
                  const sedeEntera = total ? antesDespues(total, corte, null) : null;
                  const abierto = detalle === idFila(f);
                  return (
                    <li key={idFila(f)} className="py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-sm font-medium text-gray-900">{etiqueta(f)}</span>
                        {ad.cambioVentaPct === null ? <span className="text-sm text-gray-400">faltan meses para comparar</span> : (
                          <span className="text-sm tabular-nums text-gray-600">
                            {soles(ad.antes.ventaDia)} → {soles(ad.despues.ventaDia)} por día <b className={`ml-1 text-base ${tono(ad.cambioVentaPct)}`}>{conSigno(ad.cambioVentaPct)}%</b>
                          </span>
                        )}
                      </div>
                      {ad.cambioVentaPct !== null && (
                        <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                          Unidades por día: {unid(ad.antes.unidadesDia)} → {unid(ad.despues.unidadesDia)}{ad.cambioUnidadesPct !== null && <> ({conSigno(ad.cambioUnidadesPct)}%)</>}.
                          {sedeEntera?.cambioVentaPct != null && <> Toda la sede: {conSigno(sedeEntera.cambioVentaPct)}%.</>}
                          {ad.antes.pctSede !== null && ad.despues.pctSede !== null && <> Parte de la venta de la sede: {pct(ad.antes.pctSede)} → {pct(ad.despues.pctSede)}.</>}
                          {" "}Compara {ad.antes.meses.length} {ad.antes.meses.length === 1 ? "mes" : "meses"} contra {ad.despues.meses.length}.
                        </p>
                      )}
                      {ad.cambioVentaPct !== null && (
                        <button type="button" onClick={() => setDetalle(abierto ? null : idFila(f))} aria-expanded={abierto} className="mt-1 text-xs font-medium text-primary hover:underline">
                          {abierto ? "Cerrar" : "Ver qué productos cambiaron"}
                        </button>
                      )}
                      {abierto && <div className="mt-2"><Productos h={h} fila={f} desde={desde} hasta={hasta} corte={corte} /></div>}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11px] text-gray-400">Si la categoría baja y su parte de la venta se mantiene, bajó toda la sede. Si baja también su parte, el problema está en la categoría.</p>
            </div>
          )}
        </div>
      )}
    </SeccionDesplegable>
  );
}
