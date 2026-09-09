/**
 * El Reporte Ejecutivo en DOS PÁGINAS · MOTOR (lógica pura).
 *
 * ─── Por qué se rehizo ───
 *
 * Kelly (9-sep-2026, vía Jahnn): el reporte tiene "demasiado texto y
 * sugerencias que no se entienden". Tenía 12 secciones —scorecard,
 * riesgos, oportunidades, proyecciones, plan de acción, cierre para el
 * directorio, anexos— y quien lo lee todos los meses no llegaba al
 * final. Un reporte que no se lee no informa nada, por completo que sea.
 *
 * Decisión de Jahnn: dos páginas. La primera responde "¿cómo nos fue?",
 * la segunda "¿qué hacemos?". El detalle fino se va al Excel, que es
 * donde de todos modos se revisa línea por línea.
 *
 * ─── El promedio de 3 meses, y por qué no es un adorno ───
 *
 * El Excel de Kelly registra la COMPRA el día que se paga, no cuando la
 * mercadería se consume. Un mes que se abasteció fuerte parece pésimo y
 * el siguiente parece buenísimo, sin que el negocio haya cambiado:
 *
 *   abril −22.2% · mayo −4.7% · junio −6.2% · julio +15.6% · agosto −0.8%
 *
 * Fonavi en agosto compró S/21,012 de mercadería sobre S/38,979 de venta;
 * en julio fueron S/13,105 sobre S/34,796. No perdió: abasteció.
 *
 * Por eso cada cifra del mes va acompañada de su promedio móvil de 3
 * meses, donde el abastecimiento se compensa solo. El mes se sigue
 * mostrando —es el dato— pero deja de presentarse como si fuera la
 * verdad sobre el negocio. Decisión de Jahnn del 9-sep-2026.
 *
 * ─── La regla del texto ───
 *
 * Nada de prosa generada. Cada línea de esta página es un número con su
 * nombre, o una frase de máximo una línea que un número obliga a decir.
 * Si una frase no se puede derivar de una cifra concreta, no va.
 */

import type { MonthlyBasics, UnitFacts, CoberturaMes } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type LineaSede = {
  unitId: number;
  unitName: string;
  ventas: number;
  gastos: number;
  resultado: number;
  margenPct: number | null;
  /** Promedio móvil de los 3 meses previos + el actual. */
  resultado3m: number | null;
  margen3mPct: number | null;
  /** Días de venta cargados / esperados, de la cobertura. */
  cobertura: string | null;
};

export type Movimiento = {
  texto: string;
  /** Cuánto pesa, en soles, para poder ordenar por importancia. */
  peso: number;
};

export type ResumenSimple = {
  month: string;
  monthLabel: string;
  /** El aviso de cobertura, que manda sobre todo lo demás. */
  cobertura: CoberturaMes;
  total: {
    ventas: number;
    gastos: number;
    resultado: number;
    margenPct: number | null;
    ventas3m: number | null;
    resultado3m: number | null;
    margen3mPct: number | null;
  };
  sedes: LineaSede[];
  /** Máximo 3, ordenados por peso en soles. */
  mejoro: Movimiento[];
  empeoro: Movimiento[];
  /** La frase de una línea que resume el mes. Sin adjetivos de más. */
  titular: string;
};

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;

/** Promedio de los meses con datos. null si no hay ninguno. */
function promedio(valores: number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x));
  return v.length > 0 ? r2(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

/**
 * Los meses que entran al promedio móvil: el actual y hasta 2 previos,
 * SOLO los que tienen ventas. Un mes vacío arrastraría el promedio hacia
 * abajo y diría que el negocio empeoró cuando lo que falta es la carga.
 */
function ventanaMovil(current: MonthlyBasics, history: MonthlyBasics[]): MonthlyBasics[] {
  return [...history.slice(-2), current].filter((m) => m.sales > 0);
}

export function construirResumenSimple(input: {
  month: string;
  monthLabel: string;
  units: UnitFacts[];
  cobertura: CoberturaMes;
}): ResumenSimple {
  const { month, monthLabel, units, cobertura } = input;

  const sedes: LineaSede[] = units.map((u) => {
    const ventana = ventanaMovil(u.current, u.history);
    const cob = cobertura.sedes.find((s) => s.unitId === u.unit.id);
    return {
      unitId: u.unit.id,
      unitName: u.unit.name,
      ventas: r2(u.current.sales),
      gastos: r2(u.current.opExpenses),
      resultado: r2(u.current.ebitda),
      margenPct: u.current.sales > 0 ? r2((u.current.ebitda / u.current.sales) * 100) : null,
      resultado3m: promedio(ventana.map((m) => m.ebitda)),
      margen3mPct: (() => {
        const v = ventana.reduce((s, m) => s + m.sales, 0);
        const e = ventana.reduce((s, m) => s + m.ebitda, 0);
        return v > 0 ? r2((e / v) * 100) : null;
      })(),
      cobertura: cob ? `${cob.diasConVenta}/${cob.diasEsperados} días` : null,
    };
  });

  const ventas = r2(sedes.reduce((s, x) => s + x.ventas, 0));
  const gastos = r2(sedes.reduce((s, x) => s + x.gastos, 0));
  const resultado = r2(ventas - gastos);

  // El acumulado del grupo se arma sumando las ventanas de cada sede,
  // no promediando los promedios: sedes de tamaños distintos harían que
  // la más chica pesara igual que la más grande.
  const ventanas = units.map((u) => ventanaMovil(u.current, u.history));
  const meses = Math.max(...ventanas.map((v) => v.length), 0);
  const ventas3mTot = ventanas.reduce((s, v) => s + v.reduce((t, m) => t + m.sales, 0), 0);
  const ebitda3mTot = ventanas.reduce((s, v) => s + v.reduce((t, m) => t + m.ebitda, 0), 0);

  const total = {
    ventas, gastos, resultado,
    margenPct: ventas > 0 ? r2((resultado / ventas) * 100) : null,
    ventas3m: meses > 0 ? r2(ventas3mTot / meses) : null,
    resultado3m: meses > 0 ? r2(ebitda3mTot / meses) : null,
    margen3mPct: ventas3mTot > 0 ? r2((ebitda3mTot / ventas3mTot) * 100) : null,
  };

  // ── Qué mejoró y qué empeoró ──
  // Solo cosas medibles y del propio mes contra el anterior. Sin
  // interpretación: el número dice qué pasó, no por qué.
  const mejoro: Movimiento[] = [];
  const empeoro: Movimiento[] = [];
  for (const u of units) {
    const prev = u.history[u.history.length - 1];
    if (!prev || prev.sales <= 0 || u.current.sales <= 0) continue;

    const dVentas = u.current.sales - prev.sales;
    if (Math.abs(dVentas) >= 1000) {
      const t = `${u.unit.name}: ventas ${dVentas > 0 ? "subieron" : "bajaron"} ${soles(dVentas)} vs el mes anterior`;
      (dVentas > 0 ? mejoro : empeoro).push({ texto: t, peso: Math.abs(dVentas) });
    }
    const dGastos = u.current.opExpenses - prev.opExpenses;
    if (Math.abs(dGastos) >= 1000) {
      const t = `${u.unit.name}: gasto operativo ${dGastos > 0 ? "subió" : "bajó"} ${soles(dGastos)}`;
      (dGastos < 0 ? mejoro : empeoro).push({ texto: t, peso: Math.abs(dGastos) });
    }
  }
  const top3 = (m: Movimiento[]) => m.sort((a, b) => b.peso - a.peso).slice(0, 3);

  // ── El titular ──
  // Si los datos no están completos, el titular lo dice y NO afirma
  // nada sobre el negocio: es la lección de agosto.
  const titular = !cobertura.confiable
    ? cobertura.titular
    : resultado >= 0
      ? `${monthLabel} cerró con ${soles(resultado)} de resultado operativo sobre ${soles(ventas)} de venta (${total.margenPct?.toFixed(1)}%).`
      : `${monthLabel} cerró con ${soles(resultado)} de pérdida operativa sobre ${soles(ventas)} de venta. ` +
        (total.margen3mPct !== null && total.margen3mPct > 0
          ? `El promedio de los últimos meses sigue positivo (${total.margen3mPct.toFixed(1)}%): revisar si fue abastecimiento del mes.`
          : `El promedio de los últimos meses también es negativo: no es un mes suelto.`);

  return {
    month, monthLabel, cobertura, total, sedes,
    mejoro: top3(mejoro), empeoro: top3(empeoro), titular,
  };
}
