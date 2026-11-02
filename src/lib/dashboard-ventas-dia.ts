/**
 * Dashboard de Grupo · sección 1 · «Ventas día por día» · lógica PURA (pedido de Jahnn, 1-nov-2026).
 *
 * Es el reporte «Ventas de <MES>» de Byte (día, pedidos, descuentos, total) con las tres sedes juntas o una sola,
 * más lo que sirve para dirigir: mejor y peor día, promedio por día, ticket promedio y cómo rinde cada día de la semana.
 * El total de cada día sale del cargador único de ventas (el mismo del resto del Dashboard), así que la suma
 * del mes coincide con la cifra de arriba. Pedidos y descuentos, solo donde hay reporte de Byte de ese día.
 */

export type EntradaSedeDia = {
  businessId: number;
  sede: string;
  /** Venta oficial de cada día (cargador único). */
  rows: { date: string; total: number }[];
  /** Pedidos y descuentos del reporte de Byte, donde lo hay. */
  detalle: { date: string; pedidos: number; descuentos: number }[];
};

export type DiaVenta = {
  date: string;
  /** Día del mes (1–31). */
  dia: number;
  /** «lun», «mar»… */
  diaSemana: string;
  total: number;
  porSede: Record<number, number>;
  pedidos: number | null;
  descuentos: number | null;
  /** Lo que se vende por pedido ese día; null si Byte no trae los pedidos. */
  ticket: number | null;
};

export type PromedioDiaSemana = { nombre: string; promedio: number; dias: number };

export type VistaVentasDia = {
  /** Del día 1 al último día con venta; los días sin venta van con total 0. */
  dias: DiaVenta[];
  sedes: { businessId: number; nombre: string }[];
  total: number;
  diasConVenta: number;
  promedio: number;
  mejor: DiaVenta | null;
  peor: DiaVenta | null;
  pedidos: number | null;
  descuentos: number | null;
  ticket: number | null;
  /** Lunes a domingo, solo los que tienen al menos un día con venta. */
  porDiaSemana: PromedioDiaSemana[];
  mejorDiaSemana: PromedioDiaSemana | null;
};

export const COLOR_SEDE_DIA: Record<number, string> = { 1: "#4A7C66", 2: "#8AA89D", 3: "#C0CEC7" };

const SEMANA_CORTA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const SEMANA_LARGA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const r2 = (n: number) => Math.round(n * 100) / 100;

const diaDeSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();

/** Las sedes elegidas (una, o las tres si `sede` es null) sumadas día por día. */
export function armarVentasPorDia(entradas: EntradaSedeDia[], sede: number | null): VistaVentasDia | null {
  const lista = sede === null ? entradas : entradas.filter((e) => e.businessId === sede);
  if (lista.length === 0) return null;

  const porFecha = new Map<string, { porSede: Record<number, number>; pedidos: number | null; descuentos: number | null; totalConPedidos: number }>();
  const dia = (d: string) => {
    let x = porFecha.get(d);
    if (!x) { x = { porSede: {}, pedidos: null, descuentos: null, totalConPedidos: 0 }; porFecha.set(d, x); }
    return x;
  };
  for (const e of lista) {
    for (const r of e.rows) if (r.total > 0) dia(r.date).porSede[e.businessId] = r2(r.total);
    for (const d of e.detalle) {
      const x = porFecha.get(d.date);
      if (!x || !(e.businessId in x.porSede) || d.pedidos <= 0) continue;
      x.pedidos = (x.pedidos ?? 0) + d.pedidos;
      x.descuentos = r2((x.descuentos ?? 0) + d.descuentos);
      x.totalConPedidos += x.porSede[e.businessId];
    }
  }

  const fechas = [...porFecha.keys()].sort();
  if (fechas.length === 0) {
    return { dias: [], sedes: lista.map((e) => ({ businessId: e.businessId, nombre: e.sede })), total: 0, diasConVenta: 0, promedio: 0, mejor: null, peor: null, pedidos: null, descuentos: null, ticket: null, porDiaSemana: [], mejorDiaSemana: null };
  }
  const ultima = fechas[fechas.length - 1];
  const mes = ultima.slice(0, 7);
  const ultimoNumero = Number(ultima.slice(8, 10));

  const dias: DiaVenta[] = [];
  for (let n = 1; n <= ultimoNumero; n++) {
    const date = `${mes}-${String(n).padStart(2, "0")}`;
    const x = porFecha.get(date);
    const total = x ? r2(Object.values(x.porSede).reduce((t, v) => t + v, 0)) : 0;
    dias.push({
      date, dia: n, diaSemana: SEMANA_CORTA[diaDeSemana(date)], total, porSede: x?.porSede ?? {},
      pedidos: x?.pedidos ?? null, descuentos: x?.descuentos ?? null,
      ticket: x && x.pedidos ? r2(x.totalConPedidos / x.pedidos) : null,
    });
  }

  const conVenta = dias.filter((d) => d.total > 0);
  const total = r2(conVenta.reduce((t, d) => t + d.total, 0));
  const conPedidos = dias.filter((d) => d.pedidos !== null);
  const pedidos = conPedidos.length ? conPedidos.reduce((t, d) => t + (d.pedidos ?? 0), 0) : null;
  const totalConPedidos = fechas.reduce((t, f) => t + (porFecha.get(f)?.totalConPedidos ?? 0), 0);

  const acum = new Map<number, { suma: number; dias: number }>();
  for (const d of conVenta) {
    const k = diaDeSemana(d.date);
    const a = acum.get(k) ?? { suma: 0, dias: 0 };
    acum.set(k, { suma: a.suma + d.total, dias: a.dias + 1 });
  }
  const porDiaSemana = ORDEN_SEMANA.filter((k) => acum.has(k)).map((k) => ({ nombre: SEMANA_LARGA[k], promedio: r2(acum.get(k)!.suma / acum.get(k)!.dias), dias: acum.get(k)!.dias }));

  return {
    dias,
    sedes: lista.map((e) => ({ businessId: e.businessId, nombre: e.sede })),
    total,
    diasConVenta: conVenta.length,
    promedio: conVenta.length ? r2(total / conVenta.length) : 0,
    mejor: conVenta.reduce<DiaVenta | null>((a, d) => (!a || d.total > a.total ? d : a), null),
    peor: conVenta.reduce<DiaVenta | null>((a, d) => (!a || d.total < a.total ? d : a), null),
    pedidos,
    descuentos: conPedidos.length ? r2(conPedidos.reduce((t, d) => t + (d.descuentos ?? 0), 0)) : null,
    ticket: pedidos ? r2(totalConPedidos / pedidos) : null,
    porDiaSemana,
    mejorDiaSemana: porDiaSemana.reduce<PromedioDiaSemana | null>((a, d) => (!a || d.promedio > a.promedio ? d : a), null),
  };
}
