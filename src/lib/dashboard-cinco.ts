/**
 * Dashboard de Grupo en cinco secciones · lógica PURA (pedido de Jahnn, 30-oct-2026).
 *
 *   1. Ventas por sede        · Byte
 *   2. Movimiento de dinero   · Excel de Finanzas (lo que entró, lo que salió, el flujo) + el saldo de hoy
 *   3. Egresos                · las 4 familias: fijos, variables, inversiones, financiamiento (con su detalle)
 *   4. EBITDA                 · el modelo 33-33-33 contra lo real (o estimado si el mes está abierto): lib/cada-100.ts
 *   5. Alertas gerenciales    · lo que dicen los números, con el culpable concreto
 *
 * Una sola fuente: las seis cifras (lib/seis-cifras.ts). Los porcentajes de las secciones 3, 4 y 5 son SIEMPRE «de
 * lo vendido» (el esquema de Jahnn mezclaba «de los 4 grupos» con «de ventas» y se contradecía).
 *
 * Las familias de egresos son las de las seis cifras (lo que le TOCA a la sede, con las devoluciones ya restadas), no
 * lo que salió de la cuenta: así el costo fijo y el variable de la sección 3 son los mismos de la sección 4. Lo que
 * salió de la cuenta según el Excel está en la sección 2; la conciliación entre ambos vive en Reportes.
 */

import { CATEGORIA_COMPRA_ATELIER, type Rubro } from "./seis-cifras";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import type { Cada100, LineaCada100 } from "./cada-100";

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type Alcance = {
  /** null = el grupo. */
  businessId: number | null;
  nombre: string;
  /** Hay base para hablar de costos y ganancia (gastos cargados y mes con algo de avance). */
  hayResultado: boolean;
  porque: string | null;
  /** La venta sobre la que se miden los porcentajes (hasta el último día con Excel). */
  ventas: number | null;
  costos: number; gastos: number; impuestos: number;
  deudas: number; inversion: number;
  /** Lo que salió de la cuenta y no es gasto (préstamos entre sedes, ahorro, reparto a socios, devoluciones). */
  noEsGasto: number;
  caja: { entro: number; salio: number; flujo: number };
  /** Último día con venta y Excel de cada sede (para decir «hasta el 13/10»). */
  cortes: { sede: string; corte: string | null; mesCompleto: boolean }[];
  categorias: { categoria: string; rubro: Rubro; monto: number }[];
  provisional: boolean;
};

/** Las cifras de una sede, o las del grupo (las sedes que ya tienen resultado, sin contar dos veces lo que Atelier vende adentro). */
export function alcanceDe(cifras: SeisCifras, businessId: number | null): Alcance {
  if (businessId !== null) {
    const c = cifras.sedes.find((s) => s.businessId === businessId);
    if (!c) return vacio(businessId, "Sin datos");
    return {
      businessId, nombre: c.sede, hayResultado: c.conResultado, porque: c.sinResultadoPorque,
      ventas: c.ventas, costos: c.costos, gastos: c.gastos, impuestos: c.impuestos,
      deudas: c.fuera.deudas, inversion: c.fuera.inversion, noEsGasto: r2(c.fuera.noEsGasto + c.fuera.otrasSedes),
      caja: c.caja, cortes: [{ sede: c.sede, corte: c.corte, mesCompleto: c.mesCompleto }],
      categorias: c.porCategoria, provisional: !c.mesCompleto,
    };
  }
  const g = cifras.grupo;
  const con = cifras.sedes.filter((s) => s.conResultado);
  const hayResultado = con.length > 0 && g.ganancia !== null;
  const interno = con.some((s) => s.businessId === 1) ? con.filter((s) => s.businessId !== 1).reduce((t, s) => t + s.compraAtelier, 0) : 0;
  const ventas = hayResultado ? r2(con.reduce((t, s) => t + (s.ventas ?? 0), 0) - interno) : g.ventas;
  // El detalle por categoría: lo que Fonavi y Centro le compran a Atelier no se cuenta dos veces.
  const mapa = new Map<string, { rubro: Rubro; monto: number }>();
  for (const s of con) {
    for (const x of s.porCategoria) {
      if (s.businessId !== 1 && x.categoria === CATEGORIA_COMPRA_ATELIER) continue;
      const k = `${x.rubro}|${x.categoria}`;
      mapa.set(k, { rubro: x.rubro, monto: (mapa.get(k)?.monto ?? 0) + x.monto });
    }
  }
  return {
    businessId: null, nombre: "Grupo Yayi's", hayResultado, porque: hayResultado ? null : g.sinResultado[0]?.porque ?? "Sin datos",
    ventas, costos: g.costos, gastos: g.gastos, impuestos: g.impuestos,
    deudas: g.fuera.deudas, inversion: g.fuera.inversion, noEsGasto: r2(g.fuera.noEsGasto + g.fuera.otrasSedes),
    caja: g.caja, cortes: cifras.sedes.map((s) => ({ sede: s.sede, corte: s.corte, mesCompleto: s.mesCompleto })),
    categorias: [...mapa.entries()].map(([k, v]) => ({ categoria: k.slice(k.indexOf("|") + 1), rubro: v.rubro, monto: r2(v.monto) })),
    provisional: g.provisional,
  };
}

const vacio = (businessId: number | null, porque: string): Alcance => ({
  businessId, nombre: "", hayResultado: false, porque, ventas: null, costos: 0, gastos: 0, impuestos: 0, deudas: 0, inversion: 0, noEsGasto: 0,
  caja: { entro: 0, salio: 0, flujo: 0 }, cortes: [], categorias: [], provisional: false,
});

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** «hasta el 13/10», «hasta el 13/10 (Atelier, Fonavi) y el 14/10 (Centro)» o «mes completo». null = sin Excel. */
export function textoCortes(cortes: Alcance["cortes"]): string | null {
  const con = cortes.filter((c) => c.corte);
  if (con.length === 0) return null;
  if (con.every((c) => c.mesCompleto)) return "mes completo";
  const porDia = new Map<string, string[]>();
  for (const c of con) porDia.set(c.corte!, [...(porDia.get(c.corte!) ?? []), c.sede]);
  if (porDia.size === 1) return `hasta el ${ddmm([...porDia.keys()][0])}`;
  const partes = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, s]) => `el ${ddmm(d)} (${s.join(", ")})`);
  return `hasta ${partes.join(" y ")}`;
}

// ─────────────────────────── 3. Egresos: las cuatro familias ───────────────────────────

export type ClaveFamilia = "fijos" | "variables" | "inversiones" | "financiamiento";
export type Familia = {
  clave: ClaveFamilia;
  etiqueta: string;
  monto: number;
  /** De lo vendido (null sin ventas). */
  pctVentas: number | null;
  detalle: { nombre: string; monto: number }[];
};

const RUBRO_DE_FAMILIA: Record<ClaveFamilia, Rubro> = { fijos: "gastos", variables: "costos", inversiones: "inversion", financiamiento: "deudas" };
const ETIQUETA_FAMILIA: Record<ClaveFamilia, string> = { fijos: "Costos fijos", variables: "Costos variables", inversiones: "Inversiones", financiamiento: "Financiamiento" };
export const ORDEN_FAMILIAS: ClaveFamilia[] = ["fijos", "variables", "inversiones", "financiamiento"];

/** «OFICINA Y SISTEMAS» → «Oficina y sistemas». */
export function bonita(categoria: string): string {
  const t = categoria.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Las más pesadas y, si sobran, «Otros» con el resto (que la suma siempre cierre con el monto de la familia). */
function detalleDe(monto: number, filas: { categoria: string; monto: number }[], max = 5): Familia["detalle"] {
  const orden = filas.filter((x) => x.monto > 0.005).sort((a, b) => b.monto - a.monto);
  const visibles = orden.slice(0, orden.length > max ? max - 1 : max).map((x) => ({ nombre: bonita(x.categoria), monto: r2(x.monto) }));
  const resto = r2(monto - visibles.reduce((t, x) => t + x.monto, 0));
  return resto > 0.5 ? [...visibles, { nombre: "Otros", monto: resto }] : visibles;
}

export function familiasDeEgreso(a: Alcance): Familia[] {
  const monto: Record<ClaveFamilia, number> = { fijos: a.gastos, variables: a.costos, inversiones: a.inversion, financiamiento: a.deudas };
  return ORDEN_FAMILIAS.map((clave) => ({
    clave, etiqueta: ETIQUETA_FAMILIA[clave], monto: r2(monto[clave]),
    pctVentas: a.ventas && a.ventas > 0 ? r1((monto[clave] / a.ventas) * 100) : null,
    detalle: detalleDe(monto[clave], a.categorias.filter((x) => x.rubro === RUBRO_DE_FAMILIA[clave])),
  }));
}

// ─────────────────────────── 5. Alertas gerenciales ───────────────────────────

export type AlertaNumero = { id: string; tono: "mal" | "ojo" | "bien"; titulo: string; detalle: string };

const soles = (n: number) => `S/ ${Math.round(Math.abs(n)).toLocaleString("es-PE")}`;
const entero = (n: number) => Math.round(n).toLocaleString("es-PE");

/**
 * El culpable: la categoría que más pesa en una familia, dicha en una frase. Solo con el mes cerrado: a mitad de mes la
 * planilla y el alquiler todavía no se pagaron y lo que «más pesa» sería la caja chica (octubre: 55% de los fijos).
 */
function culpable(f: Familia | undefined, mesAbierto: boolean): string {
  const top = f?.detalle.find((d) => d.nombre !== "Otros");
  if (mesAbierto || !f || !top || f.monto <= 0) return "";
  const pct = Math.round((top.monto / f.monto) * 100);
  return ` Lo que más pesa: ${top.nombre.toLowerCase().replace("atelier", "Atelier")} (${soles(top.monto)}, el ${pct}% de esta familia).`;
}

/**
 * Lo que dicen los números del alcance elegido. Primero lo urgente; si todo está dentro de las metas, una sola línea que lo dice.
 * `saldo`: el dinero de hoy en banco y caja (null = no se conoce). La utilidad no se juzga con el mes abierto: se aparta del 1 al 7.
 */
export function alertasDeNumeros(a: Alcance, cada: Cada100, familias: Familia[], saldo: number | null): AlertaNumero[] {
  const out: AlertaNumero[] = [];
  const est = cada.modo === "estimado";
  const sufijo = est ? " · estimado" : "";
  const famDe = (c: ClaveFamilia) => familias.find((f) => f.clave === c);
  const linea = (c: LineaCada100["clave"]) => cada.lineas.find((l) => l.clave === c);

  if (cada.modo !== "sin-datos") {
    const v = linea("variables"), f = linea("fijos"), e = linea("ebitda"), b = linea("bolsa"), u = linea("utilidad");
    if (v && v.tono !== "bien") out.push({ id: "variables", tono: v.tono === "mal" ? "mal" : "ojo", titulo: `Costos variables: ${entero(v.cien)}% de ventas${sufijo}`, detalle: `Pasan el tope de ${entero(v.meta)}%; revisa insumos y rendimiento de producción.${culpable(famDe("variables"), est)}` });
    if (f && f.tono !== "bien") out.push({ id: "fijos", tono: f.tono === "mal" ? "mal" : "ojo", titulo: `Costos fijos: ${entero(f.cien)}% de ventas${sufijo}`, detalle: `Pasan el tope de ${entero(f.meta)}%; revisa la estructura fija.${culpable(famDe("fijos"), est)}` });
    if (e && e.tono !== "bien") {
      const falta = Math.max(0, e.meta - e.cien);
      const sol = cada.ventas ? ` Cerrar esa brecha son unos ${soles((falta / 100) * cada.ventas)} al mes.` : "";
      out.push({ id: "ebitda", tono: e.tono === "mal" ? "mal" : "ojo", titulo: `EBITDA: ${entero(e.cien)}% de ventas${sufijo}`, detalle: `La meta es ${entero(e.meta)}%: faltan ${entero(falta)} puntos.${sol} Vender más no basta si los costos se llevan lo que entra.` });
    }
    if (b && b.tono !== "bien") {
      const partes = [["impuestos", a.impuestos], ["inversión", a.inversion], ["deudas", a.deudas]] as const;
      const mayor = [...partes].sort((x, y) => y[1] - x[1])[0];
      out.push({ id: "bolsa", tono: b.tono === "mal" ? "mal" : "ojo", titulo: `Impuestos, inversión y deudas: ${entero(b.cien)} de cada 100`, detalle: `El tope es ${entero(b.meta)}.${mayor[1] > 0 ? ` Lo que más pesa: ${mayor[0]} (${soles(mayor[1])}).` : ""} Lo que pase de ahí sale de la utilidad.` });
    }
    // La utilidad solo se juzga con el mes cerrado: mientras está abierto se aparta del 1 al 7 del mes que viene.
    if (u && !est && u.tono !== "bien") out.push({ id: "utilidad", tono: u.tono === "mal" ? "mal" : "ojo", titulo: `Utilidad apartada: ${entero(u.cien)} de cada 100`, detalle: `La meta es ${entero(u.meta)}. Lo que no se aparta se gasta.` });
  }

  // Liquidez: siempre se dice (el flujo del Excel y lo que hay hoy).
  const hasta = textoCortes(a.cortes);
  const donde = hasta ? ` ${hasta === "mes completo" ? "en el mes" : hasta}` : "";
  if (a.caja.flujo < 0) {
    out.push({ id: "flujo", tono: "mal", titulo: "Salió más plata de la que entró", detalle: `El flujo neto es −${soles(a.caja.flujo)}${donde}.${saldo !== null ? ` Hoy hay ${soles(saldo)} en banco y caja.` : ""}` });
  } else if (a.caja.entro > 0 || a.caja.salio > 0) {
    out.push({ id: "flujo", tono: "bien", titulo: "Liquidez", detalle: `Flujo neto de ${soles(a.caja.flujo)}${donde}.${saldo !== null ? ` Hoy hay ${soles(saldo)} en banco y caja.` : ""}` });
  }

  const urgentes = out.filter((x) => x.tono !== "bien");
  if (cada.modo !== "sin-datos" && urgentes.length === 0) out.unshift({ id: "todo-bien", tono: "bien", titulo: "Los costos están dentro de las metas", detalle: `De cada S/ 100 que se venden, los costos variables y fijos no pasan de ${entero(linea("variables")?.meta ?? 33)} y el EBITDA llega a la meta.` });
  const orden = { mal: 0, ojo: 1, bien: 2 } as const;
  return out.sort((x, y) => orden[x.tono] - orden[y.tono]);
}
