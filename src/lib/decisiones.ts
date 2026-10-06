/**
 * Matriz de decisión · MOTOR (puro).
 *
 * Pedido de Jahnn (6-oct-2026, capítulo «Convierte números en decisiones»): cada pregunta que se
 * hace como dueño —¿puedo retirar?, ¿puedo contratar?, ¿ajusto precios?, ¿puedo reinvertir?,
 * ¿compro inventario?— tiene una respuesta en sus números. Siempre en el mismo orden del libro:
 * el NÚMERO primero, luego la INTERPRETACIÓN, luego la ACCIÓN.
 *
 * Decisiones de Jahnn para adaptar el libro a cafeterías que viven de la venta diaria:
 *   · Plata libre = banco + efectivo + fondos mutuos + lo que deja el mes − cuotas − reserva.
 *     (El libro resta los pagos de 30 días sin sumar lo que entra: a una cafetería le diría
 *     «no» siempre, porque en el banco tiene días, no meses, de costos fijos.)
 *   · Reserva mínima: 4 semanas de costos fijos (la del libro), cambiable por sede.
 *   · Los fondos mutuos cuentan como reserva; su saldo lo anota Jahnn.
 */

import { analizarEquilibrio, type AnalisisEquilibrio } from "./equilibrio";

export type Semaforo = "verde" | "ambar" | "rojo" | "gris";
export type Pregunta = "retirar" | "contratar" | "precios" | "reinvertir" | "inventario";

export const ORDEN_PREGUNTAS: Pregunta[] = ["retirar", "contratar", "precios", "reinvertir", "inventario"];

/** La matriz del libro: qué número mirar y qué señal es verde o de precaución. */
export const PREGUNTAS: Record<Pregunta, { titulo: string; numeroClave: string; verde: string; precaucion: string }> = {
  retirar: { titulo: "¿Puedo retirar dinero?", numeroClave: "Plata libre", verde: "Plata libre mayor que lo que quieres retirar", precaucion: "La plata libre no alcanza: retirar se come la reserva o los pagos" },
  contratar: { titulo: "¿Puedo contratar o sumar un gasto fijo?", numeroClave: "Nuevo punto de equilibrio", verde: "Las ventas de hoy ya cubren el nuevo piso", precaucion: "Hace falta vender 30% más o más para cubrirlo" },
  precios: { titulo: "¿Necesito ajustar precios?", numeroClave: "Margen de contribución", verde: "El margen cubre los gastos y deja ganancia", precaucion: "El margen no alcanza para cubrir los gastos" },
  reinvertir: { titulo: "¿Puedo reinvertir en el negocio?", numeroClave: "Reserva en semanas de costos fijos", verde: "Más de 8 semanas de costos fijos guardadas", precaucion: "Menos de 4 semanas de costos fijos" },
  inventario: { titulo: "¿Puedo comprar inventario o insumos?", numeroClave: "Plata libre (y rotación)", verde: "Hay plata libre y el insumo rota en menos de 30 días", precaucion: "No hay plata libre: la compra usaría la plata de los pagos" },
};

/** Lo que el sistema sabe de una sede para responder. */
export type DatosDecision = {
  businessId: number;
  sede: string;
  /** Lectura real del banco que anotó Kelly en su Excel (null = no hay). */
  banco: number | null;
  efectivo: number;
  /** Fecha de la última lectura del banco (subida del Excel). */
  bancoAl: string | null;
  /** Saldo de los fondos mutuos que anotó Jahnn (null = no anotado). */
  fondos: number | null;
  fondosAl: string | null;
  /** Costos fijos de un mes típico (promedio de los meses cerrados). */
  fijosMes: number;
  /** Costos variables como fracción de lo vendido. */
  varRatio: number;
  /** Venta de un mes (típico, o proyectado si el mes ya tiene una semana cargada). */
  ventasMes: number;
  ticket: number | null;
  /** Cuotas de préstamos y tarjetas de un mes (promedio de los últimos meses cerrados). */
  cuotasMes: number;
  diasDelMes: number;
  /** Reserva mínima: monto en soles y cómo se definió. */
  reserva: { monto: number; como: string };
  /** Para «¿ajusto precios?»: % de variables y fijos de los últimos 3 meses cerrados contra los 3 anteriores. */
  tendencias: { varAntes: number | null; varAhora: number | null; fijosAntes: number | null; fijosAhora: number | null };
};

export type Paso = { etiqueta: string; valor: number; op: "+" | "−" | "=" | "÷" | "" };

export type Respuesta = {
  pregunta: Pregunta;
  semaforo: Semaforo;
  /** La respuesta corta: «Sí, hasta S/2,367», «Espera», «Todavía no». */
  veredicto: string;
  /** El número clave, ya escrito. */
  numero: string;
  interpretacion: string;
  accion: string;
  /** La cuenta, paso a paso (para que se vea de dónde sale). */
  pasos: Paso[];
};

/** Semanas de un mes (para pasar costos fijos mensuales a semanales). */
export const SEMANAS_POR_MES = 30 / 7;
export const SEMANAS_RESERVA_POR_DEFECTO = 4;
/** El libro: verde con más de 8 semanas de costos fijos guardadas, precaución con menos de 4. */
export const SEMANAS_REINVERTIR_VERDE = 8;
export const SEMANAS_REINVERTIR_MIN = 4;
/** El libro: precaución si para cubrir el gasto nuevo hay que vender 30% más. */
export const MAX_VENTAS_EXTRA_PCT = 30;
/** Ganancia mínima sana sobre lo vendido para no tener que mirar precios (10%). */
export const GANANCIA_SANA_PCT = 10;
/** Cuánto tienen que subir los insumos (en puntos de % sobre ventas) o los fijos (en %) para avisar. */
export const ALZA_INSUMOS_PUNTOS = 3;
export const ALZA_FIJOS_PCT = 10;
/** Sueldo de ejemplo para la fila «¿puedo contratar?» de la matriz (en la calculadora se cambia). */
export const SUELDO_EJEMPLO = 1500;

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const conSigno = (n: number) => `${n < 0 ? "−" : ""}${soles(n)}`;
const pct = (n: number, dec = 1) => `${n.toLocaleString("es-PE", { maximumFractionDigits: dec })}%`;

/** La reserva mínima de una sede: el monto fijo si lo hay; si no, N semanas de costos fijos. */
export function reservaDe(fijosMes: number, config: { semanas: number | null; monto: number | null } | null): { monto: number; como: string } {
  if (config?.monto !== null && config?.monto !== undefined) return { monto: Math.round(config.monto), como: `monto fijo de ${soles(config.monto)}` };
  const semanas = config?.semanas ?? SEMANAS_RESERVA_POR_DEFECTO;
  return { monto: Math.round((fijosMes / SEMANAS_POR_MES) * semanas), como: `${semanas.toLocaleString("es-PE")} semanas de costos fijos` };
}

function equilibrio(d: DatosDecision): AnalisisEquilibrio {
  return analizarEquilibrio({ fijos: d.fijosMes, varRatio: d.varRatio, ventas: d.ventasMes, ticket: d.ticket, diasDelMes: d.diasDelMes, financiamiento: d.cuotasMes });
}

/** Lo que hay guardado: banco + efectivo + fondos mutuos. */
export const disponible = (d: DatosDecision) => (d.banco ?? 0) + d.efectivo + (d.fondos ?? 0);

// ─── ¿Puedo retirar dinero? ─────────────────────────────────────────────

export function puedoRetirar(d: DatosDecision): Respuesta {
  const a = equilibrio(d);
  if (d.banco === null) return sinDatos("retirar", "Falta la lectura del banco del Excel de esta sede.");
  const flujoMes = (a.utilidad ?? 0) - d.cuotasMes;
  const libre = disponible(d) + flujoMes - d.reserva.monto;
  const pasos: Paso[] = [
    { etiqueta: "En el banco (lectura del Excel)", valor: d.banco, op: "" },
    { etiqueta: "Efectivo", valor: d.efectivo, op: "+" },
    { etiqueta: d.fondos === null ? "Fondos mutuos (sin anotar)" : "Fondos mutuos", valor: d.fondos ?? 0, op: "+" },
    { etiqueta: "Lo que deja un mes (ventas × margen − costos fijos)", valor: a.utilidad ?? 0, op: "+" },
    { etiqueta: "Cuotas de préstamos y tarjetas del mes", valor: d.cuotasMes, op: "−" },
    { etiqueta: `Reserva mínima (${d.reserva.como})`, valor: d.reserva.monto, op: "−" },
    { etiqueta: "Plata libre", valor: libre, op: "=" },
  ];
  if (libre > 0) {
    return {
      pregunta: "retirar", semaforo: "verde", veredicto: `Sí, hasta ${soles(libre)}`, numero: conSigno(libre), pasos,
      interpretacion: `Después de los pagos del mes y de dejar la reserva intacta, quedan ${soles(libre)} libres.`,
      accion: `Puedes retirar hasta ${soles(libre)} sin comprometer la operación. Más que eso se come la reserva.`,
    };
  }
  const cubrePagos = disponible(d) + flujoMes > 0;
  return {
    pregunta: "retirar", semaforo: cubrePagos ? "ambar" : "rojo", veredicto: cubrePagos ? "Espera" : "No", numero: conSigno(libre), pasos,
    interpretacion: cubrePagos
      ? `Alcanza para los pagos del mes, pero retirar dejaría la reserva ${soles(-libre)} por debajo de lo que definiste.`
      : `Lo que hay más lo que deja el mes no alcanza para los pagos: faltan ${soles(disponible(d) + flujoMes)}.`,
    accion: cubrePagos
      ? "No retires este mes: primero completa la reserva."
      : "No retires. El problema no es de caja sino de resultado: revisa el punto de equilibrio y las cuotas.",
  };
}

// ─── ¿Puedo contratar o sumar un gasto fijo? ───────────────────────────

export function puedoContratar(d: DatosDecision, costoMensual = SUELDO_EJEMPLO, que = "un sueldo"): Respuesta {
  const a = equilibrio(d);
  if (a.mc === null || a.mc <= 0) return sinDatos("contratar", "Sin margen de contribución: cada venta pierde plata, no hay piso que calcular.");
  const peAntes = d.fijosMes / a.mc;
  const peNuevo = (d.fijosMes + costoMensual) / a.mc;
  const ventasExtra = costoMensual / a.mc;
  const faltaPct = ((peNuevo - d.ventasMes) / d.ventasMes) * 100;
  const holgura = a.utilidad ?? 0;
  const porDia = a.mcVenta ? costoMensual / a.mcVenta / d.diasDelMes : null;
  const pasos: Paso[] = [
    { etiqueta: "Costos fijos de hoy", valor: d.fijosMes, op: "" },
    { etiqueta: `Gasto nuevo (${que})`, valor: costoMensual, op: "+" },
    { etiqueta: `Nuevo punto de equilibrio (÷ margen ${pct(a.mc * 100)})`, valor: peNuevo, op: "=" },
    { etiqueta: "Ventas de un mes", valor: d.ventasMes, op: "" },
  ];
  const extra = `Hay que vender ${soles(ventasExtra)} más al mes${porDia !== null ? ` (unas ${porDia.toLocaleString("es-PE", { maximumFractionDigits: 1 })} ventas más por día)` : ""} para cubrirlo.`;
  if (d.ventasMes >= peNuevo) {
    return {
      pregunta: "contratar", semaforo: "verde", veredicto: "Sí", numero: soles(peNuevo), pasos,
      interpretacion: `Con ${que} de ${soles(costoMensual)} el piso sube de ${soles(peAntes)} a ${soles(peNuevo)}, y las ventas de hoy (${soles(d.ventasMes)}) ya lo cubren. ${extra}`,
      accion: `Adelante. La sede aguanta hasta ${soles(holgura)} de gasto fijo nuevo al mes y sigue sobre su punto de equilibrio.`,
    };
  }
  const ambar = faltaPct <= MAX_VENTAS_EXTRA_PCT;
  return {
    pregunta: "contratar", semaforo: ambar ? "ambar" : "rojo", veredicto: ambar ? `Solo si vendes ${pct(faltaPct, faltaPct < 10 ? 1 : 0)} más` : "Todavía no", numero: soles(peNuevo), pasos,
    interpretacion: `Con ${que} de ${soles(costoMensual)} el piso sube a ${soles(peNuevo)}: las ventas de hoy (${soles(d.ventasMes)}) se quedan ${pct(faltaPct, faltaPct < 10 ? 1 : 0)} cortas (${soles(peNuevo - d.ventasMes)} al mes). ${extra}`,
    accion: ambar
      ? "Contrata solo si puedes demostrar (con tus números o con un plan de ventas conservador) que vas a vender eso de más. Si no, espera o planifica el financiamiento."
      : "Todavía no: haría falta vender 30% más o más. Primero sube las ventas o baja otros gastos fijos.",
  };
}

// ─── ¿Necesito ajustar precios? ─────────────────────────────────────────

export function ajustarPrecios(d: DatosDecision): Respuesta {
  const a = equilibrio(d);
  if (a.mc === null) return sinDatos("precios", "Faltan ventas o costos para calcular el margen.");
  const ganPct = d.ventasMes > 0 ? ((a.utilidad ?? 0) / d.ventasMes) * 100 : 0;
  const t = d.tendencias;
  const alzaInsumos = t.varAntes !== null && t.varAhora !== null ? (t.varAhora - t.varAntes) * 100 : null;
  const alzaFijos = t.fijosAntes && t.fijosAhora ? ((t.fijosAhora - t.fijosAntes) / t.fijosAntes) * 100 : null;
  const avisos: string[] = [];
  if (alzaInsumos !== null && alzaInsumos >= ALZA_INSUMOS_PUNTOS) avisos.push(`los insumos subieron de ${pct(t.varAntes! * 100)} a ${pct(t.varAhora! * 100)} de lo vendido`);
  if (alzaFijos !== null && alzaFijos >= ALZA_FIJOS_PCT) avisos.push(`los costos fijos subieron ${pct(alzaFijos, 0)} (de ${soles(t.fijosAntes!)} a ${soles(t.fijosAhora!)} al mes)`);
  const pasos: Paso[] = [
    { etiqueta: "Ventas de un mes", valor: d.ventasMes, op: "" },
    { etiqueta: `Margen de contribución (${pct(a.mc * 100)})`, valor: d.ventasMes * a.mc, op: "=" },
    { etiqueta: "Costos fijos", valor: d.fijosMes, op: "−" },
    { etiqueta: "Ganancia del mes", valor: a.utilidad ?? 0, op: "=" },
  ];
  const motivos = avisos.length ? ` Además, ${avisos.join(" y ")}.` : "";
  if ((a.utilidad ?? 0) < 0) {
    return {
      pregunta: "precios", semaforo: "rojo", veredicto: "Sí, es necesario", numero: pct(a.mc * 100), pasos,
      interpretacion: `El margen (${pct(a.mc * 100)}) no alcanza para cubrir los costos fijos: falta ${soles(a.utilidad ?? 0)} al mes.${motivos}`,
      accion: "Ajustar precios ya no es opción, es necesidad (o bajar el costo de los productos). Usa el simulador del punto de equilibrio para ver cuánto.",
    };
  }
  if (ganPct < GANANCIA_SANA_PCT || avisos.length > 0) {
    return {
      pregunta: "precios", semaforo: "ambar", veredicto: "Revísalos", numero: pct(a.mc * 100), pasos,
      interpretacion: `El margen cubre los gastos y deja ${pct(ganPct)} de ganancia sobre lo vendido${ganPct < GANANCIA_SANA_PCT ? `, menos del ${GANANCIA_SANA_PCT}% sano` : ""}.${motivos}`,
      accion: "Un ajuste de precios (o de costos de receta) es la palanca más rápida para mejorar el resultado. Empieza por los productos que venden mucho y dejan poco.",
    };
  }
  return {
    pregunta: "precios", semaforo: "verde", veredicto: "No por ahora", numero: pct(a.mc * 100), pasos,
    interpretacion: `El margen cubre los gastos y deja ${pct(ganPct)} de ganancia sobre lo vendido.${tendenciaTxt(t)}`,
    accion: "Los precios están bien para los costos de hoy. Vuelve a mirar si suben los insumos o el alquiler.",
  };
}

/** Cómo se movieron insumos y fijos (últimos 3 meses cerrados contra los 3 anteriores), con sus cifras. */
function tendenciaTxt(t: DatosDecision["tendencias"]): string {
  const partes: string[] = [];
  if (t.varAntes !== null && t.varAhora !== null) partes.push(`los insumos pasaron de ${pct(t.varAntes * 100)} a ${pct(t.varAhora * 100)} de lo vendido`);
  if (t.fijosAntes && t.fijosAhora) partes.push(`los costos fijos de ${soles(t.fijosAntes)} a ${soles(t.fijosAhora)} al mes`);
  return partes.length ? ` En los últimos 3 meses ${partes.join(" y ")}: nada que obligue a subir precios todavía.` : "";
}

// ─── ¿Puedo reinvertir? ────────────────────────────────────────────────

export function puedoReinvertir(d: DatosDecision): Respuesta {
  const a = equilibrio(d);
  if (d.banco === null) return sinDatos("reinvertir", "Falta la lectura del banco del Excel de esta sede.");
  const semanaFijos = d.fijosMes / SEMANAS_POR_MES;
  const semanas = semanaFijos > 0 ? disponible(d) / semanaFijos : 0;
  const flujoMes = (a.utilidad ?? 0) - d.cuotasMes;
  const pasos: Paso[] = [
    { etiqueta: "Banco + efectivo + fondos mutuos", valor: disponible(d), op: "" },
    { etiqueta: "Una semana de costos fijos", valor: semanaFijos, op: "÷" },
  ];
  const n = semanas.toLocaleString("es-PE", { maximumFractionDigits: 1 });
  const tension = flujoMes < 0 ? ` Y el mes no deja plata: después de las cuotas falta ${soles(flujoMes)}.` : "";
  if (semanas >= SEMANAS_REINVERTIR_VERDE && flujoMes >= 0) {
    return {
      pregunta: "reinvertir", semaforo: "verde", veredicto: "Sí", numero: `${n} semanas`, pasos,
      interpretacion: `Hay ${n} semanas de costos fijos guardadas: una reserva sólida.`,
      accion: "Puedes reinvertir si la inversión tiene un retorno claro y no tocas la plata de trabajo del próximo mes.",
    };
  }
  const rojo = semanas < SEMANAS_REINVERTIR_MIN;
  return {
    pregunta: "reinvertir", semaforo: rojo ? "rojo" : "ambar", veredicto: rojo ? "Espera" : "Con cuidado", numero: `${n} semanas`, pasos,
    interpretacion: `Hay ${n} semanas de costos fijos guardadas (el libro pide más de ${SEMANAS_REINVERTIR_VERDE} para reinvertir tranquilo y avisa con menos de ${SEMANAS_REINVERTIR_MIN}).${tension}`,
    accion: rojo
      ? "Espera: la inversión se comería la reserva. Si la oportunidad no puede esperar, financiala solo si el retorno paga las cuotas."
      : "Reinvierte solo en algo con retorno rápido y calculable, o financialo si las cuotas no comprometen la operación.",
  };
}

// ─── ¿Puedo comprar inventario o insumos? ─────────────────────────────

export function comprarInventario(d: DatosDecision): Respuesta {
  const r = puedoRetirar(d);
  if (r.semaforo === "gris") return { ...sinDatos("inventario", "Falta la lectura del banco del Excel de esta sede."), pregunta: "inventario" };
  const libre = r.pasos[r.pasos.length - 1].valor;
  const nota = " El sistema no lleva el stock: tú sabes si ese insumo rota en menos de 30 días.";
  if (r.semaforo === "verde") {
    return {
      pregunta: "inventario", semaforo: "verde", veredicto: `Sí, hasta ${soles(libre)}`, numero: conSigno(libre), pasos: r.pasos,
      interpretacion: `Hay ${soles(libre)} libres después de los pagos y la reserva.${nota}`,
      accion: "Compra si el insumo se vende rápido y de forma predecible. Si rota lento, compra solo lo de la semana.",
    };
  }
  return {
    pregunta: "inventario", semaforo: r.semaforo, veredicto: r.semaforo === "ambar" ? "Espera" : "No", numero: conSigno(libre), pasos: r.pasos,
    interpretacion: `No hay plata libre: una compra extra usaría la reserva o la plata de los pagos.${nota}`,
    accion: "Compra solo lo que se vende en la semana. Una compra grande, cuando haya plata libre o con un acuerdo de pago con el proveedor.",
  };
}

function sinDatos(pregunta: Pregunta, porque: string): Respuesta {
  return { pregunta, semaforo: "gris", veredicto: "Sin datos", numero: "—", interpretacion: porque, accion: "Completa el dato que falta y la respuesta aparece sola.", pasos: [] };
}

/** Las cinco respuestas de una sede, en el orden de la matriz. */
export function matrizDeSede(d: DatosDecision): Record<Pregunta, Respuesta> {
  return {
    retirar: puedoRetirar(d),
    contratar: puedoContratar(d),
    precios: ajustarPrecios(d),
    reinvertir: puedoReinvertir(d),
    inventario: comprarInventario(d),
  };
}
