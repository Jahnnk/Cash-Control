/**
 * Los cuatro motores del EBITDA · MOTOR (puro).
 *
 * Pedido de Jahnn (15-oct-2026), de la asesoría con su coach de negocios: el EBITDA mide la solidez
 * del motor operativo, no la velocidad de las ventas, y depende de cuatro motores:
 *
 *   1. VENTAS — «el tamaño del bolso».
 *   2. COSTO DEL PRODUCTO — food cost, el costo directo y variable de cada producto.
 *   3. COSTOS FIJOS — planilla (máximo 25% de la venta), alquiler y energía.
 *   4. EFICIENCIA DEL SISTEMA — procesos, roles y comunicación del equipo y la cocina.
 *
 * Cada decisión del día a día cae en uno de los cuatro; cuando el EBITDA sale bajo, la causa es un
 * desbalance de estos motores internos, no el mercado. Esta pieza dice cuál motor frena más.
 *
 * Los tres primeros son plata y se reparten el hueco entre el EBITDA y su meta SIN contar dos veces:
 *
 *   hueco = (costos − su tercio) + (fijos − su tercio)           (lib/regla-33.ts: lo que se pasaron)
 *   · producto = lo que los costos variables se pasaron de su tercio.
 *   · ventas   = la parte de lo que los fijos se pasaron que se debe a vender menos de lo esperado
 *                (los fijos se reparten entre menos ventas): F × (esperada − vendida) ÷ esperada.
 *   · fijos    = el resto de lo que los fijos se pasaron (gastan más de lo que les toca).
 *
 * El cuarto no es plata: es un semáforo con señales que el sistema YA comprueba (mermas, tiempos de
 * atención, cumplimiento del registro, de los reportes y del Highlight, supervisiones a tiempo). Nunca
 * casillas que alguien marca (regla de Jahnn: al CEO solo lo que el sistema verifica).
 */

import { dondeFalta, TOPE_PLANILLA_PCT, PLANILLA_SANA_MIN_PCT, type FilaRegla } from "./regla-33";

export type EstadoMotor = "verde" | "ambar" | "rojo" | "gris";
export type ClaveMotor = "ventas" | "producto" | "fijos" | "eficiencia";

export type Senal = {
  clave: string;
  etiqueta: string;
  estado: EstadoMotor;
  /** El dato en una frase corta («3.1% de la venta · meta 4%»). */
  detalle: string;
  /** El número detrás (solo en las señales que lo tienen, p. ej. el % de mermas) y la base para promediar entre sedes. */
  valor?: number | null;
  peso?: number | null;
  /** La meta de ese número (mismas unidades). */
  meta?: number | null;
};

export type Motor = {
  clave: ClaveMotor;
  titulo: string;
  estado: EstadoMotor;
  /** La cifra principal («S/37,294» o «45.9%»). */
  cifra: string;
  /** Contra qué se mide («meta 33%»). */
  meta: string;
  /** Una frase que dice qué pasa. */
  frase: string;
  /** Plata que este motor le quita al EBITDA respecto de su meta (null = no es plata, o no se puede medir). */
  quita: number | null;
  /** Qué tan cerca está de su meta, 0 a 100 (100 = en su meta o mejor); para el radar. null = sin dato. */
  puntaje: number | null;
  senales?: Senal[];
};

export type EntradaMotores = {
  /** La fila de la regla 33-33-33 de la sede (o del Grupo). */
  regla: FilaRegla;
  ventas: {
    /** Lo vendido en el período (hasta el último día con Excel). */
    monto: number;
    /** La venta que se esperaba en ese período (presupuesto o venta típica, ya llevada al mismo tramo del mes). null = no se sabe. */
    esperada: number | null;
    /** Lo vendido en el mismo tramo del mes anterior. null = no se sabe. */
    mesAnterior: number | null;
  };
  senales: Senal[];
};

export type Motores = {
  etiqueta: string;
  esGrupo: boolean;
  motores: Motor[];
  /** El motor que más frena el EBITDA; null si el EBITDA llega a su meta o no hay base. */
  frena: ClaveMotor | null;
  /** La frase para titular («El motor que más frena: costos fijos»). */
  titular: string;
};

const NOMBRE: Record<ClaveMotor, string> = {
  ventas: "Ventas",
  producto: "Costo del producto",
  fijos: "Costos fijos",
  eficiencia: "Eficiencia del sistema",
};
const NOMBRE_FRENA: Record<ClaveMotor, string> = { ventas: "las ventas", producto: "el costo del producto", fijos: "los costos fijos", eficiencia: "la eficiencia del sistema" };

/** Plata de menos de esto no cuenta como «frena» (ruido). */
export const MINIMO_QUE_FRENA = 50;

const soles = (n: number) => `S/${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Verde si llega, ámbar si está a menos de 5% de su meta, rojo si queda más lejos (como los KPIs de la sede). */
function porRatio(valor: number, meta: number): EstadoMotor {
  const r = valor / meta;
  return r >= 1 ? "verde" : r >= 0.95 ? "ambar" : "rojo";
}

const PESO: Record<EstadoMotor, number> = { rojo: 0, ambar: 1, verde: 2, gris: 3 };

/** El peor estado entre varias señales con dato; gris si ninguna tiene. */
export function peorEstado(estados: EstadoMotor[]): EstadoMotor {
  const con = estados.filter((e) => e !== "gris");
  if (con.length === 0) return "gris";
  return con.reduce((p, e) => (PESO[e] < PESO[p] ? e : p));
}

export function motoresDeSede(e: EntradaMotores): Motores {
  const f = e.regla;
  const base = { etiqueta: f.etiqueta, esGrupo: f.esGrupo };
  const sinBase = !f.ebitda || !f.costos || !f.fijos || f.ventas === null || f.ventas <= 0;

  // ── 4. Eficiencia: semáforo con las señales que el sistema comprueba ──
  const conDato = e.senales.filter((s) => s.estado !== "gris");
  const verdes = conDato.filter((s) => s.estado === "verde").length;
  const eficiencia: Motor = {
    clave: "eficiencia", titulo: NOMBRE.eficiencia,
    estado: peorEstado(e.senales.map((s) => s.estado)),
    cifra: conDato.length > 0 ? `${verdes} de ${conDato.length} en verde` : "—",
    meta: "todas en verde",
    frase: conDato.length === 0
      ? "Todavía no hay señales medibles de este período."
      : conDato.length === verdes
        ? "Procesos y comunicación al día en lo que el sistema puede comprobar."
        : `Revisar: ${conDato.filter((s) => s.estado !== "verde").map((s) => s.etiqueta.toLowerCase()).join(", ")}.`,
    quita: null,
    puntaje: conDato.length > 0 ? Math.round((verdes / conDato.length) * 100) : null,
    senales: e.senales,
  };

  if (sinBase) {
    const vacio = (clave: ClaveMotor): Motor => ({ clave, titulo: NOMBRE[clave], estado: "gris", cifra: "—", meta: "", frase: f.sinResultadoPorque ?? "Sin datos", quita: null, puntaje: null });
    return { ...base, motores: [vacio("ventas"), vacio("producto"), vacio("fijos"), eficiencia], frena: null, titular: f.sinResultadoPorque ?? "Sin datos para este período" };
  }

  const vendido = e.ventas.monto;
  const esperada = e.ventas.esperada && e.ventas.esperada > 0 ? e.ventas.esperada : null;
  const costos = f.costos!;
  const fijos = f.fijos!;
  const d = dondeFalta(f)!;

  // ── Reparto del hueco entre los tres motores de plata ──
  const excesoFijos = d.masFijos;
  const porVolumen = esperada && vendido < esperada ? Math.min(excesoFijos, r2((fijos.monto * (esperada - vendido)) / esperada)) : 0;
  const quitaVentas = r2(porVolumen);
  const quitaFijos = r2(Math.max(0, excesoFijos - porVolumen));
  const quitaProducto = r2(d.masCostos);

  // ── 1. Ventas ──
  const deltaMes = e.ventas.mesAnterior && e.ventas.mesAnterior > 0 ? ((vendido - e.ventas.mesAnterior) / e.ventas.mesAnterior) * 100 : null;
  const estadoVentas: EstadoMotor = esperada ? porRatio(vendido, esperada) : (f.ebitda!.monto >= 0 ? "verde" : "ambar");
  const ventas: Motor = {
    clave: "ventas", titulo: NOMBRE.ventas, estado: estadoVentas,
    cifra: soles(vendido),
    meta: esperada ? `esperada ${soles(esperada)}` : "sin meta ni historial",
    frase: [
      esperada
        ? (vendido >= esperada ? `Vendió ${soles(vendido - esperada)} más de lo esperado.` : `Vendió ${soles(esperada - vendido)} menos de lo esperado (${pct((vendido / esperada) * 100)} de la meta).`)
        : "No hay venta esperada con qué compararla.",
      deltaMes !== null ? (Math.abs(deltaMes) < 0.5 ? "Igual que el mes anterior." : `${deltaMes >= 0 ? "+" : ""}${pct(deltaMes)} contra el mes anterior.`) : "",
      quitaVentas >= MINIMO_QUE_FRENA ? `Con menos ventas los fijos pesan más: eso le quita ${soles(quitaVentas)} al EBITDA.` : "",
    ].filter(Boolean).join(" "),
    quita: esperada ? quitaVentas : null,
    puntaje: esperada ? Math.round(Math.min(100, (vendido / esperada) * 100)) : null,
  };

  // ── 2. Costo del producto ──
  const estadoProducto: EstadoMotor = costos.pct <= costos.metaPct ? "verde" : costos.pct <= costos.metaPct + 3 ? "ambar" : "rojo";
  const producto: Motor = {
    clave: "producto", titulo: NOMBRE.producto, estado: estadoProducto,
    cifra: pct(costos.pct), meta: `meta ${Math.round(costos.metaPct)}%`,
    frase: quitaProducto >= MINIMO_QUE_FRENA
      ? `Se pasó de su tercio: le quita ${soles(quitaProducto)} al EBITDA.`
      : "Está dentro de su tercio.",
    quita: quitaProducto,
    puntaje: costos.pct > 0 ? Math.round(Math.min(100, (costos.metaPct / costos.pct) * 100)) : 100,
  };

  // ── 3. Costos fijos ──
  const planilla = f.planilla;
  const estadoFijos: EstadoMotor = fijos.pct <= fijos.metaPct ? "verde" : fijos.pct <= fijos.metaPct + 5 ? "ambar" : "rojo";
  const fijosMotor: Motor = {
    clave: "fijos", titulo: NOMBRE.fijos,
    estado: planilla?.pasaDelTope && estadoFijos === "verde" ? "ambar" : estadoFijos,
    cifra: pct(fijos.pct), meta: `meta ${Math.round(fijos.metaPct)}%`,
    frase: [
      excesoFijos >= MINIMO_QUE_FRENA
        ? `Se pasó ${soles(excesoFijos)} de su tercio${quitaVentas >= MINIMO_QUE_FRENA ? `: ${soles(quitaVentas)} por vender menos de lo esperado y ${soles(quitaFijos)} por gastar más de lo que le toca` : ""}.`
        : "Está dentro de su tercio.",
      planilla ? `Planilla ${pct(planilla.pct)} de la venta (sano ${PLANILLA_SANA_MIN_PCT}–${TOPE_PLANILLA_PCT}%).` : "",
    ].filter(Boolean).join(" "),
    quita: quitaFijos,
    puntaje: fijos.pct > 0 ? Math.round(Math.min(100, (fijos.metaPct / fijos.pct) * 100)) : 100,
  };

  const motores = [ventas, producto, fijosMotor, eficiencia];

  // ── El que más frena ──
  const dinero: [ClaveMotor, number][] = [["ventas", quitaVentas], ["producto", quitaProducto], ["fijos", quitaFijos]];
  const [claveMax, max] = dinero.reduce((m, x) => (x[1] > m[1] ? x : m), dinero[0]);
  let frena: ClaveMotor | null = null;
  let titular: string;
  if (f.ebitda!.difMeta <= 0) {
    titular = "El EBITDA llega a su meta: ningún motor frena.";
  } else if (max >= MINIMO_QUE_FRENA) {
    frena = claveMax;
    titular = `El motor que más frena: ${NOMBRE_FRENA[claveMax]}${max > 0 ? ` (${soles(max)})` : ""}.`;
  } else if (eficiencia.estado === "rojo") {
    frena = "eficiencia";
    titular = "El motor que más frena: la eficiencia del sistema.";
  } else {
    titular = "El EBITDA está por debajo de su meta, pero ningún motor se pasa de forma clara.";
  }
  // Mes a medias: la planilla y el alquiler se pagan en fechas puntuales, así que los fijos aún no están completos.
  if (!f.mesCompleto) titular += " Mes a medias: los gastos fijos todavía no están completos.";
  return { ...base, motores, frena, titular };
}
