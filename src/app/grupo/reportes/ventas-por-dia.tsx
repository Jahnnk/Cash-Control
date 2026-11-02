"use client";

/**
 * «Ventas día por día» (pedido de Jahnn, 1-nov-2026): el reporte «Ventas de <MES>» de Byte con gráfico —barras de lo
 * vendido por día (apiladas por sede en el Grupo) y la línea de pedidos— y la tabla de cada día. Vive en Reportes →
 * Ventas. Plegado: carga los datos recién al abrirlo. Si se llega desde el Dashboard (enlace con la sede), ya viene
 * abierto y con esa sede elegida.
 */

import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SeccionDesplegable } from "@/components/productos/ui";
import { getVentasPorDia } from "@/app/actions/ventas-por-dia";
import { armarVentasPorDia, COLOR_SEDE_DIA, type DiaVenta, type EntradaSedeDia } from "@/lib/dashboard-ventas-dia";

const soles = (n: number) => `S/ ${Math.round(n).toLocaleString("es-PE")}`;
const soles2 = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (mes: string) => `${MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-gray-50 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{etiqueta}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums text-gray-900">{valor}</div>
      {nota && <div className="mt-0.5 text-xs text-gray-500">{nota}</div>}
    </div>
  );
}

const OPCIONES_SEDE: { id: number | null; nombre: string }[] = [{ id: null, nombre: "Grupo" }, { id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }, { id: 1, nombre: "Atelier" }];

export function VentasPorDia({ mes, sedeInicial = null, abierta = false }: { mes: string; sedeInicial?: number | null; abierta?: boolean }) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "listo" | "error">(abierta ? "cargando" : "idle");
  const [entradas, setEntradas] = useState<EntradaSedeDia[]>([]);
  const [sede, setSede] = useState<number | null>(sedeInicial);

  async function cargar() {
    setEstado("cargando");
    const r = await getVentasPorDia(mes);
    if (!r.ok) { setEstado("error"); return; }
    setEntradas(r.entradas); setEstado("listo");
  }

  // Llegó desde el Dashboard: ya abierto, así que se cargan los datos al entrar (el desplegable solo avisa al abrirse a mano).
  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    getVentasPorDia(mes)
      .then((r) => { if (!vivo) return; if (r.ok) { setEntradas(r.entradas); setEstado("listo"); } else setEstado("error"); })
      .catch(() => { if (vivo) setEstado("error"); });
    return () => { vivo = false; };
  }, [abierta, mes]);

  const vista = useMemo(() => armarVentasPorDia(entradas, sede), [entradas, sede]);
  const apilado = vista !== null && vista.sedes.length > 1;
  const hayPedidos = vista?.dias.some((d) => d.pedidos !== null) ?? false;
  const datos = useMemo(
    () => (vista?.dias ?? []).map((d) => ({ dia: d.dia, fecha: d.date, semana: d.diaSemana, total: d.total, pedidos: d.pedidos, ...Object.fromEntries(Object.entries(d.porSede).map(([k, v]) => [`s${k}`, v])) })),
    [vista],
  );

  return (
    <div id="ventas-dia" className="scroll-mt-4">
      <SeccionDesplegable
        key={mes}
        titulo="Ventas día por día"
        subtitulo={`Cuánto se vendió cada día de ${nombreMes(mes)}, con su gráfico y el detalle de pedidos.`}
        abiertaAlInicio={abierta}
        onAbrir={cargar}
      >
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Sede">
          {OPCIONES_SEDE.map((o) => (
            <button
              key={String(o.id)} type="button" onClick={() => setSede(o.id)} aria-pressed={sede === o.id}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${sede === o.id ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"}`}
            >{o.nombre}</button>
          ))}
        </div>
        {estado === "cargando" && <p className="text-sm text-gray-500">Cargando…</p>}
        {estado === "error" && <p className="text-sm text-red-700">No se pudieron leer las ventas por día.</p>}
        {estado === "listo" && (!vista || vista.dias.length === 0) && <p className="text-sm text-gray-500">Todavía no hay ventas cargadas en este mes.</p>}
        {estado === "listo" && vista && vista.dias.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Dato etiqueta="Vendido" valor={soles(vista.total)} nota={`${vista.diasConVenta} días con venta`} />
              <Dato etiqueta="Promedio por día" valor={soles(vista.promedio)} />
              <Dato etiqueta="Mejor día" valor={vista.mejor ? soles(vista.mejor.total) : "—"} nota={vista.mejor ? `${vista.mejor.diaSemana} ${ddmm(vista.mejor.date)}` : undefined} />
              <Dato etiqueta="Día más flojo" valor={vista.peor ? soles(vista.peor.total) : "—"} nota={vista.peor ? `${vista.peor.diaSemana} ${ddmm(vista.peor.date)}` : undefined} />
            </div>

            <div className="mt-4 h-72 w-full" role="img" aria-label="Ventas de cada día del mes y pedidos atendidos">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={datos} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={{ stroke: "#D1D5DB" }} interval="preserveStartEnd" />
                  <YAxis yAxisId="venta" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                  {hayPedidos && <YAxis yAxisId="pedidos" orientation="right" tick={{ fontSize: 11, fill: "#6B7280" }} tickLine={false} axisLine={false} />}
                  <Tooltip content={<Globo apilado={apilado} nombres={Object.fromEntries(vista.sedes.map((s) => [s.businessId, s.nombre]))} />} cursor={{ fill: "rgba(9,139,95,0.06)" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {apilado
                    ? vista.sedes.map((s) => <Bar key={s.businessId} yAxisId="venta" dataKey={`s${s.businessId}`} name={s.nombre} stackId="v" fill={COLOR_SEDE_DIA[s.businessId]} />)
                    : <Bar yAxisId="venta" dataKey="total" name="Vendido (S/)" fill="#098B5F" radius={[3, 3, 0, 0]} />}
                  {hayPedidos && <Line yAxisId="pedidos" type="monotone" dataKey="pedidos" name="Pedidos atendidos" stroke="#DCA64F" strokeWidth={2} dot={{ r: 2 }} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {vista.porDiaSemana.length > 1 && (
              <div className="mt-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">Venta promedio según el día de la semana</div>
                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {vista.porDiaSemana.map((d) => {
                    const mejor = d.nombre === vista.mejorDiaSemana?.nombre;
                    return (
                      <div key={d.nombre} className={`rounded-lg px-1 py-2 text-center ${mejor ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-gray-50"}`}>
                        <div className="text-[11px] capitalize text-gray-500">{d.nombre.slice(0, 3)}</div>
                        <div className="mt-0.5 text-xs font-semibold tabular-nums text-gray-900">{soles(d.promedio)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-gray-200">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="sticky top-0 bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Día</th>
                    {hayPedidos && <th className="px-3 py-2 text-right font-medium"># Pedidos</th>}
                    {hayPedidos && <th className="px-3 py-2 text-right font-medium">Descuentos</th>}
                    {hayPedidos && <th className="px-3 py-2 text-right font-medium">Ticket</th>}
                    <th className="px-3 py-2 text-right font-medium">Total vendido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 tabular-nums">
                  {vista.dias.map((d) => <Fila key={d.date} d={d} hayPedidos={hayPedidos} esMejor={vista.mejor?.date === d.date} esPeor={vista.peor?.date === d.date && vista.diasConVenta > 1} />)}
                </tbody>
                <tfoot className="sticky bottom-0 bg-gray-50 font-semibold text-gray-900">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    {hayPedidos && <td className="px-3 py-2 text-right">{vista.pedidos ?? "—"}</td>}
                    {hayPedidos && <td className="px-3 py-2 text-right">{vista.descuentos === null ? "—" : soles2(vista.descuentos)}</td>}
                    {hayPedidos && <td className="px-3 py-2 text-right">{vista.ticket === null ? "—" : soles2(vista.ticket)}</td>}
                    <td className="px-3 py-2 text-right">{soles2(vista.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              El total de cada día es la venta oficial (la misma de la cifra de arriba). Los pedidos y descuentos vienen del reporte de Byte, en los días en que está cargado. El día en curso no se cuenta hasta que cierra.
            </p>
          </>
        )}
      </SeccionDesplegable>
    </div>
  );
}

function Fila({ d, hayPedidos, esMejor, esPeor }: { d: DiaVenta; hayPedidos: boolean; esMejor: boolean; esPeor: boolean }) {
  const vacio = d.total <= 0;
  return (
    <tr className={vacio ? "text-gray-400" : ""}>
      <td className="px-3 py-1.5 text-left">
        <span className="text-gray-900">{ddmm(d.date)}</span> <span className="text-xs capitalize text-gray-500">{d.diaSemana}</span>
        {esMejor && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">mejor</span>}
        {esPeor && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">más flojo</span>}
      </td>
      {hayPedidos && <td className="px-3 py-1.5 text-right">{d.pedidos ?? "—"}</td>}
      {hayPedidos && <td className="px-3 py-1.5 text-right">{d.descuentos === null ? "—" : soles2(d.descuentos)}</td>}
      {hayPedidos && <td className="px-3 py-1.5 text-right">{d.ticket === null ? "—" : soles2(d.ticket)}</td>}
      <td className="px-3 py-1.5 text-right font-medium text-gray-900">{vacio ? "sin venta" : soles2(d.total)}</td>
    </tr>
  );
}

type PuntoGlobo = { payload?: { fecha: string; semana: string; total: number; pedidos: number | null } & Record<string, unknown> };

function Globo({ active, payload, apilado, nombres }: { active?: boolean; payload?: PuntoGlobo[]; apilado: boolean; nombres: Record<number, string> }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="font-semibold capitalize text-gray-900">{p.semana} {ddmm(p.fecha)}</div>
      <div className="mt-1 tabular-nums text-gray-700">Vendido: <b>{soles2(p.total)}</b></div>
      {apilado && Object.entries(nombres).map(([id, n]) => {
        const v = p[`s${id}`];
        return typeof v === "number" ? <div key={id} className="tabular-nums text-gray-500">{n}: {soles2(v)}</div> : null;
      })}
      {p.pedidos !== null && <div className="tabular-nums text-gray-700">Pedidos: <b>{p.pedidos}</b></div>}
    </div>
  );
}
