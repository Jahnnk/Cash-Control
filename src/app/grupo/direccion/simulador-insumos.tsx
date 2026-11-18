"use client";

/**
 * «¿Y si sube un insumo?» (Sistema de Dirección → Precios, paso 3). Mejoras B y C del Excel de pricing
 * (pedido de Jahnn, 18-nov-2026):
 *   · Lo que ya subió: las fotos de precios de compra que se guardan al subir el Excel (insumos_precios).
 *   · Los insumos que más pesan en lo que se vende y un % de alza por insumo.
 *   · El resultado: cuánto más cuesta al mes, qué productos pasan el 35% y a qué precio ganan lo mismo.
 * Solo lectura. Motores: lib/productos/simulador-insumos.ts, desglose-insumos.ts, insumos-precios.ts.
 */

import { useEffect, useMemo, useState } from "react";
import { getHistorialInsumos, getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { esCafeteria } from "@/lib/productos/cafeterias";
import { alzaPorSku, type HistorialPrecios } from "@/lib/productos/insumos-precios";
import { NECESIDAD_ALTA_PCT } from "@/lib/productos/subida-precios";
import { pesoDeInsumos, productosParaSimular, simular, type PesoInsumo, type ProductoSim } from "@/lib/productos/simulador-insumos";
import { ConPaso } from "./con-paso";
import { Pastilla, SeccionDesplegable, fechaCorta, nombreMes } from "@/components/productos/ui";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const VISIBLES = 12;

type Datos = { productos: ProductoSim[]; sinDesglose: number; pesos: PesoInsumo[]; historial: HistorialPrecios };

function LoQueYaSubio({ h, onUsar }: { h: HistorialPrecios; onUsar: () => void }) {
  if (h.fechas.length < 2) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600 leading-relaxed">
        <strong>Historial de precios de compra:</strong> la primera foto es del {h.fechas[0] ? fechaCorta(h.fechas[0]) : "—"}.
        Cada vez que subas el Excel de pricing en Recetas y costos se guarda otra. Desde la segunda verás aquí cuánto subió cada insumo.
      </p>
    );
  }
  const suben = h.cambios.filter((c) => c.cambioPct > 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-900">Lo que ya subió <span className="font-normal text-gray-500">· del {fechaCorta(h.fechas[0])} al {fechaCorta(h.fechas[h.fechas.length - 1])}</span></div>
        {suben.length > 0 && <button type="button" onClick={onUsar} className="text-xs font-medium text-primary hover:underline">Usar estas alzas en el simulador</button>}
      </div>
      {suben.length === 0 ? <p className="text-xs text-gray-500">Ningún insumo subió de precio.</p> : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
          {suben.slice(0, 10).map((c) => (
            <li key={`${c.origen}-${c.sku}`} className="flex justify-between gap-2">
              <span className="text-gray-700 truncate">{c.nombre} <span className="text-[10px] text-gray-400">{c.origen}</span></span>
              <span className="tabular-nums whitespace-nowrap"><span className="text-gray-500">{soles(c.antes)} → {soles(c.ahora)}</span> <strong className="text-red-700">+{pct(c.cambioPct)}</strong></span>
            </li>
          ))}
        </ul>
      )}
      {suben.length > 10 && <p className="text-[11px] text-gray-400">Y {suben.length - 10} más.</p>}
    </div>
  );
}

function Cuerpo({ d }: { d: Datos }) {
  const [alzas, setAlzas] = useState<Record<string, number>>({});
  const [extra, setExtra] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const mapa = useMemo(() => new Map(Object.entries(alzas).filter(([, v]) => v !== 0)), [alzas]);
  const r = useMemo(() => simular(d.productos, mapa), [d.productos, mapa]);
  const lista = [...d.pesos.slice(0, VISIBLES), ...d.pesos.filter((p) => extra.includes(p.clave) && !d.pesos.slice(0, VISIBLES).includes(p))];
  const total = d.pesos.reduce((t, p) => t + p.costoMes, 0);
  const opciones = d.pesos.filter((p) => !lista.includes(p));
  const usarHistorial = () => {
    const porSku = alzaPorSku(d.historial.cambios.filter((c) => c.cambioPct > 0));
    const nuevas: Record<string, number> = {};
    for (const p of d.pesos) if (p.sku && porSku.has(p.sku.toUpperCase())) nuevas[p.clave] = porSku.get(p.sku.toUpperCase())!;
    setAlzas(nuevas);
    setExtra(Object.keys(nuevas));
  };

  return (
    <div className="space-y-5">
      <LoQueYaSubio h={d.historial} onUsar={usarHistorial} />

      <div>
        <h4 className="mb-1 text-sm font-semibold text-gray-900">Los insumos que más pesan en lo que vendes</h4>
        <p className="mb-2 text-[11px] text-gray-500">Lo que se gasta al mes en cada insumo, a través de lo que se vende (costo por unidad × unidades del mes). Escribe cuánto sube cada uno.</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium py-2.5 pl-4 pr-3">Insumo</th>
                <th className="text-right font-medium py-2.5 px-3">Al mes</th>
                <th className="text-right font-medium py-2.5 px-3">Del costo</th>
                <th className="text-right font-medium py-2.5 pl-3 pr-4">Si sube…</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lista.map((p) => (
                <tr key={p.clave}>
                  <td className="py-2 pl-4 pr-3">
                    <div className="text-gray-900 leading-tight">{p.nombre}</div>
                    <div className="text-[10px] text-gray-400">{p.sku ?? "sin código"} · en {p.productos} {p.productos === 1 ? "producto" : "productos"}</div>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-700 whitespace-nowrap">{soles0(p.costoMes)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-700">{pct(p.pct)}</td>
                  <td className="py-2 pl-3 pr-4 text-right whitespace-nowrap">
                    <input
                      type="number" inputMode="decimal" step={5} min={-50} max={300} aria-label={`Alza de ${p.nombre} en %`}
                      value={alzas[p.clave] ?? ""} placeholder="0"
                      onChange={(e) => { const v = Number(e.target.value); setAlzas((a) => ({ ...a, [p.clave]: Number.isFinite(v) ? v : 0 })); }}
                      className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-right tabular-nums text-sm"
                    /> <span className="text-xs text-gray-500">%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            list="insumos-simulador" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Agregar otro insumo…"
            className="w-64 max-w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
          />
          <datalist id="insumos-simulador">{opciones.map((p) => <option key={p.clave} value={p.nombre} />)}</datalist>
          <button
            type="button"
            onClick={() => { const p = opciones.find((x) => x.nombre === busca); if (p) { setExtra((e) => [...e, p.clave]); setBusca(""); } }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300"
          >
            Agregar
          </button>
          {mapa.size > 0 && <button type="button" onClick={() => setAlzas({})} className="text-xs font-medium text-primary hover:underline">Poner todo en 0</button>}
          <span className="text-[11px] text-gray-400">Lo vendido con receta: {soles0(total)} al mes en insumos.</span>
        </div>
      </div>

      {mapa.size === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">Escribe el % de alza de uno o más insumos para ver qué productos se pasan.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Costo extra al mes</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-red-700">+{soles0(r.extraMes)}</div>
              <div className="text-xs text-gray-500">con lo que se vende hoy</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Sube el costo de insumos</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">+{pct(r.subidaCostoPct)}</div>
              <div className="text-xs text-gray-500">de todo lo vendido con receta</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Pasan el {NECESIDAD_ALTA_PCT}%</div>
              <div className={`mt-1 text-xl font-semibold tabular-nums ${r.cruzan > 0 ? "text-amber-700" : "text-emerald-700"}`}>{r.cruzan}</div>
              <div className="text-xs text-gray-500">productos que hoy están bien</div>
            </div>
          </div>
          {r.productos.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm min-w-[680px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    <th className="text-left font-medium py-2.5 pl-4 pr-3">Producto</th>
                    <th className="text-right font-medium py-2.5 px-3">Costo</th>
                    <th className="text-right font-medium py-2.5 px-3">% del precio</th>
                    <th className="text-right font-medium py-2.5 px-3">Extra al mes</th>
                    <th className="text-right font-medium py-2.5 pl-3 pr-4">Precio para ganar lo mismo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {r.productos.slice(0, 25).map((p) => (
                    <tr key={p.nombre}>
                      <td className="py-2 pl-4 pr-3">
                        <div className="text-gray-900 leading-tight">{p.nombre}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {p.cruza && <Pastilla tono="ambar">Pasa el {NECESIDAD_ALTA_PCT}%</Pastilla>}
                          {p.deAtelier && <span className="text-[10px] text-gray-400">lo hace Atelier: lo absorbe Atelier hasta que suba el precio interno</span>}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap"><span className="text-gray-500">{soles(p.costoAntes)}</span> → <span className="font-semibold">{soles(p.costoDespues)}</span></td>
                      <td className={`py-2 px-3 text-right tabular-nums whitespace-nowrap ${p.pctDespues > NECESIDAD_ALTA_PCT ? "text-amber-700 font-medium" : "text-gray-700"}`}>{pct(p.pctAntes)} → {pct(p.pctDespues)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-900 whitespace-nowrap">+{soles0(p.extraMes)}</td>
                      <td className="py-2 pl-3 pr-4 text-right tabular-nums whitespace-nowrap"><span className="text-gray-500">{soles(p.precio)}</span> → <span className="font-semibold">{soles(p.precioParaMantener)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.productos.length > 25 && <p className="text-[11px] text-gray-400">Y {r.productos.length - 25} productos más con un cambio menor.</p>}
        </div>
      )}

      <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
        <p><strong>De dónde sale.</strong> Del Excel de pricing: cada receta dice cuánto de cada insumo lleva una unidad, en soles. Las sub-recetas se abren: si sube el aceite, sube también la mayonesa de la casa y el sánguche que la lleva. Lo que la cafetería le compra a Atelier (el pan del sánguche) cuenta como un insumo más, a su precio interno.</p>
        <p><strong>El costo es el de insumos</strong> (la mirada del Grupo). En lo que hace Atelier, la subida la paga primero Atelier; la cafetería la siente cuando Atelier sube el precio interno. <strong>Precio para ganar lo mismo</strong> = el precio de hoy más lo que subió el costo, redondeado como la carta: así cada unidad deja los mismos soles que hoy.</p>
        <p>{d.sinDesglose > 0 ? `${d.sinDesglose} productos vendidos no tienen receta desglosada en el Excel (reventa, porciones calculadas o recetas que faltan) y no entran. ` : ""}Los precios de compra se guardan cada vez que subes el Excel en Grupo → Recetas y costos.</p>
      </div>
    </div>
  );
}

export function SimuladorInsumos({ month, sede, paso }: { month: string; sede: number; paso?: number }) {
  const [estado, setEstado] = useState<{ clave: string; data: Datos | null; error: string | null } | null>(null);
  const clave = `${month}-${sede}`;

  useEffect(() => {
    if (!esCafeteria(sede)) return;
    let vivo = true;
    Promise.all([getRentabilidadProductos(month, sede), getHistorialInsumos()]).then(([r, h]) => {
      if (!vivo) return;
      if (!r.ok) { setEstado({ clave, data: null, error: r.error }); return; }
      if (!r.data) { setEstado({ clave, data: null, error: null }); return; }
      const { productos, sinDesglose } = productosParaSimular(r.data);
      setEstado({ clave, data: { productos, sinDesglose, pesos: pesoDeInsumos(productos), historial: h.ok ? h.data : { fechas: [], cambios: [] } }, error: null });
    });
    return () => { vivo = false; };
  }, [month, sede, clave]);

  if (!esCafeteria(sede)) return null;
  const listo = estado && estado.clave === clave ? estado : null;
  const d = listo?.data ?? null;

  const resumen = !listo
    ? <p className="text-xs text-gray-400">Calculando…</p>
    : d && d.pesos.length > 0
      ? <p className="text-xs text-gray-600">
          Los que más pesan: {d.pesos.slice(0, 3).map((p, i) => <span key={p.clave}>{i > 0 && " · "}<strong className="text-gray-800">{p.nombre}</strong> ({soles0(p.costoMes)} al mes)</span>)}
          {d.historial.cambios.some((c) => c.cambioPct > 0) && <> · <strong className="text-red-700">{d.historial.cambios.filter((c) => c.cambioPct > 0).length} insumos subieron</strong> desde el {fechaCorta(d.historial.fechas[0])}</>}.
        </p>
      : <p className="text-xs text-gray-500">Sin reporte de rotación de {nombreMes(month)} o sin recetas desglosadas.</p>;

  return (
    <SeccionDesplegable
      titulo={<ConPaso paso={paso}>{"¿Y si sube un insumo?"}</ConPaso>}
      subtitulo="Qué insumos pesan más en lo que vendes, cuáles ya subieron y qué productos se pasan si sube uno."
      resumen={resumen}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !listo ? <p className="text-sm text-gray-400">Calculando…</p>
        : d ? <Cuerpo d={d} />
        : <p className="text-sm text-gray-500">Esta sede no tiene reporte de rotación de {nombreMes(month)}.</p>}
    </SeccionDesplegable>
  );
}
