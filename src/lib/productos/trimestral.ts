/**
 * Informe trimestral de rotación · MOTOR (puro).
 *
 * ─── De dónde sale ───
 *
 * El "Reporte_Trimestral_Fonavi.xlsx" que armó Jahnn con los reportes de Byte
 * de junio, julio y agosto 2026, y que pidió (22-sep-2026) tener igual dentro
 * del panel de Grupo. Reproduce sus hojas:
 *
 *   Resumen            → comparativo mensual (ventas, unidades, prom./día).
 *   Categorías por mes → ventas y unidades por familia, mes a mes, con la
 *                        variación del último mes contra el primero.
 *   Top 10 por mes     → los 10 que más facturaron en cada mes.
 *   Top 10             → los 10 del trimestre, con su desglose mensual.
 *   Ranking por categ. → todos los productos dentro de su familia, con meses
 *                        activo, tendencia, clase ABC y recomendación.
 *   Otros              → lo que no es carta (delivery, extras, packaging).
 *
 * ─── Las reglas que definió Jahnn ───
 *
 *   Tendencia (último mes contra el primero): Creciendo ≥ +15%, Cayendo
 *   ≤ −15%, Estable en medio; "Nuevo" si no vendió el primer mes y sí
 *   después; "Dejó de venderse" si vendía al principio y terminó en cero.
 *
 *   Clase ABC sobre los ingresos del trimestre, ordenando de mayor a menor:
 *   A hasta el 80% acumulado, B hasta el 95%, C el resto.
 *
 * ─── Meses a medias (el mes en curso) ───
 *
 * Si el primer o el último mes no está completo (por ejemplo setiembre del 1
 * al 21), comparar totales diría que todo "cae". En ese caso la tendencia se
 * mide por DÍA: venta diaria del último mes contra venta diaria del primero.
 * Con los dos meses completos se comparan totales, igual que el Excel de
 * Jahnn. La marca de "mes sospechoso" también usa la venta por día, para no
 * confundir el mes en curso con una carga parcial.
 *
 * La RECOMENDACIÓN cruza clase, tendencia y meses activo. Es un punto de
 * partida, no un veredicto: no mira costos ni márgenes, y una caída puede ser
 * un quiebre de stock y no falta de demanda (nota de Jahnn en su Excel).
 */

import {
  armarPanorama, familiaDeProducto, nombreCanonico, esLineaEliminada, esAjuste,
  FAMILIAS, FAMILIA_OTROS, type Familia, type FilaProducto,
} from "./panorama";

export type MesDeRotacion = { month: string; desde: string; hasta: string; filas: FilaProducto[] };

export type Tendencia = "Creciendo" | "Estable" | "Cayendo" | "Nuevo" | "Dejó de venderse" | "Sin datos";
export type ClaseABC = "A" | "B" | "C";

export type MesResumen = {
  month: string;
  dias: number;
  ventas: number;
  unidades: number;
  ventaPorDia: number;
  productos: number;
  fueraDeCarta: number;
  /** El período realmente cargado (puede ser menos que el mes). */
  desde: string;
  hasta: string;
  /** true = el período cargado no cubre el mes entero. */
  incompleto: boolean;
  /**
   * true = el mes declara cubrir todo pero vendió muchísimo menos que los
   * otros. Es el caso de julio 2026 en Fonavi: la carga decía "1 al 31" y
   * traía S/6,996 de S/36,329 (un export parcial subido como mes entero).
   */
  sospechoso: boolean;
};

export type ProductoTrimestre = {
  nombre: string;
  familia: Familia;
  precio: number | null;
  porMes: { month: string; unidades: number; ingresos: number }[];
  unidades: number;
  ingresos: number;
  mesesActivo: number;
  variacionPct: number | null;
  tendencia: Tendencia;
  clase: ClaseABC;
  pctTrimestre: number;
  pctFamilia: number;
  recomendacion: string;
};

export type FamiliaTrimestre = {
  familia: Familia;
  porMes: { month: string; ventas: number; unidades: number }[];
  ventas: number;
  unidades: number;
  pct: number;
  variacionPct: number | null;
  productos: ProductoTrimestre[];
};

export type InformeTrimestral = {
  meses: MesResumen[];
  dias: number;
  ventas: number;
  unidades: number;
  ventaPorDia: number;
  productos: number;
  fueraDeCarta: { ventas: number; unidades: number; porMes: { month: string; ventas: number }[]; filas: FilaProducto[] };
  familias: FamiliaTrimestre[];
  top: ProductoTrimestre[];
  topPorMes: { month: string; productos: { nombre: string; unidades: number; ingresos: number }[] }[];
  /** Productos ordenados por ingresos del trimestre (la hoja "Datos"). */
  productosTodos: ProductoTrimestre[];
  concentracionTop10: number;
  claseA: number;
  /** true = la tendencia se midió por día (hay un mes a medias). */
  tendenciaPorDia: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);
const clave = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function tendenciaDe(primero: number, ultimo: number): { tendencia: Tendencia; variacion: number | null } {
  if (primero === 0 && ultimo === 0) return { tendencia: "Sin datos", variacion: null };
  if (primero === 0) return { tendencia: "Nuevo", variacion: null };
  if (ultimo === 0) return { tendencia: "Dejó de venderse", variacion: -100 };
  const v = Math.round(((ultimo - primero) / primero) * 1000) / 10;
  return { tendencia: v >= 15 ? "Creciendo" : v <= -15 ? "Cayendo" : "Estable", variacion: v };
}

/** Cruce de clase ABC + tendencia: el punto de partida de la conversación. */
export function recomendacionDe(clase: ClaseABC, tendencia: Tendencia, mesesActivo: number, meses: number): string {
  if (tendencia === "Dejó de venderse") return "Confirmar si salió de carta o hubo quiebre de stock";
  if (tendencia === "Nuevo") return mesesActivo === 1 ? "Nuevo: medir un mes más antes de decidir" : "Nuevo y ya vende: darle sitio en vitrina";
  if (clase === "A") {
    if (tendencia === "Creciendo") return "Impulsar: asegurar stock y visibilidad";
    if (tendencia === "Cayendo") return "Revisar YA: es de los que más facturan y está cayendo";
    return "Mantener: sostiene la venta";
  }
  if (clase === "B") {
    if (tendencia === "Creciendo") return "Vigilar: puede pasar a los que más facturan";
    if (tendencia === "Cayendo") return "Revisar precio, presentación o lugar en carta";
    return "Mantener y mirar el margen";
  }
  if (tendencia === "Creciendo") return "Poca venta pero sube: probar con más visibilidad";
  if (mesesActivo < meses) return "Vende poco y no todos los meses: candidato a salir de carta";
  return "Vende poco: mantener solo si no cuesta tenerlo";
}

/**
 * Junta los meses del trimestre. Cada mes llega con las filas crudas del
 * reporte de Byte; la limpieza (líneas eliminadas, alias, qué no es carta) es
 * la misma de `armarPanorama`, para que el mes y el trimestre nunca se
 * contradigan.
 */
export function armarTrimestral(meses: MesDeRotacion[]): InformeTrimestral {
  const panoramas = meses.map((m) => ({ ...m, p: armarPanorama(m.filas, m.desde, m.hasta, 10) }));
  const mesesKeys = meses.map((m) => m.month);

  const ventasPorMes = panoramas.map((x) => x.p.ventaPorDia).filter((v) => v > 0).sort((a, b) => a - b);
  const mediana = ventasPorMes.length > 0
    ? (ventasPorMes.length % 2 ? ventasPorMes[(ventasPorMes.length - 1) / 2] : (ventasPorMes[ventasPorMes.length / 2 - 1] + ventasPorMes[ventasPorMes.length / 2]) / 2)
    : 0;

  const resumen: MesResumen[] = panoramas.map(({ month, p, desde, hasta }) => {
    const [y, mm] = month.split("-").map(Number);
    const ultimoDia = `${month}-${String(new Date(y, mm, 0).getDate()).padStart(2, "0")}`;
    return {
      month, dias: p.dias, ventas: p.ventas, unidades: p.unidades, ventaPorDia: p.ventaPorDia,
      productos: p.productos, fueraDeCarta: p.fueraDeCarta.ventas, desde, hasta,
      incompleto: desde > `${month}-01` || hasta < ultimoDia,
      sospechoso: ventasPorMes.length > 1 && p.ventaPorDia > 0 && mediana > 0 && p.ventaPorDia < mediana * 0.5,
    };
  });

  // Con el primer o el último mes a medias, la tendencia se mide por día.
  const primero = resumen[0];
  const ultimo = resumen[resumen.length - 1];
  const porDia = !!primero && !!ultimo && (primero.incompleto || ultimo.incompleto);
  const escala = (v: number, m: MesResumen | undefined) => (porDia && m && m.dias > 0 ? v / m.dias : v);
  const comparar = (a: number, b: number) => tendenciaDe(escala(a, primero), escala(b, ultimo));

  // Productos: una fila por producto con su desglose mensual.
  const acc = new Map<string, { nombre: string; porMes: Map<string, { unidades: number; ingresos: number }> }>();
  const fuera = new Map<string, { nombre: string; unidades: number; ingresos: number; porMes: Map<string, number> }>();
  for (const { month, p } of panoramas) {
    for (const prod of p.carta) {
      const k = clave(prod.nombre);
      if (!acc.has(k)) acc.set(k, { nombre: prod.nombre, porMes: new Map() });
      acc.get(k)!.porMes.set(month, { unidades: prod.unidades, ingresos: prod.ingresos });
    }
    for (const f of p.fueraDeCarta.filas) {
      const k = clave(f.nombre);
      if (!fuera.has(k)) fuera.set(k, { nombre: f.nombre, unidades: 0, ingresos: 0, porMes: new Map() });
      const x = fuera.get(k)!;
      x.unidades += f.unidades; x.ingresos += f.ingresos;
      x.porMes.set(month, (x.porMes.get(month) ?? 0) + f.ingresos);
    }
  }

  const ventasTrim = r2([...acc.values()].reduce((t, p) => t + [...p.porMes.values()].reduce((s, v) => s + v.ingresos, 0), 0));

  const base = [...acc.values()].map((p) => {
    const porMes = mesesKeys.map((month) => ({ month, unidades: p.porMes.get(month)?.unidades ?? 0, ingresos: p.porMes.get(month)?.ingresos ?? 0 }));
    const unidades = r2(porMes.reduce((t, m) => t + m.unidades, 0));
    const ingresos = r2(porMes.reduce((t, m) => t + m.ingresos, 0));
    const { tendencia, variacion } = comparar(porMes[0]?.ingresos ?? 0, porMes[porMes.length - 1]?.ingresos ?? 0);
    return {
      nombre: p.nombre, familia: familiaDeProducto(p.nombre), porMes, unidades, ingresos,
      precio: unidades > 0 ? r2(ingresos / unidades) : null,
      mesesActivo: porMes.filter((m) => m.unidades > 0).length,
      tendencia, variacionPct: variacion,
      pctTrimestre: pct(ingresos, ventasTrim),
    };
  }).sort((a, b) => b.ingresos - a.ingresos);

  // Clase ABC sobre el acumulado de ingresos.
  let acumulado = 0;
  const productosTodos: ProductoTrimestre[] = base.map((p) => {
    acumulado += p.ingresos;
    const acumPct = pct(acumulado, ventasTrim);
    const clase: ClaseABC = acumPct <= 80 ? "A" : acumPct <= 95 ? "B" : "C";
    return {
      ...p, clase, pctFamilia: 0,
      recomendacion: recomendacionDe(clase, p.tendencia, p.mesesActivo, mesesKeys.length),
    };
  });

  const familias: FamiliaTrimestre[] = FAMILIAS.filter((f) => f !== FAMILIA_OTROS).map((familia) => {
    const dentro = productosTodos.filter((p) => p.familia === familia);
    const ventas = r2(dentro.reduce((t, p) => t + p.ingresos, 0));
    for (const p of dentro) p.pctFamilia = pct(p.ingresos, ventas);
    const porMes = mesesKeys.map((month) => ({
      month,
      ventas: r2(dentro.reduce((t, p) => t + (p.porMes.find((m) => m.month === month)?.ingresos ?? 0), 0)),
      unidades: r2(dentro.reduce((t, p) => t + (p.porMes.find((m) => m.month === month)?.unidades ?? 0), 0)),
    }));
    const { variacion } = comparar(porMes[0]?.ventas ?? 0, porMes[porMes.length - 1]?.ventas ?? 0);
    return { familia, porMes, ventas, unidades: r2(dentro.reduce((t, p) => t + p.unidades, 0)), pct: pct(ventas, ventasTrim), variacionPct: variacion, productos: dentro };
  }).filter((f) => f.ventas > 0);

  const top = productosTodos.slice(0, 10);
  const dias = resumen.reduce((t, m) => t + m.dias, 0);
  return {
    meses: resumen,
    dias,
    ventas: ventasTrim,
    unidades: r2(productosTodos.reduce((t, p) => t + p.unidades, 0)),
    ventaPorDia: dias > 0 ? r2(ventasTrim / dias) : 0,
    productos: productosTodos.length,
    fueraDeCarta: {
      ventas: r2([...fuera.values()].reduce((t, f) => t + f.ingresos, 0)),
      unidades: r2([...fuera.values()].reduce((t, f) => t + f.unidades, 0)),
      porMes: mesesKeys.map((month) => ({ month, ventas: r2([...fuera.values()].reduce((t, f) => t + (f.porMes.get(month) ?? 0), 0)) })),
      filas: [...fuera.values()].map((f) => ({ nombre: f.nombre, unidades: r2(f.unidades), ingresos: r2(f.ingresos) })).sort((a, b) => b.ingresos - a.ingresos),
    },
    familias,
    top,
    topPorMes: panoramas.map(({ month, p }) => ({
      month,
      productos: p.top.map((x) => ({ nombre: x.nombre, unidades: x.unidades, ingresos: x.ingresos })),
    })),
    productosTodos,
    concentracionTop10: pct(top.reduce((t, p) => t + p.ingresos, 0), ventasTrim),
    claseA: productosTodos.filter((p) => p.clase === "A").length,
    tendenciaPorDia: porDia,
  };
}

/** Utilidades que también usa la capa de datos. */
export { esLineaEliminada, esAjuste, nombreCanonico };
