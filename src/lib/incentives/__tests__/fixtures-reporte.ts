import { computeProgress, computeLiquidation, type IncentiveConfigT, type DailyEntry, type StaffMember } from "../engine";
import { armarPagoSede } from "../pago-sede";
import { armarReporte, conPremio } from "../reporte-bonos";
import type { GroupIncentives } from "@/app/actions/group-incentives";
import type { HorasDelMes } from "../horas-planilla";

export const NIVELES = [
  { nombre: "Nivel 1", delta: 1.5, bono_tc: 48, bono_mt: 24, bono_admin: 89, premio_mv: 68 },
  { nombre: "Nivel 2", delta: 3, bono_tc: 97, bono_mt: 48, bono_admin: 179, premio_mv: 134 },
  { nombre: "¡La rompimos!", delta: 5, bono_tc: 162, bono_mt: 81, bono_admin: 298, premio_mv: 224 },
];

const config: IncentiveConfigT = { ticketBase: 24.82, marginPct: 0.598, trafficFloor: 45, poolPct: 0.4, levels: NIVELES };

/** 30 días de septiembre: ticket presencial ~28 (Nivel 2). */
export function diasDePrueba(): DailyEntry[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return { date: `2026-09-${d}`, personas: 50, revenue: 1400 + (i % 3) * 20, items: null, deliveryPedidos: i % 5 === 0 ? 2 : 0, deliveryVenta: i % 5 === 0 ? 40 : 0 };
  });
}

const equipo = [
  { name: "Teresa", dni: "72678416", jornada: "medio_turno" as const, area: "salon", active: true, horasSemanales: 23.5 },
  { name: "Diego", dni: "60879780", jornada: "medio_turno" as const, area: "salon", active: true, horasSemanales: 13 },
  { name: "Chari", dni: "71821742", jornada: "administrador" as const, area: "administracion", active: true, horasSemanales: 48 },
];

const desglose = new Map<string, HorasDelMes>([
  ["72678416", { dni: "72678416", origen: "horario", horasBase: 102, horasMenos: 0, horasMas: 1.67, horas: 103.67 }],
  ["60879780", { dni: "60879780", origen: "registrada", horasBase: 52, horasMenos: 2, horasMas: 0, horas: 50 }],
  ["71821742", { dni: "71821742", origen: "horario", horasBase: 192, horasMenos: 0, horasMas: 0, horas: 192 }],
]);

export function pagoDePrueba(opts: { conNivel?: boolean } = {}) {
  const dailies = opts.conNivel === false
    ? diasDePrueba().map((d) => ({ ...d, revenue: 1100 }))
    : diasDePrueba();
  const staff: StaffMember[] = equipo.map((e) => ({
    ...e,
    horasMesTrabajadas: desglose.get(e.dni)!.horas,
  }));
  const result = computeLiquidation({
    month: "2026-09", todayISO: "2026-10-01", config, staff, dailies,
    unverifiedDays: 0, observedDays: [], mejorVendedor: null,
  });
  return {
    dailies,
    pago: armarPagoSede({
      businessId: 3, sede: "Centro", month: "2026-09", cerrada: null, result,
      equipo: equipo.map((e) => ({ name: e.name, dni: e.dni, active: true })),
      desglose, sugeridoByte: "TERESA ELENA BRIONES SUAREZ", sugeridoEquipo: "Teresa", avisosPremio: [],
      sincronizadoEn: "2026-10-01T15:00:00Z",
      ventas: {
        meta: 40800, provisional: false, vinculante: false, mesesReferencia: ["2026-06", "2026-07", "2026-08"],
        ventas: 42500, diasConVenta: 30, proyeccion: 42500, avancePct: 104.2, falta: 0, cumple: true, enCamino: true,
      },
      politica: { requiereEquilibrio: false, requiereSupervision: false, trafficFloor: 45 },
    }),
  };
}

export function reporteDePrueba(opts: { conNivel?: boolean } = {}) {
  const { dailies, pago } = pagoDePrueba(opts);
  const progress = computeProgress(config, equipo.map((e) => ({ ...e })), dailies, 30);
  const data: GroupIncentives = {
    month: "2026-09", range: null,
    sedes: [{
      businessId: 3, sede: "Centro", progress, ticketBase: 24.82, mejorVendedor: null,
      mvPeriodStart: null, mvPeriodEnd: null, ultimoRegistro: "2026-09-30", liquidado: false, minMesas: 60, noElegibles: 0, dailies,
    }],
  };
  return armarReporte(data, { month: "2026-09", generadoEn: "x", sedes: [conPremio(pago, "Teresa")], errores: [] }, "Setiembre 2026", "01 oct 2026, 10:00");
}
