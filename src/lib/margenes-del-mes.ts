/**
 * Los dos márgenes de cada sede, lado a lado (pedido de Jahnn, 4-oct-2026).
 *
 *   Margen de ganancia = Ganancia real ÷ Ventas
 *                      = (Ventas − Costos − Gastos − Impuestos) ÷ Ventas.
 *                        ¿Ganó o perdió la sede? No cuenta deudas, préstamos,
 *                        ahorro ni utilidades a socios.
 *   Margen de caja     = (Entró − Salió) ÷ Entró. Es el que Kelly escribe bajo
 *                        cada bloque de su Excel. ¿Alcanzó el dinero? Cuenta TODO
 *                        lo que entró y salió.
 *
 * Septiembre 2026: Fonavi 16.7% / 10.59%, Centro 16.0% / −2.10%, Atelier 0.8% / −10.97%.
 * Los números salen de getSeisCifras: esta pieza solo los junta y explica la diferencia.
 */

import type { CifrasSede, CifrasGrupo } from "./seis-cifras";
import { margenDeCaja } from "./verificacion-kelly";

/** Lo mínimo que se necesita de getSeisCifras (así no se importa la action en pantallas ni pruebas). */
export type SeisCifrasLike = { mes: string; sedes: CifrasSede[]; grupo: CifrasGrupo };

export type FilaMargenes = {
  etiqueta: string;
  esGrupo: boolean;
  corte: string | null;
  mesCompleto: boolean;
  ventas: number | null;
  ganancia: number | null;
  gananciaPct: number | null;
  sinGananciaPorque: string | null;
  entro: number;
  salio: number;
  flujo: number;
  /** null cuando el mes no tiene gastos cargados: ahí la razón es la misma que la de la ganancia. */
  margenCajaPct: number | null;
  /** Cuánto salió por cada S/ 100 que entró (Kelly: "gastos ÷ ingresos"). */
  salioPor100: number | null;
};

const ORDEN = [2, 3, 1];
const r2 = (n: number) => Math.round(n * 100) / 100;

function deSede(s: CifrasSede): FilaMargenes {
  return {
    etiqueta: s.sede, esGrupo: false, corte: s.corte, mesCompleto: s.mesCompleto,
    ventas: s.ventas, ganancia: s.ganancia, gananciaPct: s.gananciaPct,
    sinGananciaPorque: s.conResultado ? null : s.sinResultadoPorque,
    entro: s.caja.entro, salio: s.caja.salio, flujo: s.caja.flujo,
    // Sin gastos cargados (mes recién empezado) la caja daría +100%: no es un margen, es que falta el Excel.
    margenCajaPct: s.conResultado ? margenDeCaja(s.caja.entro, s.caja.salio) : null,
    salioPor100: s.conResultado && s.caja.entro > 0 ? r2((s.caja.salio / s.caja.entro) * 100) : null,
  };
}

export function margenesDelMes(c: SeisCifrasLike): FilaMargenes[] {
  const sedes = ORDEN.map((id) => c.sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s).map(deSede);
  const g = c.grupo;
  const grupo: FilaMargenes = {
    etiqueta: "Grupo", esGrupo: true,
    corte: null, mesCompleto: !g.provisional,
    ventas: g.ventas, ganancia: g.ganancia, gananciaPct: g.gananciaPct,
    sinGananciaPorque: g.ganancia === null ? (g.sinResultado[0]?.porque ?? "Sin datos") : null,
    entro: g.caja.entro, salio: g.caja.salio, flujo: g.caja.flujo,
    margenCajaPct: g.ganancia !== null ? margenDeCaja(g.caja.entro, g.caja.salio) : null,
    salioPor100: g.ganancia !== null && g.caja.entro > 0 ? r2((g.caja.salio / g.caja.entro) * 100) : null,
  };
  return [...sedes, grupo];
}

/**
 * Una frase que explica por qué en la sede con más distancia entre los dos
 * márgenes no coinciden, con lo que ese mes salió de caja sin ser gasto.
 * null si ninguna sede tiene los dos márgenes.
 */
export function porQueDifieren(c: SeisCifrasLike): { sede: string; gananciaPct: number; cajaPct: number; motivos: { etiqueta: string; monto: number }[] } | null {
  let mejor: ReturnType<typeof porQueDifieren> = null;
  let dist = 0;
  for (const s of c.sedes) {
    const caja = margenDeCaja(s.caja.entro, s.caja.salio);
    if (s.gananciaPct === null || caja === null) continue;
    const d = Math.abs(s.gananciaPct - caja);
    if (d > dist) {
      dist = d;
      const motivos = [
        { etiqueta: "cuotas de deuda", monto: s.fuera.deudas },
        { etiqueta: "ahorro a fondos mutuos", monto: s.fuera.ahorro },
        { etiqueta: "utilidades a socios", monto: s.fuera.reparto },
        { etiqueta: "equipos e inversión", monto: s.fuera.inversion },
      ].filter((m) => m.monto >= 1);
      mejor = { sede: s.sede, gananciaPct: s.gananciaPct, cajaPct: caja, motivos };
    }
  }
  return dist >= 1 ? mejor : null;
}

// ─────────────────────────────────────────────────────────────────
// El resultado de la OPERACIÓN según el Excel (15-oct-2026)
// ─────────────────────────────────────────────────────────────────

/**
 * Auditoría del Excel de Kelly (15-oct-2026): el margen que ella escribe al pie
 * de cada hoja es de CAJA y cuenta como gasto el ahorro a fondos mutuos, las
 * utilidades a socios, las cuotas de deuda y los equipos. En Centro de setiembre
 * eso daba −2.10% cuando la operación dejó ~14% (y la ganancia real, 16.0%).
 * Esta fila muestra lo mismo que Kelly pero SEPARANDO lo que no es gasto del
 * negocio, y deja la cifra de Kelly al lado:
 *
 *   Ingresos de la operación = lo que entró de las ventas (sin préstamos,
 *                              rescates ni reembolsos): la barra «Ingresado».
 *   Gastos de la operación   = costos + gastos + impuestos (sin ahorro, utilidades,
 *                              cuotas de deuda, equipos ni la parte de otras sedes).
 *   Margen operativo         = (Ingresos − Gastos de la operación) ÷ Ingresos.
 *
 * Las utilidades a socios de Centro (S/2,400 al mes: S/1,200 para Juani y S/1,200 para
 * Jahnn) salen de un rescate de fondos mutuos que entra el mismo mes (Jahnn, 15-oct-2026):
 * en la caja quedan en cero y no son ni venta ni gasto.
 *
 * Ojo: no es la ganancia real (esa usa las ventas de Byte). Es el mismo Excel, mejor leído.
 */
export type FilaOperativa = {
  etiqueta: string;
  esGrupo: boolean;
  corte: string | null;
  mesCompleto: boolean;
  /** null = la sede no tiene Excel (o gastos cargados) todavía: no hay margen que mostrar. */
  ingresos: number | null;
  gastos: number | null;
  margenPct: number | null;
  /** Lo que Kelly ve: todo lo que entró y salió, y su margen. */
  entro: number;
  salio: number;
  margenCajaPct: number | null;
  /** Salió de la caja sin ser gasto del negocio, con su detalle. */
  salioFuera: number;
  detalleFuera: { etiqueta: string; monto: number }[];
};

type Fuera = CifrasSede["fuera"];

function detalleFuera(f: Fuera, otrasSedes: number): { etiqueta: string; monto: number }[] {
  const otros = f.noEsGasto - f.ahorro - f.reparto;
  return [
    { etiqueta: "ahorro a fondos mutuos", monto: f.ahorro },
    { etiqueta: "utilidades a socios (adelanto que sale del ahorro)", monto: f.reparto },
    { etiqueta: "cuotas de deuda", monto: f.deudas },
    { etiqueta: "equipos e inversión", monto: f.inversion },
    { etiqueta: "devoluciones y préstamos entre sedes", monto: otros },
    { etiqueta: "parte de otras sedes en gastos compartidos", monto: otrasSedes },
  ].map((x) => ({ ...x, monto: r2(x.monto) })).filter((x) => x.monto >= 1);
}

function operativaDeSede(s: CifrasSede): FilaOperativa {
  const hay = s.conResultado && s.cobrado !== null;
  const gastos = s.costos + s.gastos + s.impuestos;
  const det = detalleFuera(s.fuera, s.fuera.otrasSedes);
  return {
    etiqueta: s.sede, esGrupo: false, corte: s.corte, mesCompleto: s.mesCompleto,
    ingresos: hay ? r2(s.cobrado as number) : null,
    gastos: hay ? r2(gastos) : null,
    margenPct: hay ? margenDeCaja(s.cobrado as number, gastos) : null,
    entro: s.caja.entro, salio: s.caja.salio,
    margenCajaPct: s.conResultado ? margenDeCaja(s.caja.entro, s.caja.salio) : null,
    salioFuera: r2(det.reduce((t, x) => t + x.monto, 0)),
    detalleFuera: det,
  };
}

export function resultadoOperativo(c: SeisCifrasLike): FilaOperativa[] {
  const sedes = ORDEN.map((id) => c.sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s);
  const filas = sedes.map(operativaDeSede);
  // El grupo suma las sedes que ya tienen resultado, igual que el Excel de Kelly suma las suyas.
  const con = filas.filter((f) => f.ingresos !== null);
  const ingresos = con.reduce((t, f) => t + (f.ingresos ?? 0), 0);
  const gastos = con.reduce((t, f) => t + (f.gastos ?? 0), 0);
  const etiquetas = new Map<string, number>();
  for (const f of filas) for (const d of f.detalleFuera) etiquetas.set(d.etiqueta, (etiquetas.get(d.etiqueta) ?? 0) + d.monto);
  const det = [...etiquetas.entries()].map(([etiqueta, monto]) => ({ etiqueta, monto: r2(monto) }));
  const g = c.grupo;
  const grupo: FilaOperativa = {
    etiqueta: "Grupo", esGrupo: true, corte: null, mesCompleto: !g.provisional,
    ingresos: con.length ? r2(ingresos) : null,
    gastos: con.length ? r2(gastos) : null,
    margenPct: con.length ? margenDeCaja(ingresos, gastos) : null,
    entro: g.caja.entro, salio: g.caja.salio,
    margenCajaPct: g.ganancia !== null ? margenDeCaja(g.caja.entro, g.caja.salio) : null,
    salioFuera: r2(det.reduce((t, x) => t + x.monto, 0)),
    detalleFuera: det,
  };
  return [...filas, grupo];
}
