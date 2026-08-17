/**
 * Propuestas de Highlight — pedido de Jahnn (17-ago-2026).
 *
 * "Quién mejor que ellos que están en la operación diaria para darse
 *  cuenta en lo que se debe mejorar."
 *
 * El administrador propone; dirección aprueba. Un Highlight propuesto
 * NO es un Highlight hasta que Jahnn o Juani lo aprueban — por eso vive
 * en su propia tabla y no toca la regla de "uno por sede y día".
 *
 * Acá va la lógica pura: qué estado tiene una propuesta, si es válida,
 * y a qué día correr el Highlight que se desplaza. Sin base de datos,
 * para poder probar cada regla suelta.
 */

import { MAX_TEXTO, MAX_POR_QUE, validarTexto } from "./highlight";

export type EstadoPropuesta = "pendiente" | "aprobada" | "rechazada" | "caducada";

export type Propuesta = {
  id: string;
  businessId: number;
  sede: string;
  fecha: string;
  texto: string;
  porQue: string | null;
  propuestaPor: string;
  /** Lo guardado en la BD: nunca vale "caducada". */
  estado: "pendiente" | "aprobada" | "rechazada";
  resueltaPor: string | null;
  motivo: string | null;
  creadoEn: string;
};

/**
 * El estado que se MUESTRA, que no siempre es el guardado.
 *
 * "Caducada" no se guarda en la base a propósito: es (pendiente + el
 * día ya pasó). Guardarla obligaría a un proceso que barra la tabla
 * cada madrugada, y un estado que depende del reloj empieza a mentir
 * apenas ese proceso falle un día. Deducirlo no puede desincronizarse.
 *
 * Decisión de Jahnn: la propuesta que nadie respondió a tiempo caduca
 * y queda el registro. No se auto-aprueba — eso rompería justo lo que
 * pidió, que ningún Highlight entre al local sin que él lo vea.
 */
export function estadoEfectivo(
  p: { estado: "pendiente" | "aprobada" | "rechazada"; fecha: string },
  hoy: string,
): EstadoPropuesta {
  if (p.estado === "pendiente" && p.fecha < hoy) return "caducada";
  return p.estado;
}

export const ETIQUETA_PROPUESTA: Record<EstadoPropuesta, string> = {
  pendiente: "Esperando aprobación",
  aprobada: "Aprobada",
  rechazada: "No aprobada",
  caducada: "No alcanzó a aprobarse",
};

/**
 * ¿Sirve esta propuesta para guardarla?
 *
 * La fecha puede ser HOY o más adelante (decisión de Jahnn): si el
 * administrador ve algo a las 10am, tiene que poder proponerlo para el
 * mismo día. Hacia atrás no: no se propone mejorar el martes pasado.
 */
export function validarPropuesta(input: {
  texto: string;
  porQue?: string | null;
  fecha: string;
  hoy: string;
}): { ok: true; texto: string; porQue: string | null } | { ok: false; error: string } {
  const t = validarTexto(input.texto);
  if (!t.ok) return t;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    return { ok: false, error: "Elige para qué día es la propuesta." };
  }
  if (input.fecha < input.hoy) {
    return { ok: false, error: "No se puede proponer un Highlight para un día que ya pasó." };
  }

  const pq = (input.porQue ?? "").trim();
  if (pq.length > MAX_POR_QUE) {
    return { ok: false, error: `El "por qué importa" no debe pasar de ${MAX_POR_QUE} caracteres.` };
  }

  return { ok: true, texto: t.texto, porQue: pq === "" ? null : pq };
}

export const MAX_MOTIVO = 300;

/** El motivo del rechazo es opcional, pero si viene tiene que caber. */
export function validarMotivo(motivo: string): { ok: true; motivo: string | null } | { ok: false; error: string } {
  const m = (motivo ?? "").trim();
  if (m.length > MAX_MOTIVO) {
    return { ok: false, error: `El motivo no debe pasar de ${MAX_MOTIVO} caracteres.` };
  }
  return { ok: true, motivo: m === "" ? null : m };
}

/**
 * A qué día correr el Highlight que se desplaza.
 *
 * Jahnn dijo: "si considero que el highlight propuesto tiene mayor
 * prioridad que alguno que yo haya programado, lo colocaré y correré a
 * otro día el que ya estaba". Esto solo SUGIERE el primer día libre —
 * la última palabra es de él, porque mover una tarea de sitio es una
 * decisión de negocio, no un hueco de calendario.
 *
 * Nunca sugiere un día anterior a `desde`: correr una tarea hacia atrás
 * sería crearla ya vencida.
 */
export function siguienteDiaLibre(desde: string, ocupados: string[], maxDias = 30): string | null {
  const tomados = new Set(ocupados);
  for (let i = 1; i <= maxDias; i++) {
    const cand = sumarDias(desde, i);
    if (!tomados.has(cand)) return cand;
  }
  return null;
}

function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(
    f.getUTCDate(),
  ).padStart(2, "0")}`;
}

export type ResumenBandeja = {
  /** Lo que hay que responder ahora. */
  porRevisar: number;
  /** De esas, las que son para HOY: si no se responden, se pierden. */
  paraHoy: number;
  /** Las que ya se pasaron de fecha sin respuesta. El espejo honesto. */
  caducadas: number;
};

/**
 * Qué tiene dirección en la bandeja.
 *
 * `caducadas` se muestra a propósito aunque incomode: es el dato sobre
 * el propio tiempo de respuesta de Jahnn. Si un administrador propone y
 * nadie le contesta, deja de proponer — y esta feature se muere sola.
 */
export function resumenBandeja(propuestas: Propuesta[], hoy: string): ResumenBandeja {
  let porRevisar = 0, paraHoy = 0, caducadas = 0;
  for (const p of propuestas) {
    const e = estadoEfectivo(p, hoy);
    if (e === "pendiente") {
      porRevisar++;
      if (p.fecha === hoy) paraHoy++;
    } else if (e === "caducada") {
      caducadas++;
    }
  }
  return { porRevisar, paraHoy, caducadas };
}

export { MAX_TEXTO, MAX_POR_QUE };
