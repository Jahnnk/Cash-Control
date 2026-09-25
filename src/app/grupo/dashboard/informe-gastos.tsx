"use client";

/**
 * Grupo → Gastos: "¿A dónde se va la plata?" (pedido de Jahnn, 25-sep-2026).
 *
 * Arriba, siempre a la vista, una tarjeta por sede: en qué bolsillos se fue
 * la plata del mes y los tres indicadores del negocio de comida con su
 * semáforo. Abajo, el detalle de una sede en secciones plegadas (regla de la
 * casa: se abren cuando Jahnn las pide). El cálculo: lib/informe-gastos.ts.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Repeat } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";
import { SeccionDesplegable } from "@/components/productos/ui";
import { getInformeGastos, type InformeGastos } from "@/app/actions/informe-gastos";
import type { Bolsillos, Indicador, InformeGastosSede } from "@/lib/informe-gastos";

const BOLSILLOS: { clave: keyof Bolsillos; nombre: string; color: string; ayuda: string }[] = [
  { clave: "fijo", nombre: "Fijos", color: "#004C40", ayuda: "Planilla, alquiler, servicios…: se pagan vendas más o menos" },
  { clave: "variable", nombre: "Variables", color: "#098B5F", ayuda: "Productos de Atelier, insumos, empaques…: suben con la venta" },
  { clave: "desconocido", nombre: "Desconocido", color: "#9CA3AF", ayuda: "Nadie sabe qué fue (POR ACLARAR)" },
  { clave: "deudas", nombre: "Deudas", color: "#8E7CC3", ayuda: "Cuotas de préstamos y tarjetas" },
  { clave: "inversion", nombre: "Inversión", color: "#5B8DB8", ayuda: "Equipos y remodelación: duran años" },
  { clave: "noEsGasto", nombre: "No es gasto", color: "#D9A441", ayuda: "Ahorro, préstamos a otra sede, utilidades, devoluciones" },
  { clave: "otrasSedes", nombre: "De otras sedes", color: "#CBD5E1", ayuda: "Parte de un gasto compartido que le toca a otra sede" },
];

const NOMBRE_CORTO: Record<Indicador["clave"], string> = { costoVendido: "Lo vendido", planilla: "Planilla", costoPrimo: "Costo primo" };

const soles0 = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;

function BarraBolsillos({ b }: { b: Bolsillos }) {
  const partes = BOLSILLOS.filter((x) => b[x.clave] > 0);
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100" role="img" aria-label="Reparto del gasto del mes por bolsillo">
        {partes.map((x) => (
          <div key={x.clave} title={`${x.nombre}: ${formatCurrency(b[x.clave])}`} style={{ width: `${(b[x.clave] / b.total) * 100}%`, background: x.color }} className="h-full border-r-2 border-white last:border-r-0" />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {partes.map((x) => (
          <li key={x.clave} className="flex items-center justify-between gap-1.5 min-w-0" title={x.ayuda}>
            <span className="inline-flex items-center gap-1.5 text-gray-600 truncate">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: x.color }} />{x.nombre}
            </span>
            <span className="tabular-nums text-gray-800">{soles0(b[x.clave])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PildoraIndicador({ i }: { i: Indicador }) {
  const tono = i.estado === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : i.estado === "alerta" ? "border-red-200 bg-red-50 text-red-900" : "border-gray-200 bg-gray-50 text-gray-500";
  return (
    <div className={`rounded-xl border px-2.5 py-2 min-w-0 ${tono}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80 truncate" title={i.nombre}>{NOMBRE_CORTO[i.clave]}</div>
      <div className="text-lg font-semibold tabular-nums leading-tight">{i.pct === null ? "—" : `${i.pct}%`}</div>
      <div className="text-[10px] opacity-80">ref. ≤ {i.meta}%{i.pctProm3 !== null ? ` · antes ${i.pctProm3}%` : ""}</div>
    </div>
  );
}

function TarjetaSede({ s, activa, onElegir }: { s: InformeGastosSede; activa: boolean; onElegir: () => void }) {
  const cambio = s.bolsillosProm3.operacion > 0 ? ((s.bolsillos.operacion - s.bolsillosProm3.operacion) / s.bolsillosProm3.operacion) * 100 : null;
  return (
    <button type="button" onClick={onElegir}
      className={`text-left bg-white rounded-2xl border p-5 space-y-4 min-w-0 transition-shadow hover:shadow-sm ${activa ? "border-primary ring-1 ring-primary/30" : "border-gray-200/80"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-gray-900">{s.sede}</span>
        <span className="text-[11px] text-gray-400">{s.ventas !== null ? `vendió ${soles0(s.ventas)}` : "sin venta cargada"}</span>
      </div>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400">Salió en el mes</div>
        <div className="text-2xl font-semibold text-gray-900 tabular-nums leading-none mt-1">{formatCurrency(s.bolsillos.total)}</div>
        <div className="text-xs text-gray-500 mt-1.5">
          Operación {soles0(s.bolsillos.operacion)}
          {cambio !== null && (
            <span className={cambio > 0 ? "text-red-700" : "text-emerald-700"}> · {cambio > 0 ? "+" : ""}{Math.round(cambio)}% vs. promedio</span>
          )}
        </div>
      </div>
      <BarraBolsillos b={s.bolsillos} />
      <div className="grid grid-cols-3 gap-2">
        {s.indicadores.map((i) => <PildoraIndicador key={i.clave} i={i} />)}
      </div>
    </button>
  );
}

function Variacion({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-400">nuevo</span>;
  if (Math.abs(pct) < 5) return <span className="text-gray-500">≈ igual</span>;
  const sube = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${sube ? "text-red-700" : "text-emerald-700"}`}>
      {sube ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}{Math.abs(pct)}%
    </span>
  );
}

function DetalleSede({ s }: { s: InformeGastosSede }) {
  const r = s.recurrencia;
  const top3 = s.categorias.slice(0, 3).map((c) => c.categoria.toLowerCase()).join(", ");
  return (
    <div className="space-y-4">
      {s.alertas.length > 0 && (
        <ul className="space-y-2">
          {s.alertas.map((a, i) => (
            <li key={i} className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-950">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div><div className="font-medium">{a.titulo}</div><div className="text-xs text-amber-900 mt-0.5">{a.detalle}</div></div>
            </li>
          ))}
        </ul>
      )}

      <SeccionDesplegable
        titulo="Categorías que más pesan"
        subtitulo={`Solo la operación (fijos, variables y desconocido), contra el promedio de ${s.mesesPrevios.length} mes${s.mesesPrevios.length === 1 ? "" : "es"} anteriores.`}
        resumen={<span className="text-xs text-gray-600">Las tres más grandes: {top3 || "—"}.</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="text-left font-medium py-2 pr-3">Categoría</th>
                <th className="text-left font-medium py-2 pr-3">Tipo</th>
                <th className="text-right font-medium py-2 pr-3">Este mes</th>
                <th className="text-right font-medium py-2 pr-3">% de la venta</th>
                <th className="text-right font-medium py-2 pr-3">Promedio</th>
                <th className="text-right font-medium py-2">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {s.categorias.map((c) => (
                <tr key={c.categoria} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-3 text-gray-900">{c.categoria}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500">{c.tipo ?? "—"}</td>
                  <td className="py-2 pr-3 text-right text-gray-900">{formatCurrency(c.monto)}</td>
                  <td className="py-2 pr-3 text-right text-gray-600">{c.pctVenta === null ? "—" : `${c.pctVenta}%`}</td>
                  <td className="py-2 pr-3 text-right text-gray-500">{c.prom3 > 0 ? formatCurrency(c.prom3) : "—"}</td>
                  <td className="py-2 text-right text-xs"><Variacion pct={c.variacionPct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionDesplegable>

      <SeccionDesplegable
        titulo="Los 10 pagos más grandes"
        subtitulo="Todos los bolsillos. «Se repite» = el mismo proveedor o concepto salió en 2 o más de los meses anteriores."
        resumen={s.pagos[0] && <span className="text-xs text-gray-600">El mayor: {formatCurrency(s.pagos[0].monto)} en {s.pagos[0].categoria.toLowerCase()}.</span>}
      >
        <ul className="divide-y divide-gray-100">
          {s.pagos.map((p, i) => (
            <li key={i} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="text-gray-900">{p.concepto ?? "Sin concepto"}</span>
                <span className="block text-[11px] text-gray-500">{p.fecha} · {p.categoria} · {p.tipo ?? "sin tipo"}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {p.recurrente === true && <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><Repeat className="w-3 h-3" /> Se repite</span>}
                {p.recurrente === false && <span className="text-[11px] text-gray-500">Puntual</span>}
                <span className="tabular-nums font-medium text-gray-900">{formatCurrency(p.monto)}</span>
              </span>
            </li>
          ))}
        </ul>
      </SeccionDesplegable>

      <SeccionDesplegable
        titulo="Recurrencia: lo que sale todos los meses"
        subtitulo="El piso mensual es el promedio de fijos y cuotas: lo que hay que cubrir antes de empezar a ganar."
        resumen={
          <span className="text-xs text-gray-600">
            Piso mensual {formatCurrency(r.pisoMensual.total)}
            {r.pctRecurrente !== null ? ` · ${r.pctRecurrente}% del gasto de operación se repite cada mes` : ""}
            {` · gastos hormiga ${formatCurrency(r.hormiga.total)}`}
          </span>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Piso mensual · {formatCurrency(r.pisoMensual.total)}</h4>
            <ul className="space-y-1 text-sm">
              {r.pisoMensual.detalle.map((d) => (
                <li key={d.categoria} className="flex justify-between gap-2"><span className="text-gray-700">{d.categoria}</span><span className="tabular-nums text-gray-900">{formatCurrency(d.promedio)}</span></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">A quién se le paga más (operación)</h4>
            {r.pctRecurrente === null && (
              <p className="text-[11px] text-gray-500 mb-2">Todavía no hay meses anteriores del Excel para comparar: la recurrencia aparece desde el próximo mes.</p>
            )}
            <ul className="space-y-1 text-sm">
              {r.proveedores.map((p) => (
                <li key={p.nombre} className="flex justify-between gap-2">
                  <span className="text-gray-700 truncate">{p.nombre}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {p.de > 1 && <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${p.meses === p.de ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>{p.meses} de {p.de} meses</span>}
                    <span className="tabular-nums text-gray-900">{formatCurrency(p.monto)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-500 mt-3">
              Gastos hormiga (menos de S/50): {r.hormiga.pagos} pagos que suman {formatCurrency(r.hormiga.total)}
              {r.hormiga.pctOperacion !== null ? ` (${r.hormiga.pctOperacion}% de la operación)` : ""}.
            </p>
          </div>
        </div>
      </SeccionDesplegable>
    </div>
  );
}

export function InformeGastosGrupo() {
  const [data, setData] = useState<InformeGastos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void getInformeGastos().then((r) => { if (!vivo) return; if (r.ok) setData(r.data); else setError(r.error); });
    return () => { vivo = false; };
  }, []);

  if (error) return <p className="text-sm text-gray-500">{error}</p>;
  if (!data) return <div className="flex justify-center py-12 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return <InformeGastosVista data={data} />;
}

export function InformeGastosVista({ data }: { data: InformeGastos }) {
  const [sede, setSede] = useState<number>(2);
  const elegida = data.sedes.find((s) => s.businessId === sede) ?? data.sedes[0];
  const previos = elegida.mesesPrevios;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold text-gray-900">¿A dónde se va la plata? · {monthLabel(data.mes)}</h2>
        <p className="text-xs text-gray-500 mt-1 max-w-3xl leading-relaxed">
          Último mes cerrado{previos.length > 0 ? `, comparado con el promedio de ${previos.map((m) => monthLabel(m).split(" ")[0].toLowerCase()).reverse().join(", ")}` : ""}.
          Lo que salió es la misma cifra del Excel. Semáforo con referencias del rubro para cafeterías: costo de lo vendido (Atelier + insumos + empaques)
          ≤ 35% de la venta, planilla ≤ 30%, costo primo (la suma) ≤ 65%. Toca una sede para ver su detalle.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {data.sedes.map((s) => <TarjetaSede key={s.businessId} s={s} activa={s.businessId === elegida.businessId} onElegir={() => setSede(s.businessId)} />)}
      </div>
      <div className="space-y-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Detalle de {elegida.sede}</h3>
        <DetalleSede key={elegida.businessId} s={elegida} />
      </div>
    </div>
  );
}
