"use client";

/**
 * «Prueba de precios» (Grupo → Sistema de Dirección → Precios; antes en Productos), fase 2 de «¿Qué precios subir?» (17-nov-2026).
 * Arriba, el resultado: las subidas que el sistema detectó solo en las cargas semanales de Byte, medidas
 * contra la otra sede. Abajo, el plan para hacer la prueba: en qué sede subir, qué productos y cómo.
 * Nada que registrar ni guardar. Motor: lib/productos/prueba-precios.ts.
 */

import { useEffect, useState } from "react";
import { getPruebaPrecios, getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { esCafeteria } from "@/lib/productos/cafeterias";
import { SEMANAS_IDEALES, SEMANAS_MINIMAS, SUBIDA_MINIMA, type FilaPrueba, type ResultadoPrueba, type Sensibilidad, type VeredictoPrueba } from "@/lib/productos/prueba-precios";
import { subidaDePrecios, type FilaSubida } from "@/lib/productos/subida-precios";
import { ConPaso } from "./con-paso";
import { Pastilla, SeccionDesplegable, fechaCorta } from "@/components/productos/ui";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const soles0 = (n: number) => `${n < 0 ? "−" : "+"}S/ ${Math.abs(Math.round(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

const VEREDICTO: Record<VeredictoPrueba, { texto: string; tono: "verde" | "rojo" | "gris" }> = {
  funciona: { texto: "Funciona", tono: "verde" },
  "no-funciona": { texto: "No funciona", tono: "rojo" },
  midiendo: { texto: "Midiendo", tono: "gris" },
};
const SENSIBILIDAD: Record<Sensibilidad, string> = {
  poca: "poco sensible al precio",
  media: "algo sensible al precio",
  alta: "muy sensible al precio",
};

function Resultados({ filas }: { filas: FilaPrueba[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm min-w-[780px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="text-left font-medium py-2.5 pl-4 pr-3">Producto</th>
            <th className="text-right font-medium py-2.5 px-3">Precio</th>
            <th className="text-right font-medium py-2.5 px-3">Venta en la sede</th>
            <th className="text-right font-medium py-2.5 px-3">Control</th>
            <th className="text-right font-medium py-2.5 px-3">Efecto del precio</th>
            <th className="text-right font-medium py-2.5 pl-3 pr-4">Al mes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filas.map((f) => (
            <tr key={`${f.sedeId}-${f.nombre}`}>
              <td className="py-2.5 pl-4 pr-3 align-top">
                <div className="text-gray-900 leading-tight">{f.nombre}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Pastilla tono={VEREDICTO[f.veredicto].tono}>{VEREDICTO[f.veredicto].texto}</Pastilla>
                  <span className="text-[10px] text-gray-400">{f.sede} · desde el {fechaCorta(f.desde)} · {f.semanasDespues} de {SEMANAS_IDEALES} semanas</span>
                </div>
                {f.veredicto !== "midiendo" && <p className="mt-1 text-[11px] text-gray-500">{SENSIBILIDAD[f.sensibilidad]} (por cada 10% que sube, vende {Math.abs(f.elasticidad * 10).toLocaleString("es-PE", { maximumFractionDigits: 1 })}% menos)</p>}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap">
                <span className="text-gray-500">{soles(f.precioAntes)}</span> → <span className="font-semibold text-gray-900">{soles(f.precioDespues)}</span>
                <div className="text-[10px] text-gray-400">{pct(f.subidaPct)}</div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap">
                {pct(f.cambioPct)}
                <div className="text-[10px] text-gray-400">{f.ritmoAntes.toLocaleString("es-PE", { maximumFractionDigits: 1 })} → {f.ritmoDespues.toLocaleString("es-PE", { maximumFractionDigits: 1 })} u/día</div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap text-gray-700">
                {pct(f.cambioControlPct)}
                <div className="text-[10px] text-gray-400">{f.control === "otra-sede" ? "otra sede" : "resto de la carta"}</div>
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums align-top whitespace-nowrap">
                <span className={`font-semibold ${f.veredicto === "no-funciona" ? "text-red-700" : "text-gray-900"}`}>{pct(f.efectoPct)}</span>
                <div className="text-[10px] text-gray-400">aguantaba {f.quiebrePct !== null ? `−${f.quiebrePct.toLocaleString("es-PE")}%` : `−${f.subidaPct.toLocaleString("es-PE")}%`}</div>
              </td>
              <td className={`py-2.5 pl-3 pr-4 text-right tabular-nums align-top whitespace-nowrap font-semibold ${f.extraMes !== null && f.extraMes < 0 ? "text-red-700" : "text-gray-900"}`}>
                {f.extraMes !== null ? soles0(f.extraMes) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Plan = { sede: string; control: string; productos: FilaSubida[]; unidades: number } | null;

function PlanPrueba({ plan }: { plan: Plan }) {
  if (!plan) return <p className="text-sm text-gray-500">Para armar el plan hacen falta los reportes de rotación de las dos sedes en este mes.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">
        <strong>Sube en {plan.sede}</strong> y deja <strong>{plan.control}</strong> igual. {plan.sede} vende más de estos productos, así que la prueba se mide más rápido.
      </p>
      {plan.productos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium py-2 pl-4 pr-3">Producto (los «Subir» de {plan.sede})</th>
                <th className="text-right font-medium py-2 px-3">Precio hoy → prueba</th>
                <th className="text-right font-medium py-2 pl-3 pr-4">Aguanta perder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plan.productos.map((f) => (
                <tr key={f.nombre}>
                  <td className="py-2 pl-4 pr-3 text-gray-900">{f.nombre}</td>
                  <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap"><span className="text-gray-500">{soles(f.precio)}</span> → <span className="font-semibold">{f.precioNuevo !== null ? soles(f.precioNuevo) : "—"}</span></td>
                  <td className="py-2 pl-3 pr-4 text-right tabular-nums text-gray-700">{f.quiebrePct !== null ? `${f.quiebrePct.toLocaleString("es-PE")}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ol className="list-decimal pl-5 space-y-1 text-[13px] text-gray-700">
        <li>Cambia el precio en Byte y en la carta de {plan.sede} el mismo día. {plan.control} no cambia nada: es la comparación.</li>
        <li>Sube solo los productos de la lista, al precio de la lista.</li>
        <li>No hagas promociones de esos productos durante la prueba, en ninguna de las dos sedes.</li>
        <li>Las dos sedes suben el reporte de rotación de Byte cada sábado. Sin el reporte semanal no se puede medir.</li>
        <li>Espera {SEMANAS_IDEALES} semanas. El sistema detecta la subida solo; no hay que registrar nada.</li>
        <li>Después: lo que «Funciona» se sube también en {plan.control}; lo que «No funciona» vuelve a su precio o sube menos.</li>
      </ol>
    </div>
  );
}

function armarPlan(r2: Awaited<ReturnType<typeof getRentabilidadProductos>>, r3: Awaited<ReturnType<typeof getRentabilidadProductos>>): Plan {
  const sedes = [r2, r3].map((r) => (r.ok && r.data ? subidaDePrecios(r.data) : null));
  if (!sedes[0] || !sedes[1]) return null;
  const opciones = sedes.map((s) => {
    const productos = s!.filas.filter((f) => f.veredicto === "subir");
    return { sede: s!.sede, productos, unidades: productos.reduce((t, f) => t + f.unidades, 0) };
  });
  const [mejor, otra] = opciones[0].unidades >= opciones[1].unidades ? [opciones[0], opciones[1]] : [opciones[1], opciones[0]];
  return { ...mejor, control: otra.sede };
}

export function PruebaPrecios({ month, sede, paso }: { month: string; sede: number; /** Número del paso dentro de Sistema de Dirección → Precios. */ paso?: number }) {
  const [estado, setEstado] = useState<{ clave: string; data: ResultadoPrueba | null; plan: Plan; error: string | null } | null>(null);
  const clave = month;

  useEffect(() => {
    if (!esCafeteria(sede)) return;
    let vivo = true;
    Promise.all([getPruebaPrecios(month), getRentabilidadProductos(month, 2), getRentabilidadProductos(month, 3)]).then(([p, r2, r3]) => {
      if (!vivo) return;
      setEstado(p.ok ? { clave, data: p.data, plan: armarPlan(r2, r3), error: null } : { clave, data: null, plan: null, error: p.error });
    });
    return () => { vivo = false; };
  }, [month, sede, clave]);

  if (!esCafeteria(sede)) return null;
  const listo = estado && estado.clave === clave ? estado : null;
  const d = listo?.data ?? null;
  const hay = (d?.filas.length ?? 0) > 0;

  const resumen = !listo
    ? <p className="text-xs text-gray-400">Calculando…</p>
    : !d
      ? null
      : hay
        ? <p className="text-xs text-gray-600">
            {d.filas.length} {d.filas.length === 1 ? "producto subió" : "productos subieron"} de precio ·
            <strong className="text-emerald-700"> {d.conteo.funciona} funcionan</strong> ·
            <strong className="text-red-700"> {d.conteo["no-funciona"]} no funcionan</strong> · {d.conteo.midiendo} midiendo
            {d.conteo.funciona + d.conteo["no-funciona"] > 0 && <> · <strong className="text-gray-800">{soles0(d.extraMesTotal)}</strong> al mes</>}.
          </p>
        : <p className="text-xs text-gray-600">Todavía no hay subidas de precio. Ábrela para ver el plan de la prueba{listo.plan ? `: subir en ${listo.plan.sede} y comparar con ${listo.plan.control}` : ""}.</p>;

  return (
    <SeccionDesplegable
      titulo={<ConPaso paso={paso}>{"Prueba de precios"}</ConPaso>}
      subtitulo="Sube en una sede, compara con la otra y mide cuánto bajó de verdad la venta de cada producto."
      resumen={resumen}
    >
      {listo?.error ? <p className="text-sm text-gray-500">{listo.error}</p>
        : !listo || !d ? <p className="text-sm text-gray-400">Calculando…</p>
        : (
          <div className="space-y-5">
            {hay ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Resultado</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{d.conteo.funciona} de {d.conteo.funciona + d.conteo["no-funciona"]}</div>
                    <div className="text-xs text-gray-500">funcionan · {d.conteo.midiendo} todavía midiendo</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Plata al mes</div>
                    <div className={`mt-1 text-xl font-semibold tabular-nums ${d.extraMesTotal < 0 ? "text-red-700" : "text-gray-900"}`}>{d.conteo.funciona + d.conteo["no-funciona"] > 0 ? soles0(d.extraMesTotal) : "—"}</div>
                    <div className="text-xs text-gray-500">de las subidas ya medidas</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Sensibilidad de tus clientes</div>
                    <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{d.elasticidadPromedio !== null ? d.elasticidadPromedio.toLocaleString("es-PE") : "—"}</div>
                    <div className="text-xs text-gray-500">{d.elasticidadPromedio !== null ? `por cada 10% que sube, venden ${Math.abs(d.elasticidadPromedio * 10).toLocaleString("es-PE", { maximumFractionDigits: 1 })}% menos` : "aparece con la primera prueba medida"}</div>
                  </div>
                </div>
                <Resultados filas={d.filas} />
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <strong>Todavía no hay subidas de precio.</strong> El sistema revisa cada semana el precio que cobró Byte por cada producto en las dos sedes
                {d.semanasPorSede.map((s) => s.hasta).filter(Boolean).length > 0 && ` (cargado hasta el ${fechaCorta(d.semanasPorSede.map((s) => s.hasta).filter((x): x is string => !!x).sort()[0])})`}.
                Cuando uno suba {Math.round(SUBIDA_MINIMA * 100)}% o más, aparecerá aquí con su resultado.
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">Plan de la prueba</h4>
              <PlanPrueba plan={listo.plan} />
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-100 px-3.5 py-3 text-[11px] text-gray-600 leading-relaxed space-y-1.5">
              <p><strong>Cómo mide.</strong> Compara la venta por día de las {SEMANAS_IDEALES} semanas antes de la subida con las semanas después. La semana del cambio no cuenta si se cobraron los dos precios.</p>
              <p><strong>El control</strong> es lo que habría pasado sin la subida: el mismo producto en la otra sede (si allí no cambió el precio) o, si subió en las dos, el resto de la carta. Así una semana floja (lluvia, feriado, vacaciones) no se confunde con el efecto del precio. <strong>Efecto del precio</strong> = lo que cambió la sede, corregido por lo que cambió el control.</p>
              <p><strong>Funciona</strong> si perdió menos ventas de las que aguantaba (el punto de quiebre de «¿Qué precios subir?»): la subida deja más plata. Con menos de {SEMANAS_MINIMAS} semanas después, todavía «Midiendo». Lo ideal son {SEMANAS_IDEALES}.</p>
            </div>
          </div>
        )}
    </SeccionDesplegable>
  );
}
