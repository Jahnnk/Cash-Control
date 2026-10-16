/**
 * El triángulo del valor · MOTOR (puro).
 *
 * Marco de la asesoría del coach (Jahnn, 16-oct-2026): la secuencia OBLIGATORIA que debe seguir un negocio
 * antes de pensar en marketing o en vender más:
 *
 *   1. GENERAR valor    — entender el negocio: qué se ofrece de verdad y en qué se diferencia (no competir por precio bajo).
 *   2. ENTREGAR valor   — con consistencia: procesos, roles, comunicación, control de mermas e ineficiencias.
 *   3. CAPTURAR valor   — finanzas: precios piso (food cost × 3), los cuatro motores del EBITDA, el reparto
 *                         33-33-33 y la reserva semanal de Profit First.
 *
 * Lo que el sistema puede y no puede comprobar:
 *   · La propuesta de valor y la diferenciación son estratégicas: NO las mide el sistema. Lo que sí ve son
 *     señales de que el cliente percibe el valor: NPS, ticket promedio y si la carta se vende sobre su piso
 *     de precio (no por precio bajo).
 *   · Entregar = el motor 4 del EBITDA (mermas, tiempos, registro, reportes, Highlight, supervisiones).
 *   · Capturar = precios piso, EBITDA contra su meta, costos fijos y planilla, y lo apartado para utilidades.
 *
 * Cada paso toma el PEOR estado de sus señales con dato (sin dato = gris, nunca rojo inventado). El «paso
 * actual» es el primero que no está en verde: ahí está el cuello de botella antes de empujar ventas.
 */

import { PLANILLA_SANA_MIN_PCT, TOPE_PLANILLA_PCT, type FilaProfitFirst, type FilaRegla } from "./regla-33";
import { peorEstado, type EstadoMotor, type Motores, type Senal } from "./motores-ebitda";
import type { PisoSede } from "./productos/piso-precios";

export type ClavePaso = "generar" | "entregar" | "capturar";

export type PasoTriangulo = {
  clave: ClavePaso;
  numero: 1 | 2 | 3;
  titulo: string;
  /** Qué significa el paso, en una frase. */
  pregunta: string;
  estado: EstadoMotor;
  senales: Senal[];
};

export type Triangulo = {
  pasos: PasoTriangulo[];
  /** El primer paso que no está en verde (el cuello de botella); null = los tres en verde o sin dato. */
  actual: ClavePaso | null;
  /** Qué hacer ahora, en una o dos frases. */
  mensaje: string;
};

const pct = (n: number) => `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

/** Margen bruto sano de la carta (lib/productos/piso-precios.ts): de 65% a 70% o más. */
const MARGEN_SANO = 65;

const MENSAJE: Record<ClavePaso, string> = {
  generar: "Antes de crecer, refuerza el valor que percibe el cliente (NPS, ticket y precios sostenidos). No empujes ventas ni compitas por precio bajo.",
  entregar: "El valor no llega con consistencia: ordena los procesos (mermas, tiempos, registro y supervisiones) antes de invertir en marketing o vender más.",
  capturar: "El valor se está yendo antes de llegar a la caja: corrige precios piso, costos fijos y la reserva de Profit First antes de buscar más ventas.",
};

export function trianguloDelValor(e: { motores: Motores | null; regla: FilaRegla | null; profit: FilaProfitFirst | null; piso: PisoSede | null }): Triangulo {
  // ── 1. Generar valor: señales de que el cliente percibe el valor ──
  const generar: Senal[] = [...(e.motores?.senalesValor ?? [])];
  if (e.piso && e.piso.ventasBajoPct !== null) {
    const sostenido = 100 - e.piso.ventasBajoPct;
    generar.push({
      clave: "precios", etiqueta: "Precios sostenidos", paso: "generar",
      estado: sostenido >= 90 ? "verde" : sostenido >= 75 ? "ambar" : "rojo",
      detalle: `${pct(sostenido)} de lo vendido está sobre el piso (${e.piso.bajo} de ${e.piso.conCosto} productos bajo el piso)`,
    });
  }

  // ── 2. Entregar valor con consistencia: el motor 4 (eficiencia del sistema) ──
  const ef = e.motores?.motores.find((m) => m.clave === "eficiencia");
  const entregar: Senal[] = ef?.senales ?? [];

  // ── 3. Capturar valor: finanzas ──
  const capturar: Senal[] = [];
  if (e.piso && e.piso.margenCartaPct !== null) {
    capturar.push({
      clave: "margen", etiqueta: "Margen bruto de la carta", paso: "entregar",
      estado: e.piso.margenCartaPct >= MARGEN_SANO ? "verde" : e.piso.margenCartaPct >= MARGEN_SANO - 5 ? "ambar" : "rojo",
      detalle: `${pct(e.piso.margenCartaPct)} · lo sano es ${MARGEN_SANO}–70% o más`,
    });
  }
  const r = e.regla;
  if (r?.ebitda && r.termometro) {
    capturar.push({
      clave: "ebitda", etiqueta: "EBITDA", paso: "entregar",
      estado: r.termometro === "eficiente" ? "verde" : r.termometro === "en_camino" ? "ambar" : "rojo",
      detalle: `${pct(r.ebitda.pct)} · meta ${Math.round(r.ebitda.metaPct)}%`,
    });
  }
  if (r?.fijos && r.planilla) {
    capturar.push({
      clave: "fijos", etiqueta: "Costos fijos y planilla", paso: "entregar",
      estado: r.fijos.pct <= r.fijos.metaPct && r.planilla.estado !== "alta" ? "verde" : r.fijos.pct <= r.fijos.metaPct + 5 && r.planilla.pct <= TOPE_PLANILLA_PCT + 5 ? "ambar" : "rojo",
      detalle: `fijos ${pct(r.fijos.pct)} (meta ${Math.round(r.fijos.metaPct)}%) · planilla ${pct(r.planilla.pct)} (sano ${PLANILLA_SANA_MIN_PCT}–${TOPE_PLANILLA_PCT}%)`,
    });
  }
  if (e.profit?.apartado && e.profit.estado) {
    capturar.push({
      clave: "profit", etiqueta: "Reserva Profit First", paso: "entregar",
      estado: e.profit.estado === "cumple" ? "verde" : e.profit.estado === "parcial" ? "ambar" : "rojo",
      detalle: `apartado ${pct(e.profit.apartado.pct)} de la venta · meta ${pct(e.profit.utilidadPct)}`,
    });
  }

  const pasos: PasoTriangulo[] = [
    { clave: "generar", numero: 1, titulo: "Generar valor", pregunta: "¿El cliente percibe el valor y paga por él?", estado: peorEstado(generar.map((s) => s.estado)), senales: generar },
    { clave: "entregar", numero: 2, titulo: "Entregar valor", pregunta: "¿Se entrega con consistencia, mes a mes?", estado: peorEstado(entregar.map((s) => s.estado)), senales: entregar },
    { clave: "capturar", numero: 3, titulo: "Capturar valor", pregunta: "¿Ese valor se convierte en plata que se queda?", estado: peorEstado(capturar.map((s) => s.estado)), senales: capturar },
  ];

  // El cuello de botella: el primer paso que no está en verde (los grises no se afirman ni se acusan).
  const actual = pasos.find((p) => p.estado === "ambar" || p.estado === "rojo")?.clave ?? null;
  const sinDato = pasos.filter((p) => p.estado === "gris").map((p) => p.titulo.toLowerCase());
  const mensaje = actual
    ? MENSAJE[actual]
    : sinDato.length === pasos.length
      ? "Todavía no hay datos para ubicar el paso en el que estás."
      : `Los pasos que se pueden medir están en verde${sinDato.length ? ` (sin dato en ${sinDato.join(" y ")})` : ""}: ya se puede pensar en crecer.`;
  return { pasos, actual, mensaje };
}
