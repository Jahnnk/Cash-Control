/**
 * Estado de resultados de 6 meses · lógica PURA (Fase 2 de «lo real en Reportes», 16-oct-2026).
 *
 * Jahnn, después de conciliar setiembre a mano y auditar abr–set: «¿mostramos en reportes lo real de las tres
 * sedes? el EBITDA, ventas, ingresos, gastos por categoría…». Todo sale de las seis cifras (una sola fuente,
 * PR #258); aquí solo se ordena como un estado de resultados:
 *
 *   Ventas (Byte)
 *   − Costos variables (por categoría)       = Margen bruto
 *   − Gastos fijos (por categoría)           = EBITDA (antes de impuestos)
 *   − Impuestos                              = Ganancia real
 *   Aparte: lo que salió sin ser gasto (deudas, inversión, ahorro, utilidades…) y la caja.
 *
 * El grupo cuenta UNA vez lo que Atelier le vende a las cafeterías: sale de las ventas y de PRODUCTOS ATELIER
 * (igual que cifrasDelGrupo).
 */

import { cifrasDelGrupo, type CifrasSede } from "./seis-cifras";
import { conciliarSede } from "./conciliacion-mes";

export type Vista = number | "grupo";
export type EstadoMes = "conciliado" | "en-curso" | "a-mano" | "sin-resultado";
export type LineaCategoria = { categoria: string; montos: (number | null)[] };

export type ColumnaMes = {
  mes: string;
  estado: EstadoMes;
  /** Por qué no hay resultado, si no lo hay. */
  porque: string | null;
  ventas: number | null;
  ingresadoVentas: number | null;
  costos: number | null;
  margenBruto: number | null;
  margenBrutoPct: number | null;
  gastos: number | null;
  ebitda: number | null;
  ebitdaPct: number | null;
  impuestos: number | null;
  ganancia: number | null;
  gananciaPct: number | null;
  /** De los gastos, lo extraordinario (reparaciones grandes); ya está dentro. 0 = nada. */
  extraordinario: number;
  fuera: { deudas: number; inversion: number; ahorro: number; reparto: number; otros: number };
  caja: { entro: number; salio: number };
};

export type EstadoResultados = {
  vista: Vista;
  meses: ColumnaMes[];
  costos: LineaCategoria[];
  gastos: LineaCategoria[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number | null, b: number | null) => (a === null || !b ? null : r1((a / b) * 100));
const finDe = (mes: string) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5), 0)).toISOString().slice(0, 10);

function estadoDeSede(s: CifrasSede, mes: string, hoy: string): EstadoMes {
  if (!s.conResultado) return "sin-resultado";
  if (finDe(mes) >= hoy) return "en-curso";
  if (!s.fuenteExcel) return "a-mano";
  const c = conciliarSede(s, finDe(mes));
  return c.mesCerrado && Math.abs(c.entro.sinExplicar) < 0.01 && Math.abs(c.salio.sinExplicar) < 0.01 ? "conciliado" : "en-curso";
}

const PRIORIDAD: EstadoMes[] = ["sin-resultado", "en-curso", "a-mano", "conciliado"];

/** Una columna (un mes) de una sede o del grupo. */
function columna(vista: Vista, mes: string, sedes: CifrasSede[], hoy: string): { col: ColumnaMes; cats: Map<string, number> } {
  const sedesVista = vista === "grupo" ? sedes : sedes.filter((s) => s.businessId === vista);
  const conRes = sedesVista.filter((s) => s.conResultado);
  const estados = sedesVista.map((s) => estadoDeSede(s, mes, hoy));
  // El grupo toma el peor estado de sus sedes: si una está a medias, el grupo también.
  const estado = estados.length ? PRIORIDAD.find((e) => estados.includes(e))! : "sin-resultado";
  const cats = new Map<string, number>();
  for (const s of conRes) for (const c of s.porCategoria) if (["costos", "gastos"].includes(c.rubro)) cats.set(c.categoria, (cats.get(c.categoria) ?? 0) + c.monto);
  const sum = (f: (s: CifrasSede) => number) => r2(sedesVista.reduce((t, s) => t + f(s), 0));

  let ventas: number | null, costos: number | null, gastos: number | null, impuestos: number | null;
  if (vista === "grupo") {
    const g = cifrasDelGrupo(sedes);
    const hay = conRes.length > 0 && g.ganancia !== null;
    ventas = hay ? r2(g.ganancia! + g.costos + g.gastos + g.impuestos) : null;
    costos = hay ? g.costos : null; gastos = hay ? g.gastos : null; impuestos = hay ? g.impuestos : null;
    // Lo que Atelier vendió a las cafeterías se descontó de PRODUCTOS ATELIER (ya está fuera de las ventas).
    const interno = conRes.some((s) => s.businessId === 1) ? conRes.filter((s) => s.businessId !== 1).reduce((t, s) => t + s.compraAtelier, 0) : 0;
    if (interno) cats.set("PRODUCTOS ATELIER", r2((cats.get("PRODUCTOS ATELIER") ?? 0) - interno));
  } else {
    const s = conRes[0];
    ventas = s ? s.ventas : null; costos = s ? s.costos : null; gastos = s ? s.gastos : null; impuestos = s ? s.impuestos : null;
  }
  const margenBruto = ventas !== null && costos !== null ? r2(ventas - costos) : null;
  const ebitda = margenBruto !== null && gastos !== null ? r2(margenBruto - gastos) : null;
  const ganancia = ebitda !== null && impuestos !== null ? r2(ebitda - impuestos) : null;
  const ingresadoVentas = sedesVista.some((s) => (s.ingresadoVentas ?? s.cobrado) !== null) ? sum((s) => s.ingresadoVentas ?? s.cobrado ?? 0) : null;
  return {
    cats,
    col: {
      mes, estado,
      porque: estado === "sin-resultado" ? sedesVista.map((s) => s.sinResultadoPorque).find(Boolean) ?? "Sin datos" : null,
      ventas, ingresadoVentas, costos, margenBruto, margenBrutoPct: pct(margenBruto, ventas), gastos,
      ebitda, ebitdaPct: pct(ebitda, ventas), impuestos, ganancia, gananciaPct: pct(ganancia, ventas),
      extraordinario: ganancia === null ? 0 : sum((s) => (s.conResultado ? s.extraordinario?.total ?? 0 : 0)),
      fuera: {
        deudas: sum((s) => s.fuera.deudas), inversion: sum((s) => s.fuera.inversion), ahorro: sum((s) => s.fuera.ahorro),
        reparto: sum((s) => s.fuera.reparto), otros: sum((s) => s.fuera.noEsGasto - s.fuera.ahorro - s.fuera.reparto),
      },
      caja: { entro: sum((s) => s.caja.entro), salio: sum((s) => s.caja.salio) },
    },
  };
}

/** `meses`: del más antiguo al más reciente, cada uno con las seis cifras de sus sedes. */
export function estadoDeResultados(vista: Vista, meses: { mes: string; sedes: CifrasSede[] }[], hoy: string): EstadoResultados {
  const cols = meses.map((m) => columna(vista, m.mes, m.sedes, hoy));
  const lineas = (rubro: "costos" | "gastos"): LineaCategoria[] => {
    const nombres = new Set<string>();
    meses.forEach((m) => m.sedes.forEach((s) => s.porCategoria.filter((c) => c.rubro === rubro).forEach((c) => nombres.add(c.categoria))));
    return [...nombres]
      .map((categoria) => ({ categoria, montos: cols.map((c) => (c.col.costos === null ? null : r2(c.cats.get(categoria) ?? 0))) }))
      .filter((l) => l.montos.some((x) => x !== null && Math.abs(x) >= 0.01))
      .sort((a, b) => (b.montos.at(-1) ?? 0) - (a.montos.at(-1) ?? 0) || (b.montos.reduce<number>((t, x) => t + (x ?? 0), 0) - a.montos.reduce<number>((t, x) => t + (x ?? 0), 0)));
  };
  return { vista, meses: cols.map((c) => c.col), costos: lineas("costos"), gastos: lineas("gastos") };
}
