"use client";

/**
 * Inicio del Panel de Atelier (20-nov-2026): el mismo tablero que las cafeterías, con los datos de Atelier.
 * Atelier no tiene NPS, tiempos de salón ni incentivos: sus cifras son venta, pedidos, ticket por pedido,
 * mermas y lo que le deben los clientes. Solo ordena lo que ya existía.
 */

import { useMemo } from "react";
import { BarChart3, CalendarRange, Coins, HandCoins, Package, Receipt, Trash2, TrendingUp } from "lucide-react";
import type { AtelierDaily, AtelierPanelData } from "@/app/actions/byte-ventas";
import type { CobranzaEnvios } from "@/app/actions/cobranza-envios";
import { monthLabel } from "@/lib/utils";
import { EnlaceVer, Kpi, Pastilla, TarjetaInicio, Variacion, diaLargo, ir, soles, solesCorto } from "./inicio-ui";

const ticketDe = (d: AtelierDaily) => (d.venta !== null && (d.pedidos ?? 0) > 0 ? Math.round((d.venta / d.pedidos!) * 100) / 100 : null);
const promedio = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);

/** Las cifras del último día registrado contra el promedio del mes. */
/** `cobranza`: lo que le deben a Atelier según Finanzas de Yayi's Envíos (undefined = cargando, null = no se pudo leer). */
export function KpisDelDiaAtelier({ dailies, cobranza }: { dailies: AtelierDaily[]; cobranza: CobranzaEnvios | null | undefined }) {
  const conVenta = useMemo(() => [...dailies].filter((d) => d.venta !== null).sort((a, b) => a.date.localeCompare(b.date)), [dailies]);
  const ultimo = conVenta.at(-1) ?? null;

  if (!ultimo) {
    return (
      <TarjetaInicio icono={BarChart3} titulo="KPIs del día">
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm text-gray-600">Aún no hay días registrados este mes.</p>
          <button type="button" onClick={() => ir("registro-diario")}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-light">Registrar el día</button>
        </div>
      </TarjetaInicio>
    );
  }

  const otros = conVenta.slice(0, -1);
  const venta = ultimo.venta ?? 0;
  const ventaProm = promedio(otros.map((d) => d.venta ?? 0));
  const pedidosProm = promedio(otros.filter((d) => d.pedidos !== null).map((d) => d.pedidos!));
  const ticket = ticketDe(ultimo);
  const ticketProm = promedio(otros.map(ticketDe).filter((t): t is number => t !== null));
  const mermasPct = ultimo.mermas !== null && venta > 0 ? (ultimo.mermas / venta) * 100 : null;

  return (
    <TarjetaInicio icono={BarChart3} titulo="KPIs del día" nota={`Último día registrado: ${diaLargo(ultimo.date)}`}
      accion={<EnlaceVer onClick={() => ir("registro-diario")}>Ver detalle</EnlaceVer>}>
      <div className="grid grid-cols-2 md:grid-cols-6 xl:grid-cols-5 gap-2.5 sm:gap-3">
        <Kpi icono={Coins} fondo="bg-emerald-50 text-primary-light" titulo="Ventas" valor={solesCorto(venta)}>
          {ventaProm ? <Variacion pct={((venta - ventaProm) / ventaProm) * 100} texto="vs. promedio del mes" />
            : <p className="text-xs text-gray-500">Primer día del mes</p>}
        </Kpi>
        <Kpi icono={Package} fondo="bg-emerald-50 text-primary-light" titulo="Pedidos" valor={ultimo.pedidos ?? "—"}>
          {ultimo.pedidos !== null && pedidosProm ? <Variacion pct={((ultimo.pedidos - pedidosProm) / pedidosProm) * 100} texto="vs. promedio" />
            : <p className="text-xs text-gray-500">{ultimo.source === "import" ? "Del reporte de Byte" : "Registro manual"}</p>}
        </Kpi>
        <Kpi icono={Receipt} fondo="bg-amber-50 text-amber-500" titulo="Ticket por pedido" valor={ticket !== null ? soles(ticket) : "—"}>
          {ticket !== null && ticketProm ? <Variacion pct={((ticket - ticketProm) / ticketProm) * 100} texto="vs. promedio" />
            : <p className="text-xs text-gray-500">Venta ÷ pedidos</p>}
        </Kpi>
        <Kpi icono={Trash2} ancho="largo" fondo="bg-emerald-50 text-primary-light" titulo="Mermas" valor={ultimo.mermas !== null ? soles(ultimo.mermas) : "—"}>
          {mermasPct === null ? <Pastilla tono="neutro">Sin dato</Pastilla>
            : <Pastilla tono="neutro">{mermasPct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}% de la venta</Pastilla>}
        </Kpi>
        <Kpi icono={HandCoins} ancho="ultimo" fondo="bg-sky-50 text-sky-600" titulo="Te deben"
          valor={cobranza ? solesCorto(cobranza.total) : cobranza === undefined ? <span className="inline-block h-6 w-24 animate-pulse rounded bg-gray-200" aria-label="Cargando" /> : "—"}>
          {cobranza ? (
            <>
              <ul className="w-full space-y-0.5 text-xs text-gray-600 xl:text-[11px] 2xl:text-xs">
                {cobranza.sedes.map((s) => (
                  <li key={s.sede} className="flex justify-between gap-2"><span>{s.nombre}</span><span className="whitespace-nowrap tabular-nums text-gray-900">{soles(s.saldo)}</span></li>
                ))}
                <li className="flex justify-between gap-2" title={`${cobranza.b2b.clientes} clientes B2B`}><span>B2B ({cobranza.b2b.clientes})</span><span className="whitespace-nowrap tabular-nums text-gray-900">{soles(cobranza.b2b.saldo)}</span></li>
              </ul>
              {cobranza.masDe30 > 0 && <p className="text-xs font-medium text-red-600"><span className="whitespace-nowrap">{soles(cobranza.masDe30)}</span> a más de 30 días</p>}
              <a href={cobranza.urlFinanzas} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-medium text-primary-light hover:text-primary">Según Finanzas de Envíos ↗</a>
            </>
          ) : cobranza === null ? <p className="text-xs text-gray-500">No pude leer Finanzas de Envíos.</p> : null}
        </Kpi>
      </div>
    </TarjetaInicio>
  );
}

/** El mes de Atelier: venta acumulada, ticket promedio y mermas (lo que antes eran 3 cuadros sueltos). */
export function MesAtelier({ summary, month }: { summary: AtelierPanelData["summary"]; month: string }) {
  const s = summary;
  const mes = monthLabel(month).replace(/ de /i, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <TarjetaInicio icono={CalendarRange} titulo="El mes en Atelier" nota={mes}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi icono={TrendingUp} ancho="libre" fondo="bg-emerald-50 text-primary-light" titulo={`Venta acumulada (${s.diasConVenta} día${s.diasConVenta === 1 ? "" : "s"})`} valor={solesCorto(s.ventaTotal)}>
          <p className="text-xs text-gray-500">{s.diasConVenta > 0 ? `Promedio ${soles(s.ventaTotal / s.diasConVenta)}/día` : "Sin días registrados"}</p>
        </Kpi>
        <Kpi icono={Receipt} ancho="libre" fondo="bg-amber-50 text-amber-500" titulo="Ticket promedio del mes" valor={s.ticketProm !== null ? soles(s.ticketProm) : "—"}>
          <p className="text-xs text-gray-500">Venta ÷ pedidos (mismo cálculo que Byte)</p>
        </Kpi>
        <Kpi icono={Trash2} ancho="libre" fondo="bg-emerald-50 text-primary-light" titulo="Mermas del mes" valor={soles(s.mermasTotal)}>
          <p className="text-xs text-gray-500">{s.mermasPct !== null ? `${s.mermasPct}% de la venta` : "Sin venta registrada aún"}</p>
        </Kpi>
      </div>
    </TarjetaInicio>
  );
}
