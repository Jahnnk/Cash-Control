/**
 * El reporte de Bonos e Incentivos, listo para dibujar · lógica PURA.
 *
 * Pedido de Jahnn (1-oct-2026, cierre de septiembre): Kelly, la gerente de
 * Finanzas, necesita un reporte donde se entienda cómo le fue a cada sede,
 * cuánto se reparte y cuánto le toca a cada persona para hacer las
 * transferencias; y los administradores necesitan entender las metas.
 *
 * Este módulo NO calcula negocio nuevo: toma lo que ya calcularon el panel
 * (`getGroupIncentives`, el mismo cerebro que ve cada admin) y la
 * liquidación (`getPagosDelMes`) y lo ordena para el PDF y el Excel. Así los
 * dos formatos dicen exactamente lo mismo y los dibujantes quedan "tontos".
 */

import { dailyPresencial, type IncentiveLevel } from "./engine";
import { desgloseDeNivel, ejemplosDeBono, type DesgloseNivel } from "./desglose-nivel";
import type { GroupIncentives, SedeIncentives } from "@/app/actions/group-incentives";
import type { PagoColaborador, PagoSede, PagosDelMes } from "./reporte-bonos-tipos";
import type { EstadoCandadoVentas } from "./candado-ventas";

/** Cada sede con su color propio: tienen que distinguirse de un vistazo. */
export const COLOR_SEDE: Record<number, { color: string; suave: string }> = {
  2: { color: "#098B5F", suave: "#E3F1EA" }, // Fonavi · verde
  3: { color: "#B7791F", suave: "#F7EDD5" }, // Centro · ámbar
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export type FilaDia = {
  date: string;
  /** "Lun 01" */
  etiqueta: string;
  personas: number;
  venta: number;
  deliveryPedidos: number;
  deliveryVenta: number;
  personalPedidos: number;
  personalVenta: number;
  /** Ticket del día, solo venta presencial. */
  ticketDia: number | null;
  /** Ticket del programa acumulado del 1 hasta ese día. */
  ticketAcum: number | null;
  /** Ticket acumulado − meta del Nivel 1 (negativo = todavía falta). */
  difNivel1: number | null;
  ventaAcum: number;
  /** Venta acumulada ÷ meta de ventas (0–…). null sin meta. */
  pctMeta: number | null;
};

export type FilaNivel = {
  nombre: string;
  delta: number;
  /** Ticket que hay que alcanzar: base + delta. */
  metaTicket: number;
  /** Lo que se reparte entre el equipo si se alcanza (bonos + premio al mejor vendedor). */
  seReparte: number;
  /** El premio al mejor vendedor en este nivel. */
  premioMv: number;
  /** Cómo se llega a "se reparte": valor por hora, horas del equipo, bonos, administración y premio. null sin pago calculado. */
  desglose: DesgloseNivel | null;
  /** Lo que gana un medio turno de 94 h y un tiempo completo de 192 h en este nivel. */
  ejemplos: { medioTurno: number; tiempoCompleto: number };
  /** El pozo no cubriría esto (alerta): colchón negativo. */
  colchon: number | null;
  alcanzado: boolean;
};

export type SedeReporte = {
  businessId: number;
  sede: string;
  color: string;
  colorSuave: string;
  ticket: {
    actual: number | null;
    base: number;
    delta: number | null;
    nivel: string | null;
    proximo: { nombre: string; falta: number } | null;
    niveles: FilaNivel[];
    /** Avance de cada nivel: levantamiento logrado ÷ levantamiento pedido (100% = nivel logrado). */
    avancePorNivel: (number | null)[];
  };
  ventas: {
    meta: number | null;
    vendido: number;
    avancePct: number | null;
    falta: number | null;
    proyeccion: number | null;
    cumple: boolean;
    enCamino: boolean;
    /** true = si no se cumple, no hay bono; false = solo práctica este mes. */
    vinculante: boolean;
    provisional: boolean;
    mesesReferencia: string[];
  } | null;
  trafico: { personasPorDia: number | null; piso: number | null; cumple: boolean };
  personas: number;
  ventaTotal: number;
  diasConDatos: number;
  dias: FilaDia[];
  pagos: PagoSede | null;
  /** Mejor vendedor del periodo (ranking de Byte por turno). */
  mejorVendedor: SedeIncentives["mejorVendedor"];
  mvPeriodStart: string | null;
  mvPeriodEnd: string | null;
  minMesas: number;
  noElegibles: number;
  /** Las conclusiones en una línea cada una, para la portada. */
  frases: string[];
};

export type LlaveDelMes = { nombre: string; rol: "monto" | "requisito" | "practica" | "no-aplica"; texto: string };

export type ReporteBonos = {
  month: string;
  periodoLabel: string;
  esRango: boolean;
  generadoEn: string;
  sedes: SedeReporte[];
  llaves: LlaveDelMes[];
  /** Total a transferir entre las dos sedes (solo mes completo con pagos). */
  totalARepartir: number | null;
};

const soles = (n: number) => `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const solesEnteros = (n: number) => `S/${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;

/** Lo que se reparte si se alcanzara un nivel, con las horas reales del equipo. */
export function seRepartePorNivel(lines: PagoColaborador[], level: IncentiveLevel, month: string): number {
  return desgloseDeNivel(lines, level, month).total;
}

function filasDelDia(s: SedeIncentives, metaTicket1: number | null, metaVentas: number | null): FilaDia[] {
  let personasAcum = 0;
  let ventaPresAcum = 0;
  let ventaAcum = 0;
  return s.dailies
    .filter((d) => (d.personas ?? 0) > 0 || (d.revenue ?? 0) > 0)
    .map((d) => {
      const pres = dailyPresencial(d);
      const conDatos = (d.personas ?? 0) > 0 && (d.revenue ?? 0) > 0;
      if (conDatos) {
        personasAcum += pres.personas;
        ventaPresAcum += pres.venta;
      }
      ventaAcum += d.revenue ?? 0;
      const ticketAcum = personasAcum > 0 ? r2(ventaPresAcum / personasAcum) : null;
      const dow = new Date(d.date + "T12:00:00Z").getUTCDay();
      return {
        date: d.date,
        etiqueta: `${DIAS[dow]} ${d.date.slice(8, 10)}`,
        personas: d.personas ?? 0,
        venta: d.revenue ?? 0,
        deliveryPedidos: d.deliveryPedidos ?? 0,
        deliveryVenta: d.deliveryVenta ?? 0,
        personalPedidos: d.personalPedidos ?? 0,
        personalVenta: d.personalVenta ?? 0,
        ticketDia: pres.ticket,
        ticketAcum,
        difNivel1: ticketAcum !== null && metaTicket1 !== null ? r2(ticketAcum - metaTicket1) : null,
        ventaAcum: r2(ventaAcum),
        pctMeta: metaVentas ? ventaAcum / metaVentas : null,
      };
    });
}

function ventasDeSede(v: EstadoCandadoVentas | null): SedeReporte["ventas"] {
  if (!v) return null;
  return {
    meta: v.meta,
    vendido: v.ventas,
    avancePct: v.avancePct,
    falta: v.falta,
    proyeccion: v.proyeccion,
    cumple: v.cumple,
    enCamino: v.enCamino,
    vinculante: v.vinculante,
    provisional: v.provisional,
    mesesReferencia: v.mesesReferencia,
  };
}

function frasesDeSede(r: Omit<SedeReporte, "frases">, esRango: boolean): string[] {
  const out: string[] = [];
  const t = r.ticket;
  if (t.actual === null) return ["Sin días registrados en el periodo."];

  const n1 = t.niveles[0];
  if (t.nivel) {
    const proximo = t.proximo ? ` Para ${t.proximo.nombre} faltaron ${soles(t.proximo.falta)} de ticket.` : " Es el nivel más alto.";
    out.push(`El ticket del programa cerró en ${soles(t.actual)}: se alcanzó el ${t.nivel}.${proximo}`);
  } else if (n1) {
    out.push(`El ticket del programa cerró en ${soles(t.actual)}, a ${soles(r2(n1.metaTicket - t.actual))} del Nivel 1 (${soles(n1.metaTicket)}): no se alcanzó ningún nivel.`);
  }

  if (r.ventas && r.ventas.meta !== null) {
    const v = r.ventas;
    const meta = r.ventas.meta;
    const estado = v.cumple ? "se cumplió" : "no se llegó";
    const regla = v.vinculante
      ? v.cumple ? "" : " Sin esta meta no hay bono."
      : " Este mes la meta de ventas es solo de práctica: no cambia el bono. Desde octubre es requisito.";
    out.push(
      `Ventas de ${solesEnteros(v.vendido)} frente a una meta de ${solesEnteros(meta)} (${v.avancePct !== null ? `${v.avancePct.toFixed(1)}%` : "sin avance"}): ${estado}.${regla}`,
    );
  }

  if (!esRango && r.pagos) {
    const n = r.pagos.lines.filter((l) => l.total > 0).length;
    out.push(
      r.pagos.totalBonos > 0
        ? `A repartir: ${solesEnteros(r.pagos.totalBonos)} entre ${n} persona${n === 1 ? "" : "s"}.`
        : "A repartir: S/0. Sin nivel de ticket no se paga bono este mes.",
    );
  }
  return out;
}

export function llavesDelMes(sedes: PagoSede[]): LlaveDelMes[] {
  const ref = sedes[0];
  if (!ref) return [];
  const p = ref.politica;
  const ventasObligatoria = p.requiereEquilibrio;
  return [
    {
      nombre: "Ticket promedio",
      rol: "monto",
      texto: "Define CUÁNTO se gana. Hay tres niveles: cada uno exige subir el ticket sobre la base de la sede y paga un bono mayor.",
    },
    ventasObligatoria
      ? { nombre: "Meta de ventas", rol: "requisito", texto: "Todo o nada: si las ventas del mes no llegan a la meta de la sede, no hay bono aunque el ticket haya subido." }
      : { nombre: "Meta de ventas", rol: "practica", texto: "Este mes es de práctica: se mide y se reporta, pero NO cambia el bono. Desde octubre es requisito (todo o nada)." },
    p.trafficFloor !== null
      ? { nombre: "Piso de tráfico", rol: "requisito", texto: `Mínimo de ${p.trafficFloor} personas por día en promedio para la sede; si no se cumple, la meta de ticket no cuenta.` }
      : { nombre: "Piso de tráfico", rol: "no-aplica", texto: "Ya no existe: desde octubre lo reemplaza la meta de ventas." },
    p.requiereSupervision
      ? { nombre: "Supervisiones", rol: "requisito", texto: "Todo o nada: las observaciones críticas de las visitas de supervisión deben corregirse a tiempo." }
      : { nombre: "Supervisiones", rol: "no-aplica", texto: "Se suma como tercer requisito desde octubre." },
  ];
}

export function armarReporte(
  data: GroupIncentives,
  pagos: PagosDelMes | null,
  periodoLabel: string,
  generadoEn: string,
): ReporteBonos {
  const esRango = data.range !== null;
  const usaPagos = !esRango ? pagos : null;

  const sedes: SedeReporte[] = data.sedes.map((s) => {
    const p = s.progress;
    const pago = usaPagos?.sedes.find((x) => x.businessId === s.businessId) ?? null;
    const ticketBase = s.ticketBase ?? 0;
    const levels = p?.porNivel.map((n) => n.level) ?? [];
    const metaN1 = levels[0] ? r2(ticketBase + levels[0].delta) : null;
    const ventas = ventasDeSede(pago?.ventas ?? null);
    const colores = COLOR_SEDE[s.businessId] ?? { color: "#004C40", suave: "#E3F1EA" };

    const niveles: FilaNivel[] = (p?.porNivel ?? []).map((n) => ({
      nombre: n.level.nombre,
      delta: n.level.delta,
      metaTicket: r2(ticketBase + n.level.delta),
      // Con las horas reales de Planilla cuando hay pagos; si no, lo que calculó el panel.
      seReparte: pago ? seRepartePorNivel(pago.lines, n.level, data.month) : n.sumaBonos,
      premioMv: n.level.premio_mv,
      desglose: pago ? desgloseDeNivel(pago.lines, n.level, data.month) : null,
      ejemplos: ejemplosDeBono(n.level),
      colchon: n.colchon,
      alcanzado: p?.nivelAlcanzado?.nombre === n.level.nombre,
    }));

    const delta = p?.deltaActual ?? null;
    const base = {
      businessId: s.businessId,
      sede: s.sede,
      color: colores.color,
      colorSuave: colores.suave,
      ticket: {
        actual: p?.ticketActual ?? null,
        base: ticketBase,
        delta,
        nivel: p?.nivelAlcanzado?.nombre ?? null,
        proximo: p?.proximoNivel ? { nombre: p.proximoNivel.level.nombre, falta: p.proximoNivel.faltaSoles } : null,
        niveles,
        avancePorNivel: niveles.map((n) => (delta === null || n.delta <= 0 ? null : (delta / n.delta) * 100)),
      },
      ventas,
      trafico: { personasPorDia: p?.traffic.personasPorDia ?? null, piso: p?.traffic.floor ?? null, cumple: p?.traffic.cumple ?? true },
      personas: p?.personas ?? 0,
      ventaTotal: p?.revenue ?? 0,
      diasConDatos: p?.daysLoaded ?? 0,
      dias: filasDelDia(s, metaN1, ventas?.meta ?? null),
      pagos: pago,
      mejorVendedor: s.mejorVendedor,
      mvPeriodStart: s.mvPeriodStart,
      mvPeriodEnd: s.mvPeriodEnd,
      minMesas: s.minMesas,
      noElegibles: s.noElegibles,
    };
    return { ...base, frases: frasesDeSede(base, esRango) };
  });

  const totalARepartir = usaPagos ? r2(usaPagos.sedes.reduce((t, x) => t + x.totalBonos, 0)) : null;
  return {
    month: data.month,
    periodoLabel,
    esRango,
    generadoEn,
    sedes,
    llaves: usaPagos ? llavesDelMes(usaPagos.sedes) : [],
    totalARepartir,
  };
}

/**
 * Le suma el premio al mejor vendedor a las cifras de un pago, sin volver a
 * consultar nada. `nombre` es una persona del equipo (null = sin premio).
 *
 * Si el mes ya está cerrado se respeta el acta: ahí el premio ya quedó
 * decidido y congelado. Sin nivel de ticket tampoco hay premio.
 */
export function conPremio(p: PagoSede, nombre: string | null): PagoSede {
  if (p.fuente === "acta") return p;
  const premioNivel = p.nivel ? p.premioDelNivel : 0;
  const lines = p.lines.map((l) => {
    const premio =
      nombre !== null && premioNivel > 0 && l.name.trim().toUpperCase() === nombre.trim().toUpperCase() ? premioNivel : 0;
    return { ...l, premioMv: premio, total: r2(l.bono + premio) };
  });
  const premio = r2(lines.reduce((t, l) => t + l.premioMv, 0));
  // El aviso "sin mejor vendedor" depende de quién esté elegido AHORA.
  const avisos = p.warnings.filter((w) => !w.startsWith("Sin mejor vendedor asignado"));
  if (p.nivel && premio === 0) {
    avisos.push("Sin mejor vendedor asignado: el premio no se paga este mes.");
  }
  return {
    ...p,
    lines,
    totalBonos: r2(lines.reduce((t, l) => t + l.total, 0)),
    mejorVendedor: { ...p.mejorVendedor, usado: premio > 0 ? nombre : null, premio },
    warnings: avisos,
  };
}
