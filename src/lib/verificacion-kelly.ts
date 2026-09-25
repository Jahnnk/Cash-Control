/**
 * Verificación automática: ¿el sistema muestra lo que dice el Excel de Kelly?
 * · MOTOR (puro).
 *
 * Pedido de Jahnn (25-sep-2026): "yo confío en que el sistema muestra los
 * datos tal cual el Excel de Kelly… no puedo hacer siempre el mismo trabajo
 * de comparar. Halla la manera de asegurar que no vuelva a suceder".
 *
 * El caso que lo motivó: el saldo del alquiler de setiembre (S/300) le cargó
 * S/1,800 a Atelier. El control que ya existía se hacía ANTES de importar y
 * confiaba en que el importador copiaba bien; el error estaba DENTRO del
 * importador y nadie volvía a mirar después.
 *
 * Esta verificación se rehace sola cada vez que se abre Grupo → Resumen (y
 * al terminar cada carga), con tres controles:
 *
 *   1. PLATA COMPLETA: lo importado suma exactamente lo que dice la "foto"
 *      del Excel guardada al cargar (menos lo que se omitió a propósito por
 *      estar ya registrado como compartido).
 *   2. PUENTE: del total del Excel al número que muestra el sistema, cada sol
 *      de diferencia con su razón (reembolsos, parte de otra sede, préstamos,
 *      lo que solo registra dirección). Lo que quede sin razón es alerta.
 *   3. REGLAS DE SENTIDO COMÚN sobre los datos: repartos que no suman o dan
 *      negativo, montos fijos cobrados dos veces, préstamos o reembolsos
 *      contados como venta.
 *
 * Si todo pasa: "✓ Cuadra con el Excel". Si no, cada alerta dice qué es y
 * dónde mirarla.
 */

import { categoriaPrestamoIngreso } from "./prestamo-ingreso";
import { esReembolsoEntreSedes } from "./reembolsos-entre-sedes";

export type IngresoFila = {
  monto: number;
  importado: boolean;
  fecha: string;
  nota: string;
  reembolsoEntreSedes: boolean;
  prestamoSocio: boolean;
  transferenciaInterna: boolean;
  noOperativo: string | null;
};

export type GastoFila = {
  monto: number;
  importado: boolean;
  fecha: string;
  categoria: string;
  concepto: string;
  compartido: boolean;
  atelier: number | null;
  fonavi: number | null;
  centro: number | null;
  prestamoSocio: boolean;
  transferenciaInterna: boolean;
};

export type Foto = { ingresos: number; egresos: number; omitidosEgresos: number };

export type LineaPuente = { etiqueta: string; monto: number; nota?: string };

export type Alerta = { regla: string; titulo: string; detalle: string };

export type Verificacion = {
  estado: "ok" | "alerta" | "sin-foto";
  puenteIngresos: LineaPuente[];
  puenteGastos: LineaPuente[];
  /** Lo que muestra el sistema (Grupo → Resumen). */
  sistema: { ingresos: number; gastos: number };
  /** Diferencia que ningún motivo explica (debe ser 0). */
  sinExplicar: { ingresos: number; gastos: number };
  alertas: Alerta[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = <T>(xs: T[], f: (x: T) => number) => r2(xs.reduce((t, x) => t + f(x), 0));
const soles = (n: number) => `S/${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** La parte del gasto que cuenta para la sede (igual que totales-mes-sede.ts). */
const partePropia = (g: GastoFila) => (g.compartido ? (g.atelier ?? g.monto) : g.monto);
const cuentaIngreso = (i: IngresoFila) => !i.reembolsoEntreSedes && !i.prestamoSocio && !i.transferenciaInterna && !i.noOperativo;
const cuentaGasto = (g: GastoFila) => !g.prestamoSocio && !g.transferenciaInterna;

export function verificarMes(input: {
  foto: Foto | null;
  ingresos: IngresoFila[];
  gastos: GastoFila[];
  /** Lo que muestra el sistema, de totales-mes-sede.ts. */
  sistema: { ingresos: number; gastos: number };
  /** Reglas de monto fijo de Atelier: categoría → lo que le toca al mes. */
  fijosAtelier: { categoria: string; concepto: string; fijo: number }[];
  esAtelier: boolean;
}): Verificacion {
  const { foto, ingresos, gastos, sistema } = input;
  const alertas: Alerta[] = [];
  const impIn = ingresos.filter((i) => i.importado);
  const manIn = ingresos.filter((i) => !i.importado);
  const impEx = gastos.filter((g) => g.importado);
  const manEx = gastos.filter((g) => !g.importado);

  // ── 1 y 2 · Puente de INGRESOS ──
  const cargadoIn = suma(impIn, (i) => i.monto);
  const puenteIngresos: LineaPuente[] = [];
  if (foto) {
    puenteIngresos.push({ etiqueta: "Ingresos del Excel de Kelly", monto: foto.ingresos });
    const dif = r2(cargadoIn - foto.ingresos);
    if (Math.abs(dif) >= 0.01) {
      puenteIngresos.push({ etiqueta: "Diferencia entre el Excel y lo cargado", monto: dif });
      alertas.push({
        regla: "plata-completa",
        titulo: "Los ingresos cargados no suman lo del Excel",
        detalle: `El Excel dice ${soles(foto.ingresos)} y se cargaron ${soles(cargadoIn)} (${dif > 0 ? "sobran" : "faltan"} ${soles(dif)}). Vuelve a subir el Excel de este mes.`,
      });
    }
  } else {
    puenteIngresos.push({ etiqueta: "Ingresos cargados del Excel", monto: cargadoIn, nota: "Sin foto del Excel: carga anterior al 25-sep-2026" });
  }
  const reemb = suma(impIn.filter((i) => i.reembolsoEntreSedes), (i) => i.monto);
  if (reemb) puenteIngresos.push({ etiqueta: "Reembolsos entre sedes (no son venta)", monto: -reemb });
  const noOp = suma(impIn.filter((i) => !i.reembolsoEntreSedes && i.noOperativo), (i) => i.monto);
  if (noOp) puenteIngresos.push({ etiqueta: "Préstamos y otros ingresos no operativos", monto: -noOp });
  const espIn = suma(impIn.filter((i) => !i.reembolsoEntreSedes && !i.noOperativo && (i.prestamoSocio || i.transferenciaInterna)), (i) => i.monto);
  if (espIn) puenteIngresos.push({ etiqueta: "Préstamos del socio y transferencias internas", monto: -espIn });
  const manualIn = suma(manIn.filter(cuentaIngreso), (i) => i.monto);
  if (manualIn) puenteIngresos.push({ etiqueta: "Registrado solo en el sistema (dirección)", monto: manualIn });
  const esperadoIn = r2(cargadoIn - reemb - noOp - espIn + manualIn);

  // ── 1 y 2 · Puente de GASTOS ──
  const cargadoEx = suma(impEx, (g) => g.monto);
  const puenteGastos: LineaPuente[] = [];
  if (foto) {
    puenteGastos.push({ etiqueta: "Gastos del Excel de Kelly", monto: foto.egresos });
    if (foto.omitidosEgresos) puenteGastos.push({ etiqueta: "Ya registrados como compartidos (no se duplican)", monto: -foto.omitidosEgresos });
    const dif = r2(cargadoEx - (foto.egresos - foto.omitidosEgresos));
    if (Math.abs(dif) >= 0.01) {
      puenteGastos.push({ etiqueta: "Diferencia entre el Excel y lo cargado", monto: dif });
      alertas.push({
        regla: "plata-completa",
        titulo: "Los gastos cargados no suman lo del Excel",
        detalle: `El Excel dice ${soles(foto.egresos - foto.omitidosEgresos)} y se cargaron ${soles(cargadoEx)} (${dif > 0 ? "sobran" : "faltan"} ${soles(dif)}). Vuelve a subir el Excel de este mes.`,
      });
    }
  } else {
    puenteGastos.push({ etiqueta: "Gastos cargados del Excel", monto: cargadoEx, nota: "Sin foto del Excel: carga anterior al 25-sep-2026" });
  }
  const otraSede = suma(impEx.filter((g) => g.compartido && cuentaGasto(g)), (g) => g.monto - partePropia(g));
  if (otraSede) puenteGastos.push({ etiqueta: "Parte de otras sedes en gastos compartidos", monto: -otraSede });
  const espEx = suma(impEx.filter((g) => !cuentaGasto(g)), (g) => g.monto);
  if (espEx) puenteGastos.push({ etiqueta: "Préstamos del socio y transferencias internas", monto: -espEx });
  const manualEx = suma(manEx.filter(cuentaGasto), partePropia);
  if (manualEx) puenteGastos.push({ etiqueta: "Registrado solo en el sistema (dirección)", monto: manualEx });
  const esperadoEx = r2(cargadoEx - otraSede - espEx + manualEx);

  const sinExplicar = { ingresos: r2(sistema.ingresos - esperadoIn), gastos: r2(sistema.gastos - esperadoEx) };
  if (Math.abs(sinExplicar.ingresos) >= 0.01) {
    puenteIngresos.push({ etiqueta: "Sin explicar", monto: sinExplicar.ingresos });
    alertas.push({ regla: "puente", titulo: "Hay ingresos que ninguna razón explica", detalle: `El sistema muestra ${soles(sistema.ingresos)} y el puente llega a ${soles(esperadoIn)}.` });
  }
  if (Math.abs(sinExplicar.gastos) >= 0.01) {
    puenteGastos.push({ etiqueta: "Sin explicar", monto: sinExplicar.gastos });
    alertas.push({ regla: "puente", titulo: "Hay gastos que ninguna razón explica", detalle: `El sistema muestra ${soles(sistema.gastos)} y el puente llega a ${soles(esperadoEx)}.` });
  }

  // ── 3 · Reglas de sentido común ──
  for (const g of gastos.filter((x) => x.compartido && cuentaGasto(x))) {
    const a = g.atelier ?? g.monto, f = g.fonavi ?? 0, c = g.centro ?? 0;
    if (Math.abs(a + f + c - g.monto) >= 0.01 || a < 0 || f < 0 || c < 0 || a > g.monto + 0.005) {
      alertas.push({
        regla: "reparto",
        titulo: "Un gasto compartido está mal repartido",
        detalle: `${g.fecha} · ${g.concepto} (${soles(g.monto)}): Atelier ${soles(a)}${a < 0 ? " negativo" : ""}, Fonavi ${f < 0 ? "−" : ""}${soles(f)}, Centro ${soles(c)}. Las partes tienen que sumar el total y ninguna puede ser negativa.`,
      });
    }
  }
  if (input.esAtelier) {
    for (const r of input.fijosAtelier) {
      const cargado = suma(gastos.filter((g) => g.compartido && cuentaGasto(g) && g.categoria === r.categoria), partePropia);
      if (cargado > r.fijo + 0.01) {
        alertas.push({
          regla: "fijo",
          titulo: `${r.concepto}: a Atelier se le cargó más que su monto fijo`,
          detalle: `Le tocan ${soles(r.fijo)} al mes y se le cargaron ${soles(cargado)}. Pasa cuando un pago se parte en varios y el fijo se aplica a cada uno.`,
        });
      }
    }
  }
  for (const i of ingresos.filter(cuentaIngreso)) {
    if (categoriaPrestamoIngreso(i.nota)) {
      alertas.push({ regla: "prestamo", titulo: "Un préstamo está contado como venta", detalle: `${i.fecha} · ${i.nota} (${soles(i.monto)}). Debe ir como ingreso no operativo.` });
    } else if (esReembolsoEntreSedes(i.nota)) {
      alertas.push({ regla: "reembolso", titulo: "Un reembolso entre sedes está contado como venta", detalle: `${i.fecha} · ${i.nota} (${soles(i.monto)}).` });
    }
  }

  return {
    estado: alertas.length > 0 ? "alerta" : foto ? "ok" : "sin-foto",
    puenteIngresos,
    puenteGastos,
    sistema,
    sinExplicar,
    alertas,
  };
}

/** Lee "omitidos_egresos=123.45" de las notas del lote. */
export function omitidosDeNotas(notas: string | null): number {
  const m = notas?.match(/omitidos_egresos=([\d.]+)/);
  return m ? Number(m[1]) : 0;
}
