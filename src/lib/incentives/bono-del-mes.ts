/**
 * "Tu bono de este mes" — los 3 activadores del bono en un solo lugar · MOTOR (puro).
 *
 * ─── De dónde sale ───
 *
 * Jahnn (16-sep-2026): desde octubre el bono tiene 3 activadores y el
 * administrador tiene que ver los tres igual de claro que hoy ve el ticket.
 * Decisiones:
 *   · El TICKET define el monto (nivel 1, 2, 3). VENTAS y SUPERVISIONES son
 *     requisitos de todo o nada.
 *   · La meta de ventas se llama "Meta de ventas" y no muestra costos.
 *   · Se ve desde setiembre como PRÁCTICA (setiembre se paga con las reglas
 *     de antes: ticket y piso de tráfico).
 *
 * ─── Los semáforos ───
 *
 *   verde — ya está cumplido.
 *   ámbar — todavía no, pero se puede: el mes sigue y va en camino.
 *   rojo  — al ritmo actual no alcanza, o ya no se puede este mes.
 *   gris  — no hay con qué medir (sin días registrados, sin meta).
 *
 * El texto de "qué falta" siempre es concreto y accionable: soles por
 * cliente, soles por día, o qué corregir y en cuántas horas.
 */

import type { EstadoCandadoVentas } from "./candado-ventas";
import type { ResumenSupervisionMes } from "../supervisiones";

export type Semaforo = "verde" | "ambar" | "rojo" | "gris";

export type Activador = {
  clave: "ticket" | "ventas" | "supervision";
  titulo: string;
  semaforo: Semaforo;
  /** La meta, dicha en una línea. */
  meta: string;
  /** Cómo vamos, en una línea. */
  avance: string;
  /** Qué falta (null = nada que hacer). */
  falta: string | null;
  /** 0–100 para la barra, cuando tiene sentido. */
  porcentaje: number | null;
};

export type BonoDelMes = {
  practica: boolean;
  activadores: Activador[];
  /** La línea final: cuánto se cobra o qué falta. */
  titular: string;
  semaforoGeneral: Semaforo;
};

export type EntradaBonoDelMes = {
  /** El mes ya terminó (no se puede recuperar nada). */
  mesCerrado: boolean;
  /** Días que quedan del mes contando hoy (null si el mes no es el actual). */
  diasQueQuedan: number | null;
  /** true = la política del mes todavía no exige ventas ni supervisiones. */
  practica: boolean;
  ticket: {
    diasRegistrados: number;
    actual: number | null;
    /** El primer nivel: es lo que activa el bono (la meta que se muestra). */
    primerNivel: { nombre: string; metaTicket: number } | null;
    /** Nivel logrado y su bono total del equipo. */
    nivelAlcanzado: { nombre: string; bonoEquipo: number } | null;
    /** El siguiente nivel: su ticket meta y cuánto falta. */
    proximo: { nombre: string; metaTicket: number; faltaSoles: number } | null;
  };
  ventas: EstadoCandadoVentas | null;
  supervision: ResumenSupervisionMes | null;
  /** Plazo más cercano de una crítica abierta (ISO), para decir "vence en X h". */
  proximoVencimientoCritica: string | null;
  ahoraISO: string;
};

const soles = (n: number) => `S/${Math.round(n).toLocaleString("es-PE")}`;
const soles2 = (n: number) => `S/${n.toFixed(2)}`;

function activadorTicket(e: EntradaBonoDelMes): Activador {
  const t = e.ticket;
  const metaTexto = t.primerNivel ? `${t.primerNivel.nombre}: ${soles2(t.primerNivel.metaTicket)} por cliente` : "—";
  if (t.actual === null || t.diasRegistrados === 0) {
    return { clave: "ticket", titulo: "Ticket promedio", semaforo: "gris", meta: metaTexto, avance: "Sin días registrados", falta: null, porcentaje: null };
  }
  const avance = `${soles2(t.actual)} por cliente`;
  if (t.nivelAlcanzado) {
    return {
      clave: "ticket", titulo: "Ticket promedio", semaforo: "verde", meta: metaTexto,
      avance: `${avance} · ${t.nivelAlcanzado.nombre} ✓`,
      falta: t.proximo ? `Para ${t.proximo.nombre}: faltan ${soles2(t.proximo.faltaSoles)} por cliente` : null,
      porcentaje: 100,
    };
  }
  const p = t.proximo;
  return {
    clave: "ticket", titulo: "Ticket promedio", semaforo: e.mesCerrado ? "rojo" : "ambar", meta: metaTexto, avance,
    falta: p ? (e.mesCerrado ? `No se llegó a ${p.nombre} (faltaron ${soles2(p.faltaSoles)})` : `Faltan ${soles2(p.faltaSoles)} por cliente para ${p.nombre}`) : null,
    porcentaje: p ? Math.max(0, Math.min(99, Math.round((t.actual / p.metaTicket) * 100))) : null,
  };
}

function activadorVentas(e: EntradaBonoDelMes): Activador {
  const v = e.ventas;
  if (!v || v.meta === null) {
    return { clave: "ventas", titulo: "Meta de ventas", semaforo: "gris", meta: "Aún no se puede calcular", avance: "—", falta: null, porcentaje: null };
  }
  const meta = `${soles(v.meta)} en el mes${v.provisional ? " (provisional)" : ""}`;
  const avance = `${soles(v.ventas)} vendidos (${v.avancePct ?? 0}%)`;
  const porcentaje = Math.min(100, Math.round(v.avancePct ?? 0));
  if (v.cumple) return { clave: "ventas", titulo: "Meta de ventas", semaforo: "verde", meta, avance: `${avance} ✓`, falta: null, porcentaje: 100 };
  const falta = v.falta ?? 0;
  if (e.mesCerrado || e.diasQueQuedan === null) {
    return { clave: "ventas", titulo: "Meta de ventas", semaforo: "rojo", meta, avance, falta: `Faltaron ${soles(falta)}`, porcentaje };
  }
  const porDia = e.diasQueQuedan > 0 ? falta / e.diasQueQuedan : falta;
  return {
    clave: "ventas", titulo: "Meta de ventas", semaforo: v.enCamino ? "ambar" : "rojo", meta, avance,
    falta: `Faltan ${soles(falta)}: ${soles(porDia)} por día en ${e.diasQueQuedan} día(s)` +
      (v.proyeccion !== null ? (v.enCamino ? ` · al ritmo actual se llega (${soles(v.proyeccion)})` : ` · al ritmo actual cerramos en ${soles(v.proyeccion)}: hay que acelerar`) : ""),
    porcentaje,
  };
}

function horasHasta(iso: string, ahora: string): number {
  return (Date.parse(iso) - Date.parse(ahora)) / 3_600_000;
}

function activadorSupervision(e: EntradaBonoDelMes): Activador {
  const s = e.supervision;
  const meta = "Corregir las observaciones críticas en 24 h";
  if (!s) return { clave: "supervision", titulo: "Supervisiones", semaforo: "gris", meta, avance: "—", falta: null, porcentaje: null };
  const visitas = s.visitas === 0 ? "Sin visitas de Juani este mes" : `${s.visitas} visita(s) · ${s.criticas.total} crítica(s)`;
  if (s.estado === "incumplido") {
    return { clave: "supervision", titulo: "Supervisiones", semaforo: "rojo", meta, avance: visitas, falta: `${s.criticas.fueraDePlazo} crítica(s) no se corrigieron a tiempo`, porcentaje: null };
  }
  if (s.estado === "pendiente") {
    const h = e.proximoVencimientoCritica ? horasHasta(e.proximoVencimientoCritica, e.ahoraISO) : null;
    const partes: string[] = [];
    if (s.criticas.enPlazo > 0) partes.push(`Corregir ${s.criticas.enPlazo} crítica(s)${h !== null && h > 0 ? `: la primera vence en ${h < 1 ? "menos de 1 h" : `${Math.floor(h)} h`}` : ""}`);
    if (s.criticas.porConfirmar > 0) partes.push(`${s.criticas.porConfirmar} esperando que Juani confirme`);
    return { clave: "supervision", titulo: "Supervisiones", semaforo: "ambar", meta, avance: visitas, falta: partes.join(" · "), porcentaje: null };
  }
  return { clave: "supervision", titulo: "Supervisiones", semaforo: "verde", meta, avance: `${visitas} ✓`, falta: null, porcentaje: null };
}

export function armarBonoDelMes(e: EntradaBonoDelMes): BonoDelMes {
  const activadores = [activadorTicket(e), activadorVentas(e), activadorSupervision(e)];
  const semaforos = activadores.map((a) => a.semaforo);
  const semaforoGeneral: Semaforo = semaforos.includes("rojo") ? "rojo"
    : semaforos.every((x) => x === "verde") ? "verde"
    : semaforos.includes("gris") && !semaforos.includes("ambar") ? "gris" : "ambar";

  let titular: string;
  if (semaforoGeneral === "verde") {
    titular = `Con los 3 en verde, el bono del equipo este mes es ${soles(e.ticket.nivelAlcanzado?.bonoEquipo ?? 0)} (${e.ticket.nivelAlcanzado?.nombre}).`;
  } else {
    const pendientes = activadores.filter((a) => a.semaforo !== "verde").map((a) => a.titulo.toLowerCase());
    titular = semaforoGeneral === "rojo"
      ? `${e.mesCerrado ? "Este mes no hubo" : "Hoy no alcanza para el"} bono: falta ${pendientes.join(", ")}.`
      : `Para cobrar el bono falta: ${pendientes.join(", ")}.`;
  }
  if (e.practica) titular = `Práctica · ${titular}`;
  return { practica: e.practica, activadores, titular, semaforoGeneral };
}
