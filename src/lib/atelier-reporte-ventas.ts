/**
 * Lo que sale del «Reporte de Ventas» de Byte de Atelier, además de los cobros.
 *
 * Auditoría de fricción (10-oct-2026, decisión de Jahnn): el «Reporte de
 * Ventas» trae UN pedido por fila, con fecha, cliente y monto. Comparado con
 * el reporte «Ventas de <MES>», coincidió 12 de 12 días al céntimo en pedidos
 * y en venta. Por eso Luis dejó de subir dos archivos:
 *
 *   · «Ventas de <MES>»     → `ventasPorDia`: la venta y los pedidos de cada día.
 *   · «Ventas por Cliente»  → `clientesDeLaSemana`: el ranking, semana por semana
 *                             (lunes a domingo), para que «creció / cayó» compare
 *                             semanas enteras y no un mes a medias.
 *
 * Una semana se arma solo si los reportes subidos cubren de lunes a sábado
 * (`semanasCubiertas`): con un hueco, el ranking diría que un cliente dejó de
 * comprar cuando en realidad faltó el archivo.
 *
 * Lógica pura, sin base de datos: la usa actions/receivables.ts.
 */

import type { DocumentoParseado } from "./receivables-parser";
import type { ClientSalesRow } from "./client-sales-parser";
import { lunesDe, sumarDias } from "./highlight";

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

export type VentaDia = { date: string; pedidos: number; descuentos: number; total: number };

type DocVenta = Pick<DocumentoParseado, "fecha" | "cliente" | "tipo" | "total" | "esSede" | "sedeId"> & { descuento?: number };

/** La venta de cada día del reporte. El día de hoy no: está a medias (misma regla que «Ventas de <MES>»). */
export function ventasPorDia(docs: DocVenta[], hoy: string): VentaDia[] {
  const porDia = new Map<string, VentaDia>();
  for (const d of docs) {
    if (d.fecha >= hoy) continue;
    const v = porDia.get(d.fecha) ?? { date: d.fecha, pedidos: 0, descuentos: 0, total: 0 };
    v.pedidos += 1;
    v.descuentos = r2(v.descuentos + (d.descuento ?? 0));
    v.total = r2(v.total + d.total);
    porDia.set(d.fecha, v);
  }
  return [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type Rango = { inicio: string; fin: string };

/** ¿La unión de los rangos cubre todos los días de [ini, fin]? */
function cubre(rangos: Rango[], ini: string, fin: string): boolean {
  for (let d = ini; d <= fin; d = sumarDias(d, 1)) {
    if (!rangos.some((r) => r.inicio <= d && r.fin >= d)) return false;
  }
  return true;
}

/**
 * Las semanas (lunes a domingo) que toca el archivo recién subido y que los
 * reportes de ventas subidos hasta hoy cubren de lunes a sábado. El sábado
 * puede ser hoy: Luis sube los sábados.
 */
export function semanasCubiertas(subidos: Rango[], archivo: Rango, hoy: string): Rango[] {
  const out: Rango[] = [];
  for (let lunes = lunesDe(archivo.inicio); lunes <= archivo.fin; lunes = sumarDias(lunes, 7)) {
    const sabado = sumarDias(lunes, 5);
    if (sabado > hoy) continue;
    if (cubre(subidos, lunes, sabado)) out.push({ inicio: lunes, fin: sumarDias(lunes, 6) });
  }
  return out;
}

/**
 * El ranking de clientes de una semana, con la misma forma que el reporte
 * «Ventas por Cliente» de Byte (con/sin comprobante = cuántos pedidos).
 * El RUC/DNI no viene en el reporte de ventas: se completa con `documentos`
 * (nombre en mayúsculas → documento) para que la comparación entre semanas
 * siga encontrando a cada cliente.
 */
export function clientesDeLaSemana(docs: DocVenta[], documentos: Map<string, string> = new Map()): ClientSalesRow[] {
  const porCliente = new Map<string, ClientSalesRow>();
  for (const d of docs) {
    const nombre = d.cliente.trim();
    const k = nombre.toUpperCase();
    const f = porCliente.get(k) ?? {
      documento: documentos.get(k) ?? null, tipoDoc: null, cliente: nombre,
      esSede: false, sedeId: null, totalPedidos: 0, conComprobante: 0, sinComprobante: 0,
      totalVentas: 0, ticketPromedio: 0, primeraCompra: null, ultimaCompra: null,
    };
    f.esSede = f.esSede || d.esSede;
    f.sedeId = f.sedeId ?? d.sedeId;
    f.totalPedidos += 1;
    if (d.tipo === "TICKET") f.sinComprobante += 1;
    else f.conComprobante += 1;
    f.totalVentas = r2(f.totalVentas + d.total);
    if (!f.primeraCompra || d.fecha < f.primeraCompra) f.primeraCompra = d.fecha;
    if (!f.ultimaCompra || d.fecha > f.ultimaCompra) f.ultimaCompra = d.fecha;
    porCliente.set(k, f);
  }
  return [...porCliente.values()]
    .map((f) => ({ ...f, ticketPromedio: f.totalPedidos > 0 ? r2(f.totalVentas / f.totalPedidos) : 0 }))
    .sort((a, b) => b.totalVentas - a.totalVentas);
}
