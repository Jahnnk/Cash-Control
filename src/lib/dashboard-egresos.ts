/**
 * Dashboard de Grupo · sección 3 «Egresos» · lógica PURA (pedido de Jahnn, 1-nov-2026).
 *
 * Es la pestaña «Resumen fijo vs variable» de su Excel, dentro del Dashboard: TODO lo que salió de la cuenta en el
 * mes (lo que dice «Ing&Gtos»), en sus seis tipos, y los % son «de las salidas» —como en su pestaña—, no de lo vendido.
 * Los números vienen de lib/egresos-por-tipo.ts (el mismo cuadro de Reportes), una sede o las tres juntas.
 *
 * Esto es lo que SALIÓ; los costos del EBITDA (sección 4) son lo que LE TOCA a la sede, con las devoluciones y la parte
 * de otras sedes ya restadas. El puente entre ambos está en Reportes → Egresos por tipo.
 */

import type { EgresosPorTipo, TipoEgreso } from "./egresos-por-tipo";
import { bonita } from "./dashboard-cinco";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ClaveSalida = "fijos" | "variables" | "financiamiento" | "inversiones" | "noGasto" | "pendiente";

const DE_TIPO: Record<TipoEgreso, ClaveSalida> = {
  Fijo: "fijos", Variable: "variables", Financiamiento: "financiamiento", "Inversión": "inversiones", "No es gasto": "noGasto", "Por conciliar": "pendiente",
};

/** Etiquetas de la barra y su leyenda (como en la pantalla que dibujó Jahnn). */
export const ETIQUETA_SALIDA: Record<ClaveSalida, string> = {
  fijos: "Fijos", variables: "Variables", inversiones: "Inversiones", financiamiento: "Financiamiento", noGasto: "No gasto", pendiente: "Pendiente",
};
export const COLOR_SALIDA: Record<ClaveSalida, string> = {
  fijos: "#5B7FB0", variables: "#DCA64F", inversiones: "#9B84BE", financiamiento: "#5E9C94", noGasto: "#8F96A3", pendiente: "#B87D68",
};
const ORDEN_BARRA: ClaveSalida[] = ["fijos", "variables", "inversiones", "financiamiento", "noGasto", "pendiente"];

export type CategoriaSalida = { nombre: string; monto: number; /** % de su familia. */ pctFamilia: number };
export type FamiliaSalida = {
  clave: "fijos" | "variables" | "inversiones" | "financiamiento";
  etiqueta: string;
  monto: number;
  /** % de las salidas totales. */
  pct: number;
  categorias: CategoriaSalida[];
};
export type VistaEgresos = {
  nombre: string;
  total: number;
  /** Fijo + Variable: la base del punto de equilibrio. */
  operativos: { monto: number; pct: number };
  /** Lo que salió y no es gasto de la operación (ahorro, reparto a socios, devoluciones, préstamos entre sedes). */
  noGasto: { monto: number; pct: number };
  barra: { clave: ClaveSalida; etiqueta: string; monto: number; pct: number }[];
  familias: FamiliaSalida[];
  /** «Conciliación y movimientos especiales»: el detalle de «No es gasto» y de «Por conciliar». */
  conciliacion: { noGasto: { nombre: string; monto: number }[]; porConciliar: { nombre: string; monto: number }[]; hayPendiente: boolean };
  /** Suma de los tipos − total (debe ser 0). */
  control: number;
};

const ETIQUETA_FAMILIA = { fijos: "Costos fijos", variables: "Costos variables", inversiones: "Inversiones", financiamiento: "Financiamiento" } as const;
const ORDEN_FAMILIAS = ["fijos", "variables", "inversiones", "financiamiento"] as const;

/** Las sedes elegidas (una, o las tres si `sede` es null) sumadas en una sola vista. */
export function vistaEgresos(sedes: EgresosPorTipo[], sede: number | null): VistaEgresos | null {
  const lista = sede === null ? sedes : sedes.filter((s) => s.businessId === sede);
  if (lista.length === 0) return null;
  const total = r2(lista.reduce((t, s) => t + s.totalEgresos, 0));
  const pct = (m: number) => (total > 0 ? r1((m / total) * 100) : 0);

  const porClave = new Map<ClaveSalida, number>(ORDEN_BARRA.map((c) => [c, 0]));
  const porCategoria = new Map<string, { clave: ClaveSalida; monto: number }>();
  for (const s of lista) {
    for (const t of s.tipos) porClave.set(DE_TIPO[t.tipo], (porClave.get(DE_TIPO[t.tipo]) ?? 0) + t.monto);
    for (const c of s.categorias) {
      const clave = DE_TIPO[c.tipo];
      const k = `${clave}|${c.categoria}`;
      porCategoria.set(k, { clave, monto: (porCategoria.get(k)?.monto ?? 0) + c.monto });
    }
  }
  const monto = (c: ClaveSalida) => r2(porClave.get(c) ?? 0);
  const categoriasDe = (clave: ClaveSalida) =>
    [...porCategoria.entries()]
      .filter(([, v]) => v.clave === clave && Math.abs(v.monto) >= 0.005)
      .map(([k, v]) => ({ nombre: k.slice(k.indexOf("|") + 1), monto: r2(v.monto) }))
      .sort((a, b) => b.monto - a.monto);

  const familias: FamiliaSalida[] = ORDEN_FAMILIAS.map((clave) => {
    const m = monto(clave);
    return {
      clave, etiqueta: ETIQUETA_FAMILIA[clave], monto: m, pct: pct(m),
      categorias: categoriasDe(clave).map((c) => ({ nombre: bonita(c.nombre), monto: c.monto, pctFamilia: m > 0 ? r1((c.monto / m) * 100) : 0 })),
    };
  });
  const operativos = r2(monto("fijos") + monto("variables"));
  return {
    nombre: sede === null ? "Grupo Yayi's" : lista[0].sede,
    total,
    operativos: { monto: operativos, pct: pct(operativos) },
    noGasto: { monto: monto("noGasto"), pct: pct(monto("noGasto")) },
    barra: ORDEN_BARRA.map((clave) => ({ clave, etiqueta: ETIQUETA_SALIDA[clave], monto: monto(clave), pct: pct(monto(clave)) })).filter((b) => Math.abs(b.monto) >= 0.005),
    familias,
    conciliacion: {
      noGasto: categoriasDe("noGasto").map((c) => ({ nombre: bonita(c.nombre), monto: c.monto })),
      porConciliar: categoriasDe("pendiente").map((c) => ({ nombre: bonita(c.nombre), monto: c.monto })),
      hayPendiente: Math.abs(monto("pendiente")) >= 0.005,
    },
    control: r2(ORDEN_BARRA.reduce((t, c) => t + monto(c), 0) - total),
  };
}
