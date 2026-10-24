/**
 * Buscador de producto (pedido de Jahnn, 24-oct-2026): «un administrador me dice que el batido de plátano no se vende bien;
 * lo busco y veo sus ventas del último mes, de los últimos 3 meses o más». Lógica pura.
 *
 * Sale de los reportes de rotación de Byte (los periodos que cuentan, rotacion_efectiva), sede por sede y mes a mes:
 *   · El mismo producto se reconoce aunque Byte lo marque «[ELIMINADO …]» o cambie tildes y mayúsculas.
 *   · En Atelier, Y- (a las cafeterías) y P- (a otros B2B) son productos distintos: no se juntan.
 *   · Un mes a medias se compara por DÍA (venta por día), no por total.
 *   · Un mes cuyo reporte no cuadra con Byte (lib/productos/confiabilidad.ts) se muestra marcado y no entra a los totales.
 */

export type FilaRotacion = { mes: string; nombre: string; unidades: number; ingresos: number };
export type MesSede = { mes: string; total: number; desde: string | null; hasta: string | null; confiable: boolean };

export type ProductoHistorial = {
  clave: string;
  /** El nombre más reciente con el que se vendió (sin la marca de eliminado). */
  nombre: string;
  /** Byte lo marcó como eliminado en su última aparición. */
  eliminado: boolean;
  /** sede → mes → unidades e ingresos. */
  ventas: Record<number, Record<string, { u: number; r: number }>>;
};

export type HistorialProductos = {
  meses: string[];
  hoy: string;
  sedes: { id: number; nombre: string; meses: MesSede[] }[];
  productos: ProductoHistorial[];
};

const ELIMINADO = /^\s*\[ELIMINADO[^\]]*\]\s*/i;

/** La clave de un producto: sin la marca de eliminado, sin tildes, en mayúsculas y con los espacios limpios. */
export function claveProducto(nombre: string): string {
  return nombre.replace(ELIMINADO, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function armarHistorial(input: {
  meses: string[];
  hoy: string;
  sedes: { id: number; nombre: string; filas: FilaRotacion[]; meses: MesSede[] }[];
}): HistorialProductos {
  const porClave = new Map<string, ProductoHistorial & { ultimoMes: string }>();
  for (const s of input.sedes) {
    for (const f of s.filas) {
      const clave = claveProducto(f.nombre);
      if (!clave) continue;
      let p = porClave.get(clave);
      if (!p) { p = { clave, nombre: f.nombre.replace(ELIMINADO, "").trim(), eliminado: ELIMINADO.test(f.nombre), ventas: {}, ultimoMes: f.mes }; porClave.set(clave, p); }
      if (f.mes >= p.ultimoMes) { p.ultimoMes = f.mes; p.nombre = f.nombre.replace(ELIMINADO, "").trim(); p.eliminado = ELIMINADO.test(f.nombre); }
      const m = ((p.ventas[s.id] ??= {})[f.mes] ??= { u: 0, r: 0 });
      m.u += f.unidades; m.r += f.ingresos;
    }
  }
  return {
    meses: input.meses, hoy: input.hoy,
    sedes: input.sedes.map((s) => ({ id: s.id, nombre: s.nombre, meses: s.meses })),
    productos: [...porClave.values()].map((p) => ({ clave: p.clave, nombre: p.nombre, eliminado: p.eliminado, ventas: p.ventas })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los productos cuyo nombre tiene todas las palabras buscadas (sin tildes ni mayúsculas); primero los que empiezan igual. */
export function buscarEnHistorial(productos: ProductoHistorial[], texto: string, max = 8): ProductoHistorial[] {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const q = palabras.join(" ");
  return productos
    .map((p) => ({ p, n: sinTildes(p.nombre) }))
    .filter(({ n }) => palabras.every((w) => n.includes(w)))
    .sort((a, b) => Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) || Number(a.p.eliminado) - Number(b.p.eliminado) || a.n.length - b.n.length)
    .slice(0, max)
    .map(({ p }) => p);
}

const dias = (desde: string | null, hasta: string | null) =>
  desde && hasta ? Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1 : 0;

export type MesProducto = { mes: string; unidades: number; venta: number; dias: number; ventaDia: number; unidadesDia: number; confiable: boolean; aMedias: boolean };

export type ResumenSede = {
  id: number;
  sede: string;
  /** Totales del periodo elegido (sin los meses no confiables). */
  unidades: number;
  venta: number;
  dias: number;
  ventaDia: number;
  unidadesDia: number;
  /** Venta por día contra el periodo anterior del mismo largo (null = sin datos para comparar). */
  cambioPct: number | null;
  /** Su lugar por venta en el último mes con datos de la sede (n.º 1 = el que más vende). */
  puesto: { n: number; de: number; mes: string } | null;
  /** Qué parte de la venta de la sede es (en el periodo). */
  pctSede: number | null;
  serie: MesProducto[];
  noConfiables: string[];
};

/** El producto en cada sede donde se vendió, en los últimos `periodo` meses que terminan en el último de `historial.meses`. */
export function resumenProducto(h: HistorialProductos, clave: string, periodo: number): ResumenSede[] {
  const p = h.productos.find((x) => x.clave === clave);
  if (!p) return [];
  const ultimos = h.meses.slice(-periodo);
  const anteriores = h.meses.slice(-periodo * 2, -periodo);
  const mesActual = h.hoy.slice(0, 7);
  const out: ResumenSede[] = [];
  for (const s of h.sedes) {
    const ventas = p.ventas[s.id];
    if (!ventas) continue;
    const info = new Map(s.meses.map((m) => [m.mes, m]));
    // Desde el primer mes con reportes de la sede (antes no hay datos: no son meses sin ventas).
    const primero = h.meses.find((m) => (info.get(m)?.total ?? 0) > 0) ?? h.meses[0];
    const serie: MesProducto[] = h.meses.filter((m) => m >= primero).map((mes) => {
      const v = ventas[mes] ?? { u: 0, r: 0 };
      const mi = info.get(mes);
      const d = dias(mi?.desde ?? null, mi?.hasta ?? null);
      return {
        mes, unidades: v.u, venta: Math.round(v.r * 100) / 100, dias: d,
        ventaDia: d > 0 ? v.r / d : 0, unidadesDia: d > 0 ? v.u / d : 0,
        confiable: mi?.confiable ?? true, aMedias: mes >= mesActual && d > 0,
      };
    });
    const tramo = (lista: string[]) => serie.filter((x) => lista.includes(x.mes) && x.confiable && x.dias > 0);
    const actual = tramo(ultimos);
    if (actual.every((x) => x.unidades === 0) && !serie.some((x) => x.unidades > 0)) continue;
    const suma = (xs: MesProducto[], f: (x: MesProducto) => number) => xs.reduce((t, x) => t + f(x), 0);
    const diasAct = suma(actual, (x) => x.dias);
    const ventaAct = suma(actual, (x) => x.venta);
    const prev = tramo(anteriores);
    const diasPrev = suma(prev, (x) => x.dias);
    const ventaDiaPrev = diasPrev > 0 ? suma(prev, (x) => x.venta) / diasPrev : null;
    const ventaDia = diasAct > 0 ? ventaAct / diasAct : 0;
    const totalSede = suma(actual.map((x) => ({ ...x, venta: info.get(x.mes)?.total ?? 0 })), (x) => x.venta);

    // Puesto en el último mes con datos de la sede, contra todos sus productos.
    const ultimoConDatos = [...ultimos].reverse().find((m) => (info.get(m)?.total ?? 0) > 0 && (info.get(m)?.confiable ?? true));
    let puesto: ResumenSede["puesto"] = null;
    if (ultimoConDatos && (ventas[ultimoConDatos]?.r ?? 0) > 0) {
      const montos = h.productos.map((x) => x.ventas[s.id]?.[ultimoConDatos]?.r ?? 0).filter((r) => r > 0).sort((a, b) => b - a);
      puesto = { n: montos.indexOf(ventas[ultimoConDatos].r) + 1, de: montos.length, mes: ultimoConDatos };
    }
    out.push({
      id: s.id, sede: s.nombre,
      unidades: suma(actual, (x) => x.unidades), venta: Math.round(ventaAct * 100) / 100, dias: diasAct,
      ventaDia, unidadesDia: diasAct > 0 ? suma(actual, (x) => x.unidades) / diasAct : 0,
      cambioPct: ventaDiaPrev && ventaDiaPrev > 0 ? Math.round(((ventaDia - ventaDiaPrev) / ventaDiaPrev) * 1000) / 10 : null,
      puesto,
      pctSede: totalSede > 0 ? Math.round((ventaAct / totalSede) * 1000) / 10 : null,
      serie,
      noConfiables: serie.filter((x) => ultimos.includes(x.mes) && !x.confiable).map((x) => x.mes),
    });
  }
  return out;
}
