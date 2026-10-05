/**
 * Fonavi + Centro juntas en Grupo → Productos (pedido de Jahnn, 5-oct-2026).
 *
 * Las dos cafeterías venden la misma carta y se deciden juntas (como en la matriz de la
 * carta): en lugar de elegir una sola sede, «Fonavi + Centro» junta lo vendido por las
 * dos. «Sede 0» no existe en la base: es solo este modo de la pantalla.
 */

import type { FilaProducto } from "./panorama";
import type { ProductoSinVenta, SinVentaSede } from "@/app/actions/reportes-direccion";

/** Id de «Fonavi + Centro» en el selector de sede de Productos. */
export const CAFETERIAS = 0;
export const NOMBRE_CAFETERIAS = "Fonavi + Centro";
export const IDS_CAFETERIAS = [2, 3];

export const esCafeteria = (id: number) => id === CAFETERIAS || id === 2 || id === 3;

const clave = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Junta las ventas de varias sedes: el mismo producto (mismo nombre de Byte) suma unidades e ingresos. */
export function juntarFilas(grupos: FilaProducto[][]): FilaProducto[] {
  const m = new Map<string, FilaProducto & { mejor: number }>();
  for (const filas of grupos) {
    for (const f of filas) {
      const k = clave(f.nombre);
      const x = m.get(k);
      if (!x) m.set(k, { nombre: f.nombre, unidades: f.unidades, ingresos: f.ingresos, mejor: f.ingresos });
      else {
        x.unidades += f.unidades; x.ingresos += f.ingresos;
        // Se queda con el nombre de la sede donde más se vendió.
        if (f.ingresos > x.mejor) { x.nombre = f.nombre; x.mejor = f.ingresos; }
      }
    }
  }
  return [...m.values()].map(({ nombre, unidades, ingresos }) => ({ nombre, unidades, ingresos }));
}

/** El rango que cubre lo cargado de las sedes: del primer día al último. */
export function juntarRango(rangos: { desde: string | null; hasta: string | null }[]): { desde: string; hasta: string } | null {
  const r = rangos.filter((x): x is { desde: string; hasta: string } => !!x.desde && !!x.hasta);
  if (r.length === 0) return null;
  return { desde: r.map((x) => x.desde).sort()[0], hasta: r.map((x) => x.hasta).sort().reverse()[0] };
}

// ─── «Productos que no se venden» con las dos cafeterías ────────────────────

export type SinVentaJunto = {
  producto: string;
  /** Cómo está en cada cafetería: null = no aparece en su lista de menor rotación. */
  fonavi: ProductoSinVenta | null;
  centro: ProductoSinVenta | null;
  vendido: number;
};

export type SinVentaCafeterias = {
  /** No se venden (o casi) en NINGUNA de las dos: los más claros para sacar. */
  ambas: SinVentaJunto[];
  soloFonavi: SinVentaJunto[];
  soloCentro: SinVentaJunto[];
  fonavi: SinVentaSede | null;
  centro: SinVentaSede | null;
};

/**
 * Cruza las listas de menor rotación de Fonavi y Centro. Un producto flojo en las dos es el
 * caso más claro; el que solo aparece en una puede ser un problema de esa sede (vitrina,
 * cómo se ofrece) y no del producto. Como las listas son del último rango que subió
 * dirección, si una sede no tiene lista, lo de la otra va a «solo en…».
 */
export function juntarSinVenta(fonavi: SinVentaSede | null, centro: SinVentaSede | null): SinVentaCafeterias {
  const porClave = (s: SinVentaSede | null) => new Map((s?.carta ?? []).map((p) => [clave(p.producto), p] as const));
  const f = porClave(fonavi), c = porClave(centro);
  const juntos = (k: string): SinVentaJunto => {
    const pf = f.get(k) ?? null, pc = c.get(k) ?? null;
    return { producto: (pf ?? pc)!.producto, fonavi: pf, centro: pc, vendido: (pf?.vendido ?? 0) + (pc?.vendido ?? 0) };
  };
  const claves = new Set([...f.keys(), ...c.keys()]);
  const todos = [...claves].map(juntos).sort((a, b) => a.vendido - b.vendido || a.producto.localeCompare(b.producto));
  return {
    ambas: todos.filter((x) => x.fonavi && x.centro),
    soloFonavi: todos.filter((x) => x.fonavi && !x.centro),
    soloCentro: todos.filter((x) => !x.fonavi && x.centro),
    fonavi, centro,
  };
}
