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
