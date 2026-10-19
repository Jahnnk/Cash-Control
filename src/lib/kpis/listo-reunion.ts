/**
 * ¿Llego a la reunión con los datos completos y fiables? · lógica PURA (19-oct-2026).
 *
 * Pedido de Jahnn: el sistema ya dice «datos al día con el Excel de Kelly»; faltaba lo mismo para lo que suben
 * los administradores (KPIs diarios y el reporte semanal del sábado) en el rango del reporte. Reutiliza
 * `evaluarLlenado` (el mismo cerebro del cuadro semanal y del panel de cada administrador) y
 * `evaluarReportesSemanales` (los archivos del sábado), y suma lo que el deck imprime y ninguna otra pantalla
 * cruzaba: que el reporte de Byte llegue hasta el último día, que NPS, mermas y tiempos no estén a medias y que
 * lo que tecleó el administrador coincida con Byte.
 *
 *   falta  = el deck saldría con un hueco o un dato dudoso → hay que pedirlo antes de la reunión
 *   aviso  = el dato está pero conviene revisarlo (ej. el panel no coincide con Byte)
 *   info   = contexto que no bloquea (el Excel de Kelly llega los viernes)
 */

import { evaluarLlenado, etiquetaDia, type FilaDia, type SedeInfo } from "./llenado";
import { evaluarReportesSemanales, type CargaRegistrada } from "../incentivos/reportes-semanales";

export type Nivel = "falta" | "aviso" | "info";
export type Tema = "ventas" | "nps" | "mermas" | "tiempos" | "byte" | "archivos" | "panel-vs-byte" | "excel";
export type Hallazgo = { nivel: Nivel; tema: Tema; titulo: string; detalle: string };
export type EstadoSede = "listo" | "aviso" | "falta";

export type DiaEntrada = {
  fecha: string;
  venta: number | null;
  personas: number | null;
  nps: number | null;
  mermas: number | null;
  /** ¿Hay algún tiempo de atención (mostrador o mesa) medido ese día? */
  conTiempos: boolean;
};

export type SedeEntrada = {
  info: SedeInfo;
  dias: DiaEntrada[];
  /** Venta diaria del reporte de Byte (la oficial), dentro del rango. */
  byte: { fecha: string; total: number }[];
  /** Último día cubierto por el reporte de Byte subido. */
  byteHasta: string | null;
  /** Las cargas de archivos de la sede (para «se subió esta semana»). */
  cargas: CargaRegistrada[];
  /** Hasta qué día llega el Excel de Kelly. */
  excelHasta: string | null;
};

export type SedeListo = {
  businessId: number;
  sede: string;
  estado: EstadoSede;
  hallazgos: Hallazgo[];
};

export type ListoReunion = {
  start: string;
  end: string;
  hoy: string;
  sedes: SedeListo[];
  listo: boolean;
  faltas: number;
  avisos: number;
  /** Una frase para el titular. */
  resumen: string;
};

/** Lo que el panel y Byte pueden diferir sin que sea un problema (redondeos, propinas): S/5, como la verificación del Excel. */
export const TOLERANCIA_PANEL_BYTE = 5;

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const lista = (ds: string[]) => ds.map(etiquetaDia).join(", ");
const mover = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Todas las fechas del rango, en orden. */
function fechasDelRango(start: string, end: string): string[] {
  const out: string[] = [];
  for (let f = start; f <= end && out.length < 62; f = mover(f, 1)) out.push(f);
  return out;
}

function evaluarSede(s: SedeEntrada, start: string, end: string, hoy: string): SedeListo {
  const h: Hallazgo[] = [];
  const fechas = fechasDelRango(start, end);

  // ── 1 · Los días: venta registrada (el mismo cerebro del cuadro semanal, de a 7 días) ──
  const filas: FilaDia[] = s.dias.map((d) => ({ businessId: s.info.businessId, fecha: d.fecha, revenue: d.venta, nps: d.nps, mermas: d.mermas }));
  const evaluados = [];
  for (let i = 0; i < fechas.length; i += 7) {
    evaluados.push(...(evaluarLlenado({ weekStart: fechas[i], hoy, sedes: [s.info], filas }).sedes[0]?.dias ?? []));
  }
  const dias = evaluados.filter((d) => d.fecha >= start && d.fecha <= end);
  const sinVenta = dias.filter((d) => d.estado === "falta").map((d) => d.fecha);
  if (sinVenta.length) h.push({ nivel: "falta", tema: "ventas", titulo: "Días sin registrar", detalle: `Sin venta registrada: ${lista(sinVenta)}. Ese día queda vacío en los KPIs del deck.` });

  // Los demás datos se esperan solo los días que SÍ hubo operación y venta.
  const conVenta = dias.filter((d) => d.estado === "lleno" || d.estado === "incompleto").map((d) => d.fecha);
  const porFecha = new Map(s.dias.map((d) => [d.fecha, d]));
  const sin = (f: (d: DiaEntrada) => boolean) => conVenta.filter((fe) => { const d = porFecha.get(fe); return d ? f(d) : false; });
  const faltaTexto = (tema: Tema, titulo: string, fechasSin: string[], efecto: string) => {
    if (fechasSin.length === 0) return;
    h.push({ nivel: "falta", tema, titulo: `${titulo}: ${conVenta.length - fechasSin.length} de ${conVenta.length} días`, detalle: `Falta ${lista(fechasSin)}. ${efecto}` });
  };
  if (s.info.esCafeteria) {
    faltaTexto("nps", "NPS", sin((d) => d.nps == null), "El NPS de la semana sale de los días cargados, no de la semana completa.");
    faltaTexto("tiempos", "Tiempos de atención", sin((d) => !d.conTiempos), "El KPI de tiempos del deck queda sin esos días.");
  }
  // Mermas: las cafeterías y también Atelier (el deck muestra mermas de Atelier).
  faltaTexto("mermas", "Mermas", sin((d) => d.mermas == null), "Las mermas de la semana quedan incompletas.");

  // ── 2 · Byte: que el reporte llegue hasta el último día cerrado del rango ──
  const ultimoCerrado = end < hoy ? end : mover(hoy, -1);
  if (ultimoCerrado >= start) {
    if (s.byteHasta === null || s.byteHasta < ultimoCerrado) {
      h.push({
        nivel: "falta", tema: "byte", titulo: "Reporte de ventas de Byte atrasado",
        detalle: s.byteHasta ? `Llega hasta el ${ddmm(s.byteHasta)}; el rango termina el ${ddmm(ultimoCerrado)}. Hay que subir el reporte «Ventas de OCTUBRE» de Byte.` : "No hay ningún reporte de ventas de Byte subido.",
      });
    }
  }

  // ── 3 · Lo que tecleó el administrador contra Byte (la oficial) ──
  const byte = new Map(s.byte.map((b) => [b.fecha, b.total]));
  const distintos: string[] = [];
  for (const d of s.dias) {
    const b = byte.get(d.fecha);
    if (d.venta != null && b != null && Math.abs(d.venta - b) >= TOLERANCIA_PANEL_BYTE && d.fecha >= start && d.fecha <= end) {
      distintos.push(`${etiquetaDia(d.fecha)}: panel ${soles(d.venta)}, Byte ${soles(b)}`);
    }
  }
  if (distintos.length) h.push({ nivel: "aviso", tema: "panel-vs-byte", titulo: `El panel no coincide con Byte en ${distintos.length} ${distintos.length === 1 ? "día" : "días"}`, detalle: `${distintos.join(" · ")}. El ticket y las personas del deck salen del panel: conviene corregirlo con el administrador.` });

  // ── 4 · Los archivos del sábado: ¿se subió el de la semana que cierra este rango? ──
  const semanal = evaluarReportesSemanales(s.cargas, end < hoy ? end : hoy, s.info.businessId);
  if (semanal.faltan.length) {
    const nombres = semanal.faltan.map((f) => f.nombre).join(", ");
    h.push({ nivel: "falta", tema: "archivos", titulo: "Faltan archivos del sábado", detalle: `Sin subir desde el sábado ${ddmm(semanal.sabado)}: ${nombres}.` });
  }

  // ── 5 · El Excel de Kelly: contexto, no bloquea (ella entrega los viernes) ──
  if (s.excelHasta !== null && s.excelHasta < end) {
    h.push({ nivel: "info", tema: "excel", titulo: "Excel de Kelly", detalle: `Llega hasta el ${ddmm(s.excelHasta)}; los gastos y la caja de la semana quedan hasta ahí.` });
  }

  const estado: EstadoSede = h.some((x) => x.nivel === "falta") ? "falta" : h.some((x) => x.nivel === "aviso") ? "aviso" : "listo";
  return { businessId: s.info.businessId, sede: s.info.sede, estado, hallazgos: h };
}

export function listoParaLaReunion(input: { start: string; end: string; hoy: string; sedes: SedeEntrada[] }): ListoReunion {
  const sedes = input.sedes.map((s) => evaluarSede(s, input.start, input.end, input.hoy));
  const faltas = sedes.reduce((t, s) => t + s.hallazgos.filter((x) => x.nivel === "falta").length, 0);
  const avisos = sedes.reduce((t, s) => t + s.hallazgos.filter((x) => x.nivel === "aviso").length, 0);
  const listo = faltas === 0 && avisos === 0;
  const conPendientes = sedes.filter((s) => s.estado !== "listo").map((s) => s.sede);
  const resumen = listo
    ? "Llegas con los datos completos de las tres sedes."
    : `${faltas > 0 ? `${faltas} ${faltas === 1 ? "dato por completar" : "datos por completar"}` : `${avisos} ${avisos === 1 ? "aviso" : "avisos"} por revisar`}${faltas > 0 && avisos > 0 ? ` y ${avisos} ${avisos === 1 ? "aviso" : "avisos"}` : ""} · ${conPendientes.join(", ")}.`;
  return { start: input.start, end: input.end, hoy: input.hoy, sedes, listo, faltas, avisos, resumen };
}
