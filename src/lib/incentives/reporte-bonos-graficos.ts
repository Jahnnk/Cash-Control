/**
 * Qué gráficos lleva el reporte de Bonos e Incentivos y con qué datos · PURO.
 * Los dibujos salen de bonos-charts.ts; este archivo solo decide cuáles y
 * los alimenta desde el reporte ya armado (reporte-bonos.ts).
 */

import {
  graficoAvanceMetas, graficoBarras, graficoLineas,
  COLOR_BASE, COLOR_META_VENTAS, COLOR_NIVEL, type Dibujo, type GrupoAvance,
} from "./bonos-charts";
import type { ReporteBonos, SedeReporte } from "./reporte-bonos";

export type GraficosSede = { ticket: Dibujo | null; ventas: Dibujo | null; bonos: Dibujo | null };
export type GraficosReporteSvg = { comparativo: Dibujo | null; porSede: Record<number, GraficosSede> };

const solesFmt = (dec: number) => (n: number) =>
  `S/${n.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

const diaDelMes = (iso: string) => Number(iso.slice(8, 10));
const diasDe = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

function graficoTicket(s: SedeReporte, month: string): Dibujo | null {
  if (s.dias.length === 0 || s.ticket.actual === null) return null;
  const n = diasDe(month);
  const acum: (number | null)[] = Array(n).fill(null);
  const dia: (number | null)[] = Array(n).fill(null);
  for (const d of s.dias) {
    acum[diaDelMes(d.date) - 1] = d.ticketAcum;
    dia[diaDelMes(d.date) - 1] = d.ticketDia;
  }
  return graficoLineas({
    titulo: `${s.sede} · Ticket del programa día a día`,
    subtitulo: "Línea gruesa: ticket acumulado del mes. Puntos tenues: ticket de cada día. Las líneas horizontales son las metas.",
    dias: n,
    series: [
      { nombre: "Ticket del día", color: s.color, puntos: dia, grosor: 1.2, marcadores: true, tenue: true },
      { nombre: "Ticket acumulado", color: s.color, puntos: acum },
    ],
    guias: [
      { y: s.ticket.base, etiqueta: `Base ${solesFmt(2)(s.ticket.base)}`, color: COLOR_BASE, punteada: true },
      ...s.ticket.niveles.map((nv, i) => ({
        y: nv.metaTicket,
        etiqueta: `${nv.nombre} ${solesFmt(2)(nv.metaTicket)}`,
        color: COLOR_NIVEL[Math.min(i, COLOR_NIVEL.length - 1)],
      })),
    ],
    formato: solesFmt(2),
  });
}

function graficoVentas(s: SedeReporte, month: string): Dibujo | null {
  if (s.dias.length === 0) return null;
  const n = diasDe(month);
  const acum: (number | null)[] = Array(n).fill(null);
  for (const d of s.dias) acum[diaDelMes(d.date) - 1] = d.ventaAcum;
  const meta = s.ventas?.meta ?? null;
  return graficoLineas({
    titulo: `${s.sede} · Ventas acumuladas del mes${meta ? " frente a la meta" : ""}`,
    subtitulo: meta
      ? "Si la línea de la sede va por encima de la diagonal punteada, va a tiempo para llegar a la meta."
      : "Venta total acumulada día a día.",
    dias: n,
    yMin: 0,
    series: [{ nombre: "Ventas acumuladas", color: s.color, puntos: acum }],
    guias: meta ? [{ y: meta, etiqueta: `Meta ${solesFmt(0)(meta)}`, color: COLOR_META_VENTAS }] : [],
    ritmo: meta ? { hasta: meta, etiqueta: "ritmo necesario", color: COLOR_BASE } : undefined,
    formato: solesFmt(0),
  });
}

function graficoBonos(s: SedeReporte): Dibujo | null {
  const lineas = (s.pagos?.lines ?? []).filter((l) => l.total > 0).sort((a, b) => b.total - a.total);
  if (lineas.length === 0) return null;
  return graficoBarras({
    titulo: `${s.sede} · Lo que se transfiere a cada persona`,
    subtitulo: "Bono según las horas de Planilla, más el premio al mejor vendedor si lo hay.",
    barras: lineas.map((l) => ({
      etiqueta: l.name,
      valor: l.total,
      color: s.color,
      detalle: l.jornada === "administrador" ? "monto fijo" : l.horasMes !== null ? `${l.horasMes} h` : undefined,
    })),
    formato: solesFmt(0),
  });
}

function graficoComparativo(r: ReporteBonos): Dibujo | null {
  const sedes = r.sedes.filter((s) => s.ticket.actual !== null);
  if (sedes.length === 0) return null;
  const nombresNivel = sedes[0].ticket.niveles.map((n) => n.nombre);
  const grupos: GrupoAvance[] = nombresNivel.map((nombre, i) => ({
    etiqueta: `Ticket · ${nombre}`,
    valores: sedes.map((s) => ({ sede: s.sede, color: s.color, pct: s.ticket.avancePorNivel[i] ?? null })),
  }));
  if (sedes.every((s) => s.ventas?.meta)) {
    grupos.push({
      etiqueta: "Ventas · meta del mes",
      valores: sedes.map((s) => ({ sede: s.sede, color: s.color, pct: s.ventas?.avancePct ?? null })),
    });
  }
  return graficoAvanceMetas({
    titulo: "Qué tan cerca está cada sede de cada meta",
    subtitulo: "100% = meta cumplida. En el ticket se mide cuánto del aumento pedido sobre la base se logró.",
    grupos,
  });
}

export function graficosDelReporte(r: ReporteBonos): GraficosReporteSvg {
  const porSede: Record<number, GraficosSede> = {};
  for (const s of r.sedes) {
    porSede[s.businessId] = {
      ticket: graficoTicket(s, r.month),
      ventas: r.esRango ? null : graficoVentas(s, r.month),
      bonos: r.esRango ? null : graficoBonos(s),
    };
  }
  return { comparativo: graficoComparativo(r), porSede };
}
