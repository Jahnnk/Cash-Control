/**
 * Arma el pago del mes de una sede a partir de lo que ya calculó la
 * liquidación · lógica PURA.
 *
 * La acción del servidor (`getPagosDelMes`) junta los datos de las bases; este
 * archivo los convierte en lo que lee el reporte. Está separado para poder
 * probarlo sin bases de datos y para que el reporte y la liquidación hablen
 * exactamente de las mismas cifras.
 */

import { pagaPorHoras, tarifaHoraBono, type LiquidationResult } from "./engine";
import type { EstadoCandadoVentas } from "./candado-ventas";
import type { HorasDelMes } from "./horas-planilla";
import type { PagoColaborador, PagoSede } from "./reporte-bonos-tipos";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type EntradaPagoSede = {
  businessId: number;
  sede: string;
  month: string;
  /** El acta, si el mes ya se cerró. */
  cerrada: { closedAt: string; mejorVendedor: string | null } | null;
  result: LiquidationResult;
  /** Todo el equipo de la sede (activo o no): de aquí sale el DNI de cada línea. */
  equipo: { name: string; dni: string | null; active: boolean }[];
  /** Desglose de horas de Planilla por DNI (vacío si no se pudo leer). */
  desglose: Map<string, HorasDelMes>;
  sugeridoByte: string | null;
  sugeridoEquipo: string | null;
  avisosPremio: string[];
  sincronizadoEn: string | null;
  ventas: EstadoCandadoVentas | null;
  politica: PagoSede["politica"];
  excepcionesDisponibles: boolean;
};

export function armarPagoSede(i: EntradaPagoSede): PagoSede {
  const { result } = i;
  const dniDe = new Map(i.equipo.map((s) => [s.name.trim().toUpperCase(), s.dni]));

  const lines: PagoColaborador[] = result.lines.map((l) => {
    const dni = dniDe.get(l.name.trim().toUpperCase()) ?? null;
    const d = dni ? i.desglose.get(dni.trim()) : undefined;
    return {
      name: l.name,
      dni,
      jornada: l.jornada,
      horasMes: l.horasMes,
      horasReales: l.horasReales,
      origenHoras: d?.origen ?? null,
      horasBase: d?.horasBase ?? null,
      horasMenos: d?.horasMenos ?? 0,
      horasMas: d?.horasMas ?? 0,
      bono: l.bono,
      premioMv: l.premioMv,
      total: r2(l.bono + l.premioMv),
    };
  });

  return {
    businessId: i.businessId,
    sede: i.sede,
    month: i.month,
    fuente: i.cerrada ? "acta" : "vista-previa",
    cerradaEn: i.cerrada?.closedAt ?? null,
    nivel: result.nivel?.nombre ?? null,
    // Cuatro decimales: con dos, 94 h × la tarifa no daría el bono (0.51 × 94 = 47.94, no 48).
    tarifaHora: result.nivel && pagaPorHoras(i.month) ? Math.round(tarifaHoraBono(result.nivel) * 10000) / 10000 : null,
    totalBonos: r2(lines.reduce((t, l) => t + l.total, 0)),
    pozo: result.pozo,
    premioDelNivel: result.nivel?.premio_mv ?? 0,
    mejorVendedor: {
      sugeridoByte: i.sugeridoByte,
      sugeridoEquipo: i.sugeridoEquipo,
      usado: i.cerrada ? i.cerrada.mejorVendedor : null,
      premio: r2(lines.reduce((t, l) => t + l.premioMv, 0)),
    },
    equipo: i.equipo.filter((s) => s.active).map((s) => s.name),
    lines,
    warnings: [...i.avisosPremio, ...result.warnings],
    blockers: result.blockers,
    sincronizadoEn: i.sincronizadoEn,
    ventas: i.ventas,
    politica: i.politica,
    excluidos: result.excluidos ?? [],
    incluidosPorExcepcion: result.incluidosPorExcepcion ?? [],
    excepcionesDisponibles: i.excepcionesDisponibles,
  };
}
