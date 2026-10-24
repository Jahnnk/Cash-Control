/**
 * ¿Los números de este mes son confiables? · los controles de fiabilidad (lógica pura).
 *
 * Pedido de Jahnn tras la auditoría de setiembre 2026 (24-oct-2026): que el sistema GARANTICE que las cifras del
 * mes son confiables, o diga por qué no. Ocho controles; cada uno devuelve un semáforo, la diferencia en soles, el
 * detalle y qué hacer. Corren al importar cada Excel y al abrir el mes (lib/controles-fiabilidad-sql.ts).
 *
 *   C1 Movimientos completos   · lo importado = los totales INGRESOS/GASTOS del pie de la hoja.
 *   C2 Ventas                  · Byte contra el Control de VTAS del Excel, día por día.
 *   C3 Clasificación           · cuánto del gasto quedó POR ACLARAR o fuera del catálogo.
 *   C4 Cuadre de banco         · saldo inicial + ingresos − egresos del banco = saldo del banco del Excel
 *                                (la columna «Debe ser 0» de Kelly).
 *   C5 Caja                    · nunca negativa, y lo vendido en efectivo depositado (CONTROL EFECTIVO).
 *   C6 Filas con tipo dudoso   · filas «REVISAR TIPO» (lib/revisar-tipo.ts) pendientes.
 *   C7 Coherencia de las cifras· las seis cifras cuadran entre sí (si falla es un error de la APP, no del dato).
 *   C8 Carga vigente           · la carga que manda es la última y cubre el mes.
 *
 * Estado del mes: «Confiable» si todo está en verde; «Con observaciones» si hay amarillos y ningún rojo;
 * «No confiable» si hay algún rojo.
 */

import { cifrasDelMes, cajaDelMes, entroALaCuenta, gastosEnCifras, revisarTipoDelMes, salioDeLaCuenta, type DatosMesSede } from "./seis-cifras-mes";
import { puntoDeEquilibrio, type CifrasGrupo, type CifrasSede } from "./seis-cifras";
import { CONFIG_PROFIT_FIRST, regla33, reglaDeSede, type ConfigProfitFirst, type FilaRegla } from "./regla-33";
import { esCategoriaDelCatalogo } from "./catalogo-categorias";
import { POR_ACLARAR } from "./reglas-gasto";

export type Semaforo = "verde" | "amarillo" | "rojo";
export type EstadoMes = "confiable" | "con_observaciones" | "no_confiable";

export type Control = {
  id: "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";
  nombre: string;
  estado: Semaforo;
  /** La diferencia en soles (null si el control no mide plata). */
  diferencia: number | null;
  detalle: string;
  /** Qué hacer, en concreto (vacío si está en verde). */
  queHacer: string;
  /** Las filas o días que explican el resultado (para mostrarlos). */
  filas?: string[];
};

export type ControlesMes = { businessId: number; sede: string; mes: string; estado: EstadoMes; controles: Control[] };

/** Lo que el Excel dice de sí mismo y las cargas del mes. */
export type LoteMes = { id: string; cargadoEl: string; archivo: string; vigente: boolean };

export type DatosControles = {
  datos: DatosMesSede;
  /** Los totales del pie de la hoja (notas del lote vigente); null si la hoja no los trae. */
  hoja: { ingresos: number; egresos: number } | null;
  /** Las cargas de Ing&Gtos del mes, de la más vieja a la más nueva. */
  lotes: LoteMes[];
  /** Saldos que guardó cada Excel (sede_balances): el del cierre del mes anterior y los del mes. */
  saldoInicial: { fecha: string; banco: number | null; caja: number } | null;
  saldosDelMes: { fecha: string; banco: number | null; caja: number }[];
  /** Venta de cada día según el reporte de Byte y según el Control de VTAS del Excel. */
  ventasDia: { byte: { date: string; total: number }[]; excel: { date: string; total: number }[] };
  /** La fila TOTAL de la pestaña CONTROL EFECTIVO del Excel vigente (null = no la trae). */
  efectivo: { ventas: number; depositos: number } | null;
  config?: ConfigProfitFirst;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const suma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
const soles = (n: number) => `${n < 0 ? "−" : ""}S/${Math.abs(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Con signo siempre (+/−): para diferencias. */
const conSigno = (n: number) => (n > 0 ? `+${soles(n)}` : soles(n));
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export function estadoDe(controles: Control[]): EstadoMes {
  if (controles.some((c) => c.estado === "rojo")) return "no_confiable";
  if (controles.some((c) => c.estado === "amarillo")) return "con_observaciones";
  return "confiable";
}

export const NOMBRE_ESTADO: Record<EstadoMes, string> = { confiable: "Confiable", con_observaciones: "Con observaciones", no_confiable: "No confiable" };

// ─────────────────────────── C1 ───────────────────────────
export function c1Movimientos(d: DatosControles): Control {
  const nombre = "Movimientos completos";
  const imp = { ingresos: r2(suma(d.datos.ingresos.filter((i) => i.importado), (i) => i.monto)), egresos: r2(suma(d.datos.gastos.filter((g) => g.importado), (g) => g.monto)) };
  if (!d.hoja) {
    return { id: "C1", nombre, estado: "amarillo", diferencia: null, detalle: `La hoja no trae los totales INGRESOS/GASTOS al pie: no se pudo comprobar. Importado: ingresos ${soles(imp.ingresos)}, egresos ${soles(imp.egresos)}.`, queHacer: "Pedir que el pie de la hoja mantenga la fila de totales INGRESOS/GASTOS y volver a subir el Excel." };
  }
  const di = r2(imp.ingresos - d.hoja.ingresos), de = r2(imp.egresos - d.hoja.egresos);
  const ok = Math.abs(di) < 0.005 && Math.abs(de) < 0.005;
  return {
    id: "C1", nombre, estado: ok ? "verde" : "rojo", diferencia: r2(Math.abs(di) + Math.abs(de)),
    detalle: ok
      ? `Lo importado cuadra al céntimo con el pie de la hoja: ingresos ${soles(imp.ingresos)}, egresos ${soles(imp.egresos)}.`
      : `Ingresos: importado ${soles(imp.ingresos)} vs pie ${soles(d.hoja.ingresos)} (${conSigno(di)}). Egresos: importado ${soles(imp.egresos)} vs pie ${soles(d.hoja.egresos)} (${conSigno(de)}).`,
    queHacer: ok ? "" : "Revisar el pie del Excel: su fórmula de totales no abarca todas las filas (o hay filas que no debían importarse). Corregir y volver a subir.",
  };
}

// ─────────────────────────── C2 ───────────────────────────
export function c2Ventas(d: DatosControles, corte: string | null): Control {
  const nombre = "Ventas: Byte vs Control de VTAS";
  const tope = corte ?? d.datos.hastaHoy;
  const b = new Map(d.ventasDia.byte.filter((x) => x.date <= tope).map((x) => [x.date, x.total]));
  const e = new Map(d.ventasDia.excel.filter((x) => x.date <= tope).map((x) => [x.date, x.total]));
  if (b.size === 0 || e.size === 0) {
    return { id: "C2", nombre, estado: "amarillo", diferencia: null, detalle: b.size === 0 ? "No hay reporte de ventas de Byte del mes." : "El Excel no trae el Control de VTAS del mes.", queHacer: b.size === 0 ? "Subir el reporte de ventas de Byte en el Dashboard." : "Subir el Excel con la pestaña Control de VTAS." };
  }
  const dias = [...new Set([...b.keys(), ...e.keys()])].sort();
  const difs = dias.map((dia) => ({ dia, byte: b.get(dia) ?? 0, excel: e.get(dia) ?? 0 })).map((x) => ({ ...x, dif: r2(x.byte - x.excel) })).filter((x) => Math.abs(x.dif) >= 0.005);
  const tb = r2(suma([...b.values()], (x) => x)), te = r2(suma([...e.values()], (x) => x));
  const dif = r2(tb - te);
  const estado: Semaforo = Math.abs(dif) < 0.005 && difs.length === 0 ? "verde" : Math.abs(dif) <= 5 ? "amarillo" : "rojo";
  return {
    id: "C2", nombre, estado, diferencia: Math.abs(dif),
    detalle: `Byte ${soles(tb)} · Control de VTAS ${soles(te)} · diferencia ${conSigno(dif)}${difs.length ? ` en ${difs.length} día${difs.length === 1 ? "" : "s"}` : ""}.`,
    queHacer: estado === "verde" ? "" : "Comparar esos días en Byte y en el Control de VTAS del Excel; corregir el que esté mal (si es el Excel, volver a subirlo).",
    filas: difs.map((x) => `${ddmm(x.dia)}: Byte ${soles(x.byte)} · Excel ${soles(x.excel)} (${conSigno(x.dif)})`),
  };
}

// ─────────────────────────── C3 ───────────────────────────
export function c3Clasificacion(d: DatosControles): Control {
  const nombre = "Clasificación de gastos";
  const egresos = cajaDelMes(d.datos).salio;
  const dudosos = gastosEnCifras(d.datos).filter((g) => g.categoria === POR_ACLARAR || !esCategoriaDelCatalogo(g.categoria));
  const monto = r2(suma(dudosos, (g) => g.monto));
  const pct = egresos > 0 ? (monto / egresos) * 100 : 0;
  const estado: Semaforo = monto < 0.005 ? "verde" : pct <= 1 ? "amarillo" : "rojo";
  return {
    id: "C3", nombre, estado, diferencia: monto,
    detalle: estado === "verde"
      ? "Todos los gastos tienen una categoría del catálogo."
      : `${soles(monto)} (${pct.toFixed(2)}% de los egresos) quedaron POR ACLARAR o fuera del catálogo.`,
    queHacer: estado === "verde" ? "" : "Aclarar qué fue cada gasto (Por definir) o corregir su Grupo en el Excel y volver a subirlo.",
    filas: dudosos.map((g) => `${ddmm(g.fecha)} · ${g.concepto ?? "Sin concepto"} · ${g.categoria} · ${soles(g.monto)}`),
  };
}

// ─────────────────────────── C4 ───────────────────────────
export function c4Banco(d: DatosControles): Control {
  const nombre = "Cuadre de banco";
  const fin = d.saldosDelMes.filter((s) => s.banco !== null).at(-1);
  if (!d.saldoInicial || d.saldoInicial.banco === null || !fin) {
    return { id: "C4", nombre, estado: "amarillo", diferencia: null, detalle: !fin ? "El Excel del mes no trae el saldo del banco." : "No hay saldo del banco al cierre del mes anterior.", queHacer: "Subir el Excel del mes anterior y el de este mes con su saldo de banco." };
  }
  // El banco según las columnas del Excel (todo lo que no es efectivo), como la columna «Debe ser 0» de Kelly.
  const hasta = (f: string) => f <= fin.fecha;
  const entra = r2(suma(d.datos.ingresos.filter((i) => hasta(i.fecha) && entroALaCuenta(i) && i.metodo !== "efectivo"), (i) => i.monto));
  const sale = r2(suma(d.datos.gastos.filter((g) => hasta(g.fecha) && salioDeLaCuenta(g) && g.metodo !== "efectivo"), (g) => g.monto));
  const libro = r2(d.saldoInicial.banco + entra - sale);
  const dif = r2(fin.banco! - libro);
  const ok = Math.abs(dif) <= 1;
  return {
    id: "C4", nombre, estado: ok ? "verde" : "rojo", diferencia: Math.abs(dif),
    detalle: `Saldo inicial ${soles(d.saldoInicial.banco)} (${ddmm(d.saldoInicial.fecha)}) + ingresos ${soles(entra)} − egresos ${soles(sale)} = ${soles(libro)}. El banco según el Excel al ${ddmm(fin.fecha)}: ${soles(fin.banco!)}. Diferencia ${conSigno(dif)}.`,
    queHacer: ok ? "" : "Buscar el movimiento del banco que falta o sobra en el Excel (la columna «Debe ser 0» no está en cero), corregirlo y volver a subir el Excel.",
  };
}

// ─────────────────────────── C5 ───────────────────────────
/** Hasta cuánto puede no cuadrar lo vendido en efectivo con lo depositado. */
export const C5_VERDE_HASTA = 1;
export const C5_AMARILLO_HASTA = 20;

/**
 * Caja (24-oct-2026, ajuste de Jahnn): en Fonavi y Centro todo el efectivo se deposita al banco y se controla en la
 * pestaña CONTROL EFECTIVO (fila TOTAL). Que el libro no tenga movimientos en efectivo es lo normal; lo que importa es
 * que lo vendido en efectivo se haya depositado, y que la caja nunca esté en negativo.
 */
export function c5Caja(d: DatosControles): Control {
  const nombre = "Caja (efectivo)";
  const saldos = [...(d.saldoInicial ? [d.saldoInicial] : []), ...d.saldosDelMes];
  const negativos = saldos.filter((s) => s.caja < -0.005);
  const negTexto = negativos.map((s) => `Caja negativa al ${ddmm(s.fecha)}: ${soles(s.caja)}`);
  const ef = d.efectivo;
  const dif = ef ? r2(ef.ventas - ef.depositos) : null;
  const cuadre = ef && dif !== null
    ? `CONTROL EFECTIVO: vendido en efectivo ${soles(ef.ventas)}, depositado ${soles(ef.depositos)}, diferencia ${conSigno(dif)}.`
    : "El Excel no trae la pestaña CONTROL EFECTIVO del mes (o es una carga anterior al 24-oct-2026): no se pudo comprobar que el efectivo se depositó.";
  const estado: Semaforo = negativos.length || (dif !== null && Math.abs(dif) > C5_AMARILLO_HASTA) ? "rojo"
    : dif === null || Math.abs(dif) > C5_VERDE_HASTA ? "amarillo" : "verde";
  const queHacer = estado === "verde" ? "" : [
    negativos.length ? "Revisar el saldo de caja del Excel (la caja no puede estar en negativo) y volver a subirlo." : "",
    dif === null ? "Subir el Excel con su pestaña CONTROL EFECTIVO del mes." : Math.abs(dif) > C5_VERDE_HASTA ? "Depositar el efectivo pendiente o corregir la pestaña CONTROL EFECTIVO, y volver a subir el Excel." : "",
  ].filter(Boolean).join(" ");
  return {
    id: "C5", nombre, estado,
    diferencia: negativos.length ? Math.abs(Math.min(...negativos.map((s) => s.caja))) : dif === null ? null : Math.abs(dif),
    detalle: [...negTexto.map((t) => `${t}.`), cuadre].join(" "),
    queHacer,
  };
}

// ─────────────────────────── C6 ───────────────────────────
export function c6TipoDudoso(d: DatosControles): Control {
  const nombre = "Filas con tipo dudoso";
  const filas = revisarTipoDelMes(d.datos);
  const monto = r2(suma(filas, (f) => f.monto));
  return {
    id: "C6", nombre, estado: filas.length ? "rojo" : "verde", diferencia: filas.length ? monto : 0,
    detalle: filas.length
      ? `${filas.length} fila${filas.length === 1 ? "" : "s"} dice${filas.length === 1 ? "" : "n"} «I» (ingreso) pero tiene${filas.length === 1 ? "" : "n"} el monto en la columna de gastos: ${filas.length === 1 ? "está" : "están"} fuera de las seis cifras.`
      : "Ninguna fila con el tipo y la columna cruzados.",
    queHacer: filas.length ? "Corregir en el Excel el tipo (I/G) o la columna del monto de cada fila y volver a subirlo. No cerrar el mes hasta entonces." : "",
    filas: filas.map((f) => `${f.fila ? `Fila ${f.fila} · ` : ""}${ddmm(f.fecha)} · ${f.texto.replace(/^\[REVISAR TIPO\]\s*/i, "")} · ${soles(f.monto)}`),
  };
}

// ─────────────────────────── C7 ───────────────────────────
type Falla = string;
/** Las cuentas de una fila de la regla 33-33-33 y del punto de equilibrio, con la venta del resultado. */
function coherenciaDe(etiqueta: string, fila: FilaRegla, x: { costos: number; gastos: number; impuestos: number; ganancia: number | null; puntoEquilibrio: number | null }, ventas: number): Falla[] {
  const out: Falla[] = [];
  if (fila.ebitda && fila.costos && fila.fijos && fila.ventas !== null) {
    const ebitda = r2(fila.ventas - fila.costos.monto - fila.fijos.monto);
    if (Math.abs(ebitda - fila.ebitda.monto) > 0.01) out.push(`${etiqueta}: ventas − variables − fijos = ${soles(ebitda)}, pero el EBITDA dice ${soles(fila.ebitda.monto)}`);
    const pcts = r2(fila.costos.pct + fila.fijos.pct + fila.ebitda.pct);
    if (Math.abs(pcts - 100) > 0.1 + 1e-9) out.push(`${etiqueta}: %variables + %fijos + %EBITDA = ${pcts}%`);
  }
  if (x.ganancia !== null && Math.abs(r2(ventas - x.costos - x.gastos - x.impuestos) - x.ganancia) > 0.01) {
    out.push(`${etiqueta}: ventas − costos − gastos − impuestos = ${soles(r2(ventas - x.costos - x.gastos - x.impuestos))}, pero la ganancia dice ${soles(x.ganancia)}`);
  }
  const pe = x.ganancia === null ? null : puntoDeEquilibrio(x.gastos, x.costos, ventas);
  if ((pe === null) !== (x.puntoEquilibrio === null) || (pe !== null && Math.abs(pe - x.puntoEquilibrio!) > 0.01)) {
    out.push(`${etiqueta}: el punto de equilibrio ${x.puntoEquilibrio === null ? "—" : soles(x.puntoEquilibrio)} no se reproduce con fijos ÷ (1 − variables ÷ ventas) = ${pe === null ? "—" : soles(pe)}`);
  }
  return out;
}

export function c7Coherencia(cifras: CifrasSede, cfg: ConfigProfitFirst = CONFIG_PROFIT_FIRST): Control {
  const fallas = cifras.conResultado && cifras.ventas !== null ? coherenciaDe(cifras.sede, reglaDeSede(cifras, cfg), cifras, cifras.ventas) : [];
  return controlC7(fallas, cifras.conResultado ? "Ventas − variables − fijos = EBITDA, los tres % suman 100 y el punto de equilibrio se reproduce." : "Todavía no hay resultado del mes: nada que comprobar.");
}

/** C7 del grupo: además, cada cifra del grupo = la suma de sus sedes (sin la venta interna de Atelier). */
export function c7Grupo(grupo: CifrasGrupo, sedes: CifrasSede[], cfg: ConfigProfitFirst = CONFIG_PROFIT_FIRST): Control {
  // La venta del resultado del grupo (sin las sedes que no tienen resultado ni la venta interna).
  const ventasRes = grupo.ganancia === null ? 0 : r2(grupo.ganancia + grupo.costos + grupo.gastos + grupo.impuestos);
  const fila = regla33({ sedes: [], grupo, config: cfg }, cfg).at(-1)!;
  const fallas = grupo.ganancia === null ? [] : coherenciaDe("Grupo", fila, grupo, ventasRes);
  const con = sedes.filter((s) => s.conResultado);
  const interno = con.some((s) => s.businessId === 1) ? r2(suma(con.filter((s) => s.businessId !== 1), (s) => s.compraAtelier)) : 0;
  const esperado: [string, number, number][] = [
    ["costos variables", grupo.costos, r2(suma(con, (s) => s.costos) - interno)],
    ["costos fijos", grupo.gastos, r2(suma(con, (s) => s.gastos))],
    ["impuestos", grupo.impuestos, r2(suma(con, (s) => s.impuestos))],
    ["total de ingresos", grupo.caja.entro, r2(suma(sedes, (s) => s.caja.entro))],
    ["total de egresos", grupo.caja.salio, r2(suma(sedes, (s) => s.caja.salio))],
  ];
  if (grupo.ganancia !== null) esperado.push(["EBITDA", r2(grupo.ganancia + grupo.impuestos), r2(suma(con, (s) => (s.ganancia ?? 0) + s.impuestos))]);
  for (const [k, g, e] of esperado) if (Math.abs(g - e) > 0.01) fallas.push(`Grupo: ${k} ${soles(g)} ≠ suma de las sedes ${soles(e)}`);
  return controlC7(fallas, "Cada cifra del grupo es la suma de sus sedes y cuadra entre sí.");
}

function controlC7(fallas: Falla[], okTexto: string): Control {
  return {
    id: "C7", nombre: "Coherencia de las seis cifras", estado: fallas.length ? "rojo" : "verde", diferencia: null,
    detalle: fallas.length ? `La app calcula mal: ${fallas.join(" · ")}.` : okTexto,
    queHacer: fallas.length ? "Es un error de la app, no del Excel: avisar para corregir el cálculo. Mientras tanto no usar estas cifras." : "",
    filas: fallas,
  };
}

// ─────────────────────────── C8 ───────────────────────────
export function c8CargaVigente(d: DatosControles): Control {
  const nombre = "Carga vigente";
  const { finDeMes, hoy, corteExcel } = d.datos;
  if (d.lotes.length === 0) {
    return { id: "C8", nombre, estado: "amarillo", diferencia: null, detalle: "No hay ningún Excel de este mes cargado: las cifras salen de lo registrado a mano.", queHacer: "Subir el Excel del mes." };
  }
  const ultimo = d.lotes.at(-1)!;
  const vigentes = d.lotes.filter((l) => l.vigente);
  if (!ultimo.vigente) {
    return { id: "C8", nombre, estado: "amarillo", diferencia: null, detalle: `La última carga (${ultimo.archivo}, ${ddmm(ultimo.cargadoEl)}) no es la que está en el sistema${vigentes.length ? `: manda ${vigentes.at(-1)!.archivo}` : ""}.`, queHacer: "Volver a subir el último Excel del mes." };
  }
  const cerrado = finDeMes < hoy;
  // Cubre el mes si llega al último día, o si se cargó cuando el mes ya había terminado.
  const cubre = (corteExcel !== null && corteExcel >= finDeMes) || ultimo.cargadoEl > finDeMes;
  if (cerrado && !cubre) {
    return { id: "C8", nombre, estado: "amarillo", diferencia: null, detalle: `El mes ya cerró y la carga vigente (${ultimo.archivo}, ${ddmm(ultimo.cargadoEl)}) llega solo al ${corteExcel ? ddmm(corteExcel) : "—"}.`, queHacer: "Subir el Excel del mes completo (hasta el último día)." };
  }
  return { id: "C8", nombre, estado: "verde", diferencia: null, detalle: `Manda la última carga: ${ultimo.archivo} (${ddmm(ultimo.cargadoEl)}), con movimientos hasta el ${corteExcel ? ddmm(corteExcel) : "—"}.`, queHacer: "" };
}

/** Los ocho controles de una sede en un mes, con su estado. */
export function controlesDeSede(d: DatosControles): ControlesMes & { cifras: CifrasSede } {
  const cifras = cifrasDelMes(d.datos);
  const controles = [
    c1Movimientos(d), c2Ventas(d, cifras.corte), c3Clasificacion(d), c4Banco(d), c5Caja(d), c6TipoDudoso(d),
    c7Coherencia(cifras, d.config), c8CargaVigente(d),
  ];
  return { businessId: d.datos.businessId, sede: d.datos.sede, mes: d.datos.mes, estado: estadoDe(controles), controles, cifras };
}

/** El estado del grupo: el peor de sus sedes, más la coherencia del consolidado (C7 del grupo). */
export function controlesDelGrupo(mes: string, sedes: ControlesMes[], c7: Control): ControlesMes {
  const peor = sedes.some((s) => s.estado === "no_confiable") ? "rojo" : sedes.some((s) => s.estado === "con_observaciones") ? "amarillo" : "verde";
  const estado = estadoDe([c7, { ...c7, estado: peor }]);
  return { businessId: 0, sede: "Grupo", mes, estado, controles: [c7] };
}
