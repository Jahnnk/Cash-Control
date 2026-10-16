/**
 * Conciliación del mes · lógica PURA.
 *
 * Jahnn hizo a mano, el 16-oct-2026, la conciliación de setiembre sede por sede (le dolió la cabeza) y
 * pidió que el sistema la haga solo, con SUS pasos y en SU orden:
 *   1 · Ventas: Byte contra el grupo «Ventas» del Excel.
 *   2 · Lo que entró: separar las ventas de lo que entró por otros motivos (préstamos, rescates, devoluciones).
 *   3 · Lo que salió: separar el egreso real de lo que no es gasto (ahorro, utilidades, préstamos…).
 *   4 · El resultado: por qué «entró − salió» (Centro set: −S/922) no es la ganancia (+S/5,380).
 * No calcula nada nuevo: ordena las seis cifras (lib/seis-cifras.ts) para que cada paso cuadre al céntimo.
 */

import type { CifrasSede } from "./seis-cifras";
import { TOPE_VENTA_VS_BANCO_PCT } from "./verificacion-kelly";

export type Linea = { etiqueta: string; monto: number; nota?: string };

export type ConciliacionSede = {
  businessId: number;
  sede: string;
  corte: string | null;
  mesCerrado: boolean;
  ventas: { byte: number | null; excel: number | null; dif: number | null; difPct: number | null; estado: "normal" | "revisar" | "credito" | "sin-datos" };
  entro: { total: number; lineas: Linea[]; sinExplicar: number; /** Ventas + otros ingresos de la operación. */ operacion: number };
  salio: { total: number; lineas: Linea[]; egresoReal: number; sinExplicar: number };
  resultado: { caja: number; operacion: number | null; operacionPct: number | null; ganancia: number | null; gananciaPct: number | null };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const conMonto = (ls: Linea[]) => ls.filter((l) => Math.abs(l.monto) >= 0.01);

export function conciliarSede(sede: CifrasSede, finDeMes: string): ConciliacionSede {
  // Se concilia contra el Excel: hasta su último día, aunque Byte vaya más atrás.
  const s = sede.segunExcel ?? sede;
  const esAtelier = s.businessId === 1;
  const mesCerrado = s.mesCompleto && (s.corte ?? "") >= finDeMes.slice(0, 8) + "01";

  // 1 · Ventas
  const byte = s.ventas, excel = s.ingresadoVentas;
  const dif = byte !== null && excel !== null ? r2(byte - excel) : null;
  const difPct = dif !== null && byte ? r1((dif / byte) * 100) : null;
  const estado = byte === null || excel === null ? "sin-datos" : esAtelier ? "credito" : !mesCerrado || Math.abs(difPct ?? 0) <= TOPE_VENTA_VS_BANCO_PCT ? "normal" : "revisar";

  // 2 · Lo que entró
  const f = s.ingresosFuera;
  const entroLineas = conMonto([
    { etiqueta: "Ventas (grupo «Ventas»)", monto: s.ingresadoVentas ?? 0 },
    { etiqueta: "Otros ingresos de la operación", monto: s.ingresadoVentas !== null ? (s.otrosIngresos ?? 0) : (s.cobrado ?? 0), nota: "Devoluciones de compras, caja chica que volvió, ventas sueltas, filas sin Grupo" },
    { etiqueta: "Devoluciones de otras sedes", monto: f.devolucionesSedes, nota: "Su parte de gastos compartidos, pagos mal hechos, cuotas de préstamo" },
    { etiqueta: "Préstamos recibidos", monto: f.prestamos },
    { etiqueta: "Rescates de ahorro (fondos mutuos)", monto: f.rescates },
    { etiqueta: "Otros ingresos que no son de la operación", monto: f.otros },
  ]);
  const entroTotal = s.caja.entro;
  const entroSin = r2(entroTotal - entroLineas.reduce((t, l) => t + l.monto, 0));

  // 3 · Lo que salió
  const otrosNoGasto = r2(s.fuera.noEsGasto - s.fuera.ahorro - s.fuera.reparto);
  const egresoReal = r2(s.costos + s.gastos + s.impuestos);
  const salioLineas = conMonto([
    { etiqueta: "Ahorro (fondos mutuos)", monto: -s.fuera.ahorro },
    { etiqueta: "Adelanto de utilidades a socios", monto: -s.fuera.reparto },
    { etiqueta: "Cuotas de préstamos y tarjetas", monto: -s.fuera.deudas },
    { etiqueta: "Equipos y remodelación (inversión)", monto: -s.fuera.inversion },
    { etiqueta: "Plata que no era de la sede", monto: -otrosNoGasto, nota: "Pagos por error, ventas de otra sede, propinas entregadas, préstamos entre sedes" },
    { etiqueta: "Parte de otras sedes en gastos compartidos", monto: -s.fuera.otrasSedes },
    { etiqueta: "Lo que otras sedes devolvieron de gastos pagados enteros", monto: -s.recuperado },
  ]);
  const salioTotal = s.caja.salio;
  const salioSin = r2(salioTotal + salioLineas.reduce((t, l) => t + l.monto, 0) - egresoReal);

  // 4 · Resultado
  const operacion = s.cobrado !== null && s.conResultado ? r2(s.cobrado - egresoReal) : null;
  return {
    businessId: s.businessId, sede: s.sede, corte: s.corte, mesCerrado,
    ventas: { byte, excel, dif, difPct, estado },
    entro: { total: entroTotal, lineas: entroLineas, sinExplicar: entroSin, operacion: r2(s.cobrado ?? 0) },
    salio: { total: salioTotal, lineas: salioLineas, egresoReal, sinExplicar: salioSin },
    resultado: {
      caja: r2(entroTotal - salioTotal),
      operacion, operacionPct: operacion !== null && s.cobrado ? r1((operacion / s.cobrado) * 100) : null,
      ganancia: s.ganancia, gananciaPct: s.gananciaPct,
    },
  };
}

const ORDEN = [2, 3, 1];
export function conciliacionDelMes(sedes: CifrasSede[], mes: string): ConciliacionSede[] {
  const [y, m] = mes.split("-").map(Number);
  const finDeMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return ORDEN.map((id) => sedes.find((s) => s.businessId === id)).filter((s): s is CifrasSede => !!s).map((s) => conciliarSede(s, finDeMes));
}
