/**
 * ¿Qué precios subir? · ingeniería de menú para la próxima carta (MOTOR, puro).
 *
 * Pedido de Jahnn (17-nov-2026): suben los insumos (fenómeno del Niño, inflación) y piensan subir
 * precios en la próxima carta, pero «no subirlos por subir». Quiere que el sistema diga EN QUÉ
 * productos, CUÁNTO y con qué riesgo, con un análisis de sensibilidad al precio.
 *
 * HALLAZGO que define el método: de abril a noviembre de 2026 ningún producto de Fonavi ni de Centro
 * cambió de precio. Sin una subida anterior no se puede MEDIR cuánto baja la venta cuando sube el
 * precio (la elasticidad). Por eso este motor no inventa ese número: usa el PUNTO DE QUIEBRE, que sí
 * es una cuenta exacta —cuántas ventas puede perder el producto antes de que la subida deje menos
 * plata— y lo compara con un riesgo estimado por el tipo de producto. La medición real llega en la
 * fase 2 (subir en una sede y comparar con la otra).
 *
 * Cada producto (con costo de insumos y al menos MIN_UNIDADES en el mes) se mira con tres datos:
 *
 *   NECESIDAD   el costo de insumos como % del precio: > 35% alta (bajo el piso del coach),
 *               28–35% media, < 28% baja.
 *   DEMANDA     fuerte si vende al menos la mediana de unidades de la carta (estrella o vaca de la
 *               matriz): los clientes lo piden y aguanta mejor una subida.
 *   RIESGO      qué tan fácil es que el cliente compare el precio (la sensibilidad estimada):
 *               alto   = básicos que se consiguen en cualquier lado (agua, americano, empanada…);
 *               bajo   = productos propios de Yayi's, difíciles de comparar (desayunos, cheesecakes…);
 *               medio  = el resto.
 *
 * Veredicto y tope de subida por ronda:
 *
 *   demanda fuerte + riesgo bajo                 → Subir        hasta +10%
 *   demanda fuerte + riesgo medio + necesidad ≥ media → Subir   hasta +8%
 *   demanda fuerte + riesgo medio + necesidad baja    → Subir poco  hasta +5%
 *   demanda fuerte + riesgo alto + necesidad baja    → No tocar (precio ancla: el básico que el
 *                                                   cliente compara y ya deja buen margen)
 *   demanda fuerte + riesgo alto                 → Subir poco   hasta +5%
 *   demanda débil  + necesidad alta              → Subir poco   hasta +5% (y revisar la receta)
 *   demanda débil  + necesidad media o baja      → No tocar (ya vende poco: subirlo lo hunde)
 *
 * El precio sugerido parte del precio de CARTA (o el promedio de Byte si no enlaza) y se redondea
 * como la carta: de S/ 0.50 en S/ 0.50 bajo S/ 10, de sol en sol desde S/ 10, y conserva el «.9»
 * (16.9 → 17.9). Si el paso más chico ya pasa el doble del tope (una cookie de S/ 2 que sube a
 * S/ 2.50 es +25%), no se sube en esta ronda.
 *
 *   Punto de quiebre = subida ÷ (precio nuevo − costo): el % de ventas que puede perder y dejar lo mismo.
 */

import type { ProductoRentable, RentabilidadSede } from "./rentabilidad";
import { MIN_UNIDADES } from "./rentabilidad";

export type Veredicto = "subir" | "subir-poco" | "no-tocar";
export type Nivel = "alta" | "media" | "baja";
export type Riesgo = "alto" | "medio" | "bajo";

/** Topes de subida por ronda (fracción del precio). */
export const TOPE_SUBIR = { bajo: 0.10, medio: 0.08, poco: 0.05 } as const;
/** Cortes del costo de insumos como % del precio. */
export const NECESIDAD_ALTA_PCT = 35;
export const NECESIDAD_BAJA_PCT = 28;
/** Si el paso más chico de la carta pasa este múltiplo del tope, no se sube en esta ronda. */
export const FACTOR_PASO_MAXIMO = 2;
/** Caídas de venta que se muestran como escenarios. */
export const ESCENARIOS_CAIDA = [0, 0.05, 0.10] as const;

/** Básicos fáciles de comparar con otros locales: el cliente nota más su precio. */
const FACIL_DE_COMPARAR = [
  "AGUA", "GASEOSA", "AMERICANO", "PASADO", "ESPRESSO", "EXPRESSO", "EMPANADA", "HUMITA", "HUEVO",
  "COOKIE DE AVENA", "JUGO", "INFUSION", "MANZANILLA", "ANIS", "TE", "CHOCOLATE PURO", "PAN",
];
/** Productos propios de Yayi's, difíciles de comparar con otro local. */
const PROPIOS = [
  "DESAYUNO", "TOSTADAS FRANCESAS", "TOSTADA FRANCESA", "CHEESECAKE", "CUCHAREABLE", "TRIPLE YAYIS", "TRIPLE YAYI",
  "BACON JAM", "ROLLO DE CANELA", "CROCANTE", "BLONDIE", "BOSQUE ENCANTADO", "PARFAIT", "AFFOGATO",
  "FRAPPE", "MATCHA", "MILKSHAKE", "CARROT", "CAPRESE", "ROAST BEEF", "BOWL",
];

export type FilaSubida = {
  nombre: string;
  familia: string;
  unidades: number;
  /** Precio de partida (carta, o promedio de Byte si no enlaza) y de dónde sale. */
  precio: number;
  precioDeCarta: boolean;
  costo: number;
  costoPct: number;
  necesidad: Nivel;
  demandaFuerte: boolean;
  riesgo: Riesgo;
  veredicto: Veredicto;
  /** Por qué, en una frase. */
  motivo: string;
  /** null si no se sube. */
  precioNuevo: number | null;
  subidaPct: number | null;
  /** % de ventas que puede perder y dejar la misma plata. */
  quiebrePct: number | null;
  /** Plata extra al mes con cada escenario de caída (mismo orden que ESCENARIOS_CAIDA). */
  extraMes: number[] | null;
  /** El producto no se sube porque el paso más chico de la carta ya es demasiado (+25% en una cookie de S/ 2). */
  pasoMuyGrande: boolean;
};

export type SubidaSede = {
  businessId: number;
  sede: string;
  mes: string;
  hasta: string;
  filas: FilaSubida[];
  conteo: Record<Veredicto, number>;
  /** Productos con precio pero sin costo de insumos o con poca venta (no entran). */
  fuera: number;
  /** Extra al mes de todos los que suben, con cada escenario. */
  extraTotal: number[];
  /** Cuánto sube, en promedio, lo que paga el cliente (ponderado por lo vendido). */
  subidaPromedioPct: number | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** El nombre en MAYÚSCULAS, sin tildes ni signos, con un espacio a cada lado: así se buscan palabras enteras. */
const palabras = (s: string) => ` ${s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()} `;
/** Busca PALABRAS enteras: «TE» (té) no debe coincidir con «chocolaTE» ni «crocanTE». */
const contiene = (nombre: string, claves: string[]) => {
  const n = palabras(nombre);
  return claves.some((c) => n.includes(` ${c} `));
};

export function riesgoDe(nombre: string): Riesgo {
  if (contiene(nombre, FACIL_DE_COMPARAR)) return "alto";
  if (contiene(nombre, PROPIOS)) return "bajo";
  return "medio";
}

export function necesidadDe(costoPct: number): Nivel {
  if (costoPct > NECESIDAD_ALTA_PCT) return "alta";
  if (costoPct >= NECESIDAD_BAJA_PCT) return "media";
  return "baja";
}

/** El paso de precio de la carta: S/ 0.50 bajo S/ 10, S/ 1 desde S/ 10. */
export function pasoDe(precio: number): number {
  return precio < 10 ? 0.5 : 1;
}

/**
 * El precio nuevo, redondeado como la carta: el más cercano a precio × (1 + tope) que sea mayor al
 * de hoy. Un precio que termina en .9 sigue terminando en .9.
 */
export function precioRedondo(precio: number, tope: number): number {
  const conNueve = Math.abs(Math.round(precio * 10) % 10) === 9 && precio >= 10;
  const base = conNueve ? precio + 0.1 : precio;
  const paso = pasoDe(base);
  let nuevo = Math.round((base * (1 + tope)) / paso) * paso;
  if (nuevo <= base + 1e-9) nuevo = base + paso;
  return r2(conNueve ? nuevo - 0.1 : nuevo);
}

function topeDe(v: Veredicto, riesgo: Riesgo): number {
  if (v === "subir") return riesgo === "bajo" ? TOPE_SUBIR.bajo : TOPE_SUBIR.medio;
  return TOPE_SUBIR.poco;
}

function veredictoDe(demandaFuerte: boolean, riesgo: Riesgo, necesidad: Nivel): { v: Veredicto; motivo: string } {
  if (!demandaFuerte) {
    if (necesidad === "alta") return { v: "subir-poco", motivo: "Vende poco y su costo pasa el 35% del precio: subir poco y revisar la receta o el costo." };
    return { v: "no-tocar", motivo: "Vende poco y su costo está bien: subirlo lo haría vender menos todavía." };
  }
  if (riesgo === "alto" && necesidad === "baja") return { v: "no-tocar", motivo: "Básico que el cliente compara con otros locales y ya deja buen margen: mejor dejarlo como precio ancla (el que hace ver la carta accesible)." };
  if (riesgo === "alto") return { v: "subir-poco", motivo: "Se pide mucho, pero es un básico fácil de comparar con otros locales: el cliente nota su precio." };
  if (riesgo === "bajo") return { v: "subir", motivo: "Se pide mucho y es propio de Yayi's: difícil de comparar, aguanta mejor la subida." };
  if (necesidad === "baja") return { v: "subir-poco", motivo: "Se pide mucho, pero ya deja buen margen: basta una subida chica." };
  return { v: "subir", motivo: necesidad === "alta" ? "Se pide mucho y su costo pasa el 35% del precio: es de los primeros a subir." : "Se pide mucho y su costo se acerca al tope: buen candidato." };
}

function fila(p: ProductoRentable, medianaUnidades: number, aMes: number): FilaSubida | null {
  const costo = p.costoInsumos;
  const precioCarta = p.precioCarta != null && p.precioCarta > 0 ? p.precioCarta : null;
  const precio = precioCarta ?? p.precio;
  if (precio === null || precio <= 0 || costo === null || costo <= 0 || costo >= precio) return null;
  const costoPct = r1((costo / precio) * 100);
  const necesidad = necesidadDe(costoPct);
  const demandaFuerte = p.unidades >= medianaUnidades;
  const riesgo = riesgoDe(p.nombre);
  const { v, motivo } = veredictoDe(demandaFuerte, riesgo, necesidad);
  const base = {
    nombre: p.nombre, familia: p.familia, unidades: p.unidades, precio: r2(precio), precioDeCarta: precioCarta !== null,
    costo: r2(costo), costoPct, necesidad, demandaFuerte, riesgo,
  };
  if (v === "no-tocar") return { ...base, veredicto: v, motivo, precioNuevo: null, subidaPct: null, quiebrePct: null, extraMes: null, pasoMuyGrande: false };

  const tope = topeDe(v, riesgo);
  const nuevo = precioRedondo(precio, tope);
  const subidaPct = r1(((nuevo - precio) / precio) * 100);
  if (subidaPct > tope * 100 * FACTOR_PASO_MAXIMO) {
    return {
      ...base, veredicto: "no-tocar", pasoMuyGrande: true,
      motivo: `El paso más chico de la carta (S/ ${pasoDe(precio).toFixed(2)}) sería +${Math.round(subidaPct)}%: demasiado para una ronda. Mejor en la siguiente carta.`,
      precioNuevo: null, subidaPct: null, quiebrePct: null, extraMes: null,
    };
  }
  const margenHoy = precio - costo;
  const margenNuevo = nuevo - costo;
  const unidadesMes = p.unidades * aMes;
  return {
    ...base, veredicto: v, motivo, precioNuevo: nuevo, subidaPct, pasoMuyGrande: false,
    quiebrePct: r1(((nuevo - precio) / margenNuevo) * 100),
    extraMes: ESCENARIOS_CAIDA.map((c) => r2(unidadesMes * (1 - c) * margenNuevo - unidadesMes * margenHoy)),
  };
}

const ORDEN: Record<Veredicto, number> = { subir: 0, "subir-poco": 1, "no-tocar": 2 };

export function subidaDePrecios(r: RentabilidadSede): SubidaSede {
  const [y, m] = r.mes.split("-").map(Number);
  const diasDelMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const aMes = r.dias > 0 && r.dias < diasDelMes && r.hasta < `${r.mes}-${String(diasDelMes).padStart(2, "0")}` ? diasDelMes / r.dias : 1;

  const elegibles = r.productos.filter((p) => p.unidades >= MIN_UNIDADES && !p.familia.startsWith("Otros"));
  const unidades = elegibles.map((p) => p.unidades).sort((a, b) => a - b);
  const mediana = unidades.length ? unidades[Math.floor((unidades.length - 1) / 2)] : 0;
  const todas = elegibles.map((p) => fila(p, mediana, aMes)).filter((f): f is FilaSubida => f !== null);
  const filas = todas.sort((a, b) => ORDEN[a.veredicto] - ORDEN[b.veredicto] || (b.extraMes?.[0] ?? 0) - (a.extraMes?.[0] ?? 0) || b.unidades - a.unidades);

  const conteo: Record<Veredicto, number> = { subir: 0, "subir-poco": 0, "no-tocar": 0 };
  for (const f of filas) conteo[f.veredicto] += 1;
  const extraTotal = ESCENARIOS_CAIDA.map((_, i) => r2(filas.reduce((t, f) => t + (f.extraMes?.[i] ?? 0), 0)));
  const ventas = filas.reduce((t, f) => t + f.precio * f.unidades, 0);
  const subida = filas.reduce((t, f) => t + (f.precioNuevo !== null ? (f.precioNuevo - f.precio) * f.unidades : 0), 0);

  const conPrecio = r.productos.filter((p) => p.precio !== null && p.precio > 0 && !p.familia.startsWith("Otros")).length;
  return {
    businessId: r.businessId, sede: r.sede, mes: r.mes, hasta: r.hasta, filas, conteo,
    fuera: Math.max(0, conPrecio - filas.length),
    extraTotal,
    subidaPromedioPct: ventas > 0 ? r1((subida / ventas) * 100) : null,
  };
}
