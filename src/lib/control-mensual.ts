/**
 * Tu sistema mensual de control financiero · MOTOR (puro).
 *
 * Pedido de Jahnn (6-oct-2026, capítulo del libro): una rutina con tres piezas:
 *   · Revisión semanal (20–30 min, los LUNES por decisión de Jahnn: ya están el Excel del viernes
 *     y los reportes de Byte del sábado): saldo vs. compromisos, cobros pendientes, ventas de la
 *     semana contra la meta y gastos no previstos.
 *   · Cierre de mes (1–2 h): las 6 preguntas del dueño y los 5 pasos de la revisión.
 *   · Checklist mensual: 12 puntos. El sistema dice cuáles ya tienen sus datos listos; el que
 *     marca es el dueño (la revisión es suya, no del sistema).
 */

export type Semaforo = "verde" | "ambar" | "rojo" | "gris";

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── La semana que se revisa ───────────────────────────────────────────

/** El lunes de la semana de una fecha (YYYY-MM-DD). */
export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** La última semana completa (lunes a domingo) antes de hoy: la que se revisa este lunes. */
export function semanaEnRevision(hoy: string): { desde: string; hasta: string } {
  const lunes = lunesDe(hoy);
  const d = new Date(`${lunes}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  const desde = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { desde, hasta: d.toISOString().slice(0, 10) };
}

// ─── Ventas de la semana: ¿vamos al ritmo de la meta? ───────────────────

export const DIAS_MINIMOS_PROYECCION = 7;

export type RitmoVentas = {
  ventasMes: number;
  ventasSemana: number;
  /** Al ritmo de lo que va del mes, cuánto se vendería al cierre. */
  proyeccion: number | null;
  /** Con menos de 7 días del mes, la proyección sale del ritmo de la última semana completa. */
  proyeccionEs: "mes" | "semana" | null;
  meta: number | null;
  /** De dónde sale la meta: la venta esperada del presupuesto aprobado o, si no hay, el punto de equilibrio. */
  metaEs: "presupuesto" | "equilibrio" | null;
  pe: number | null;
  /** Para llegar a la meta: lo que falta y cuánto por día en los días que quedan. */
  falta: number | null;
  porDia: number | null;
  diasRestantes: number;
  semaforo: Semaforo;
};

export function ritmoVentas(e: {
  ventasMes: number; ventasSemana: number; diasConDatos: number; diasDelMes: number;
  ventaEsperada: number | null; pe: number | null;
}): RitmoVentas {
  const meta = e.ventaEsperada ?? e.pe;
  const metaEs = e.ventaEsperada ? "presupuesto" : e.pe ? "equilibrio" : null;
  // Los primeros días del mes no alcanzan para proyectar (Atelier factura a empresas en días sueltos):
  // con menos de 7 días se usa el ritmo de la última semana completa.
  const porSemana = e.diasConDatos < DIAS_MINIMOS_PROYECCION && e.ventasSemana > 0;
  const proyeccion = porSemana ? r2((e.ventasSemana / 7) * e.diasDelMes)
    : e.diasConDatos > 0 ? r2((e.ventasMes / e.diasConDatos) * e.diasDelMes) : null;
  const proyeccionEs = proyeccion === null ? null : porSemana ? "semana" : "mes";
  const diasRestantes = Math.max(0, e.diasDelMes - e.diasConDatos);
  const falta = meta !== null ? r2(Math.max(0, meta - e.ventasMes)) : null;
  const porDia = falta !== null && diasRestantes > 0 ? r2(falta / diasRestantes) : null;
  let semaforo: Semaforo = "gris";
  if (proyeccion !== null && meta !== null) {
    if (proyeccion >= meta) semaforo = "verde";
    else if (e.pe !== null && proyeccion < e.pe) semaforo = "rojo";
    else semaforo = "ambar";
  }
  return { ventasMes: r2(e.ventasMes), ventasSemana: r2(e.ventasSemana), proyeccion, proyeccionEs, meta, metaEs, pe: e.pe, falta, porDia, diasRestantes, semaforo };
}

// ─── Cobros pendientes (solo Atelier vende al crédito) ─────────────────

/** Si la última carga del reporte de cobros tiene más de estos días, el número ya no es confiable. */
export const DIAS_CARGA_COBROS = 8;

export function semaforoCobros(e: { porCobrar: number; atrasado: number; diasDesdeCarga: number | null }): Semaforo {
  if (e.diasDesdeCarga === null || e.diasDesdeCarga > DIAS_CARGA_COBROS) return "gris";
  if (e.atrasado <= 0) return "verde";
  return e.atrasado >= e.porCobrar * 0.5 ? "rojo" : "ambar";
}

// ─── Checklist mensual ────────────────────────────────────────────────

/** Lo que el sistema sabe del mes que se cierra, para decir qué puntos ya tienen sus datos. */
export type EstadoMes = {
  /** Sedes con las ventas del mes cargadas. */
  sedesConVentas: number;
  /** Sedes con el Excel completo del mes (llega hasta fin de mes). */
  sedesConExcelCompleto: number;
  /** Sedes con ganancia real calculada. */
  sedesConResultado: number;
  /** Gastos del mes en POR ACLARAR (todavía sin clasificar). */
  porAclarar: number;
  /** Sedes con presupuesto del mes siguiente aprobado / con venta esperada. */
  sedesPresupuestoSiguienteAprobado: number;
  sedesMetaSiguiente: number;
  totalSedes: number;
};

export type ItemChecklist = {
  id: string;
  grupo: "cierre" | "analisis";
  texto: string;
  /** Dónde se ve en el sistema. */
  donde: string;
  /** Qué tiene que estar listo para marcarlo (null = es criterio del dueño). */
  datos: ((m: EstadoMes) => { listo: boolean; detalle: string }) | null;
};

const todas = (n: number, m: EstadoMes, que: string) =>
  ({ listo: n >= m.totalSedes, detalle: n >= m.totalSedes ? `${que} de las ${m.totalSedes} sedes` : `Falta en ${m.totalSedes - n} de ${m.totalSedes} sedes` });

export const CHECKLIST: ItemChecklist[] = [
  { id: "ventas", grupo: "cierre", texto: "Calculé las ventas totales del mes", donde: "Cierre de mes → Estado de resultados",
    datos: (m) => todas(m.sedesConVentas, m, "Ventas cargadas") },
  { id: "costos", grupo: "cierre", texto: "Registré todos los costos de venta", donde: "Excel de cada sede",
    datos: (m) => todas(m.sedesConExcelCompleto, m, "Excel completo") },
  { id: "gastos", grupo: "cierre", texto: "Registré todos los gastos operativos", donde: "Excel de cada sede y Por definir",
    datos: (m) => {
      const t = todas(m.sedesConExcelCompleto, m, "Excel completo");
      if (!t.listo) return t;
      return m.porAclarar > 0 ? { listo: false, detalle: `Quedan S/${Math.round(m.porAclarar).toLocaleString("es-PE")} POR ACLARAR` } : t;
    } },
  { id: "ganancia", grupo: "cierre", texto: "Calculé mi ganancia bruta y neta", donde: "Cierre de mes → Estado de resultados",
    datos: (m) => todas(m.sedesConResultado, m, "Ganancia calculada") },
  { id: "flujo", grupo: "cierre", texto: "Revisé el flujo de caja del mes", donde: "Cierre de mes → Flujo de caja", datos: null },
  { id: "comparacion", grupo: "cierre", texto: "Comparé con el mes anterior", donde: "Cierre de mes → Comparación", datos: null },
  { id: "equilibrio", grupo: "analisis", texto: "Verifiqué si superé el punto de equilibrio", donde: "Cierre de mes → Estado de resultados (equilibrio)", datos: null },
  { id: "margenes", grupo: "analisis", texto: "Revisé los márgenes por producto", donde: "Productos → ¿Dónde ganamos plata?", datos: null },
  { id: "liquidez", grupo: "analisis", texto: "Calculé mi liquidez libre disponible", donde: "Matriz de decisión → ¿Puedo retirar?", datos: null },
  { id: "reducir", grupo: "analisis", texto: "Identifiqué costos que puedo reducir", donde: "Presupuesto → desvíos y Grupo → Gastos", datos: null },
  { id: "meta", grupo: "analisis", texto: "Definí la meta de ventas del próximo mes", donde: "Presupuesto del mes siguiente → venta esperada",
    datos: (m) => todas(m.sedesMetaSiguiente, m, "Meta definida") },
  { id: "proyeccion", grupo: "analisis", texto: "Proyecté el flujo de caja del próximo mes", donde: "Presupuesto del mes siguiente aprobado",
    datos: (m) => todas(m.sedesPresupuestoSiguienteAprobado, m, "Presupuesto aprobado") },
];

/** Cuántos puntos marcó el dueño. */
export const avanceChecklist = (marcados: Set<string>) => ({ hechos: CHECKLIST.filter((i) => marcados.has(i.id)).length, total: CHECKLIST.length });

// ─── Cierre de mes: comparación con el mes anterior ─────────────────────

export type Variacion = { actual: number | null; anterior: number | null; diferencia: number | null; pct: number | null };

export function variacion(actual: number | null, anterior: number | null): Variacion {
  if (actual === null || anterior === null) return { actual, anterior, diferencia: null, pct: null };
  const diferencia = r2(actual - anterior);
  return { actual, anterior, diferencia, pct: anterior !== 0 ? Math.round((diferencia / Math.abs(anterior)) * 1000) / 10 : null };
}

/** Las categorías que más cambiaron de un mes al otro (para el «¿por qué?»). */
export function mayoresCambios(actual: Record<string, number>, anterior: Record<string, number>, max = 3) {
  const cats = new Set([...Object.keys(actual), ...Object.keys(anterior)]);
  return [...cats]
    .map((c) => ({ categoria: c, actual: r2(actual[c] ?? 0), anterior: r2(anterior[c] ?? 0), diferencia: r2((actual[c] ?? 0) - (anterior[c] ?? 0)) }))
    .filter((x) => Math.abs(x.diferencia) >= 1)
    .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
    .slice(0, max);
}
