/**
 * Qué se vendió este mes · MOTOR (puro).
 *
 * ─── De dónde sale ───
 *
 * Jahnn (21-sep-2026) hizo un informe de ventas de Fonavi (1–19 set) a partir
 * del reporte "Platos con mayor rotación" de Byte y pidió tres cosas del
 * informe, tal cual, en el deck de la reunión, en el panel de cada
 * administrador y en el panel de Grupo:
 *
 *   1. Panorama del mes — ventas y unidades por familia de producto.
 *   2. Los 10 productos con más ingresos.
 *   3. Ranking de postres y pastelería.
 *
 * ─── Las familias ───
 *
 * Byte NO trae categoría: solo el nombre del plato. Las familias se deducen
 * del nombre, con las mismas siete del informe. El orden de las reglas
 * importa y va de lo más específico a lo más general: "BUDÍN DE MASA MADRE"
 * es postre aunque diga masa madre, y "CHOCOLATE CALIENTE" es café aunque
 * diga chocolate.
 *
 * ─── Las líneas ELIMINADO ───
 *
 * Byte exporta con el prefijo "[ELIMINADO fecha]" las ventas de un producto
 * que alguien editó o renombró después. Método de Jahnn (informe trimestral,
 * 22-sep-2026), que es el correcto y el que se aplica acá:
 *
 *   · Si existe el MISMO producto activo en el período, la línea eliminada se
 *     SUMA a él: es la misma venta partida en dos (Fonavi, junio: empanada de
 *     lomito con 180 u eliminadas + 34 activas son 214).
 *   · Si no existe, queda como su propio producto (junio: "cake de primavera",
 *     20 u) — no se descarta una venta real.
 *   · Solo los AJUSTES (reposiciones, extras, un vaso roto) salen de los
 *     rankings, junto con lo que no es carta.
 *
 * ─── Lo que no es carta ───
 *
 * Cargos de delivery, extras, packaging, retail y combos puntuales suman al
 * total del período pero NO compiten en los rankings de producto: mezclarlos
 * con los platos ensucia el ranking. Van en "Otros (extras y retail)".
 */

export const FAMILIAS = [
  "Postres y pastelería",
  "Sánguches, platos y desayunos",
  "Empanadas",
  "Jugos, batidos y bebidas frías",
  "Panes y masa madre",
  "Café e infusiones",
  "Otros (extras y retail)",
] as const;

export type Familia = (typeof FAMILIAS)[number];

export const FAMILIA_POSTRES: Familia = "Postres y pastelería";
export const FAMILIA_OTROS: Familia = "Otros (extras y retail)";

type Regla = { familia: Familia; claves: string[] };

/** De lo más específico a lo más general: manda la PRIMERA que coincide. */
const REGLAS: Regla[] = [
  // Lo que no es un plato: ajustes, delivery cobrado aparte y retail.
  { familia: FAMILIA_OTROS, claves: [
    "EXTRA", "ADICIONAL", "REPOSICION", "REPOSICIÓN", "VASO ROTO", "SORBETE ROTO", "DELIVERY", "PROPINA", "TAPER",
    "EMPAQUE", "CAJAS CON LOGO", "TAJADA DE PAN", "POR KILO", "SEMILLAS 1KG", "MANTEQUILLA 400", "QUESO TIPO SUIZO",
  ] },
  { familia: "Café e infusiones", claves: ["BOLSA DE INFUSION", "BOLSA DE INFUSIÓN"] },
  { familia: "Café e infusiones", claves: ["CHOCOLATE CALIENTE", "SUBMARINO"] },
  // Bebidas frías y cócteles de la carta (el nombre no dice qué son).
  { familia: "Jugos, batidos y bebidas frías", claves: ["MILKSHAKE", "PINA COLADA", "PIÑA COLADA", "MARACUYA SOUR", "MARACUYÁ SOUR", "CHILCANO", "COLD BREW", "MOJITO"] },
  // Infusiones de la casa, con nombre propio.
  { familia: "Café e infusiones", claves: ["VALENTINA", "BOSQUE ENCANTADO", "FRESCA LAVANDA", "ANDEAN CITRUS", "MASALA CHAI", "TROPICO RELAJANTE", "TRÓPICO RELAJANTE", "MOCCACCINO", "EXPRESSO", "AFFOGATO"] },
  { familia: FAMILIA_POSTRES, claves: [
    "CAKE", "TORTA", "CHEESECAKE", "PIE DE", "BROWNIE", "BLONDIE", "COOKIE", "GALLETA", "ALFAJOR", "TRUFA",
    "CROISSANT", "ROLLO DE CANELA", "CROCANTE", "CUCHAREABLE", "CUCHARABLE", "BUDIN", "BUDÍN", "MUFFIN", "DONUT",
    "KEKE", "TARTALETA", "MIL HOJAS", "POSTRE", "PANQUEQUE", "WAFFLE", "PIONONO", "MOUSSE", "TIRAMISU", "TIRAMISÚ",
    "ROLL DE CANELA", "ROLLOS DE CANELA", "BERLIN", "BERLÍN", "CANELA",
  ] },
  { familia: "Empanadas", claves: ["EMPANADA", "ENPANADA"] },
  { familia: "Panes y masa madre", claves: ["PAN ", "PAN_", "PANES", "MASA MADRE", "BAGUETTE", "CIABATTA", "CHAPATA", "FOCACCIA", "BAGEL", "MOLDE", "MULTIGRANO", "INTEGRAL", "CIABATA", "BRIOCHE", "CAMPESINO", "GRISIN", "GRISSIN"] },
  { familia: "Café e infusiones", claves: [
    "CAFE", "CAFÉ", "CAPPUCCINO", "CAPUCCINO", "LATTE", "ESPRESSO", "EXPRESO", "AMERICANO", "MOCACCINO", "MOCHA",
    "MACCHIATO", "CORTADO", "INFUSION", "INFUSIÓN", "MANZANILLA", "ANIS", "ANÍS", "HIERBA LUISA", "CHAI", "TÉ ", "TE ",
  ] },
  { familia: "Jugos, batidos y bebidas frías", claves: [
    "JUGO", "BATIDO", "SMOOTHIE", "LIMONADA", "FRAPPE", "FRAPPÉ", "ICED", "HELADO DE", "SODA", "AGUA", "GASEOSA",
    "KOMBUCHA", "CHICHA", "REFRESCO", "COCTEL", "CÓCTEL", "MOJITO", "SANGRIA", "SANGRÍA", "CERVEZA", "VINO", "PISCO",
    "MATCHA", "FRIO", "FRÍO", "MARACUYA FRESH", "NARANJA FRESH",
  ] },
  { familia: "Sánguches, platos y desayunos", claves: [
    "SANGUCHE", "SÁNGUCHE", "SANDWICH", "SÁNDWICH", "TRIPLE", "HAMBURGUESA", "POLLO", "LOMO", "TOSTADA", "DESAYUNO",
    "ENSALADA", "OMELETTE", "HUEVO", "WRAP", "BOWL", "BRUNCH", "PIQUEO", "GRILL", "PANINI", "CROQUE", "PLATO", "SOPA",
    "ROAST BEEF", "ROASTBEEF", "CARNE ASADA", "CAPRESE", "JAMON", "JAMÓN", "PAVO", "HUMITA", "GRANOLA", "PARFAIT",
    "PAPAS FRITAS", "PAPITAS", "TOMATES CHERRY", "PALTA", "ATUN", "ATÚN", "QUESO",
  ] },
];

/**
 * Nombres que son el MISMO producto escrito de otra forma (typos y nombres
 * viejos que quedaron en Byte). Los tres primeros los identificó Jahnn al
 * armar el trimestral de Fonavi.
 */
const ALIAS_PRODUCTO: Record<string, string> = {
  "CAPUCCINO": "CAPPUCCINO",
  "POLLO CPN PIÑA": "POLLO CON PIÑA GRILL",
  "ESPRESSO": "CAFE ESPRESSO",
  "EXPRESSO": "CAFE ESPRESSO",
  "ROLL DE CANELA": "ROLLO DE CANELA",
  "MATCHA LATTE": "MATCHA LATTE CALIENTE",
  "PACKAGIN": "PACKAGING",
};

/** Líneas que son un ajuste de caja, no la venta de un producto. */
const AJUSTES = ["REPOSICION", "REPOSICIÓN", "VASO ROTO", "SORBETE ROTO", "EXTRA", "ADICIONAL", "TAJADA DE PAN"];

const normGrupo = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

const norm = (t: string) => ` ${t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()} `;

const MARCA_ELIMINADA = /^\s*\[ELIMINADO/i;

/** Una línea anulada o de ajuste del reporte de Byte (no es la venta de un producto). */
export function esLineaEliminada(nombre: string): boolean {
  return MARCA_ELIMINADA.test(nombre);
}

/** El nombre sin la marca "[ELIMINADO fecha]", para poder leerlo. */
export function nombreLimpio(nombre: string): string {
  return nombre.replace(/^\s*\[ELIMINADO[^\]]*\]\s*/i, "").trim();
}

/** El nombre con el que se agrupa: sin la marca ELIMINADO y con los alias resueltos. */
export function nombreCanonico(nombre: string): string {
  const limpio = nombreLimpio(nombre);
  const clave = limpio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  for (const [de, a] of Object.entries(ALIAS_PRODUCTO)) {
    const deNorm = de.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    if (clave === deNorm) return a;
  }
  return limpio;
}

/** Un ajuste de caja (reposición, extra, vaso roto): nunca compite en los rankings. */
export function esAjuste(nombre: string): boolean {
  const t = norm(nombreLimpio(nombre));
  return AJUSTES.some((a) => t.includes(a.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()));
}

export function familiaDeProducto(nombre: string): Familia {
  const t = norm(nombreCanonico(nombre));
  for (const r of REGLAS) {
    for (const clave of r.claves) {
      if (t.includes(norm(clave).slice(0, -1)) && t.includes(` ${norm(clave).trim()}`.slice(0, 1))) {
        // Se compara con el texto normalizado a ambos lados (ver norm()).
      }
      if (t.includes(clave.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase())) return r.familia;
    }
  }
  return FAMILIA_OTROS;
}

export type FilaProducto = { nombre: string; unidades: number; ingresos: number };

export type ProductoRanking = FilaProducto & {
  familia: Familia;
  /** Precio unitario promedio del período. null si no hay unidades. */
  precio: number | null;
  unidadesPorDia: number | null;
  /** % de las ventas del período (sin las líneas eliminadas). */
  pct: number;
};

export type FamiliaResumen = { familia: Familia; ventas: number; unidades: number; pct: number };

export type PanoramaProductos = {
  /** Días del período cargado (del primero al último, inclusive). */
  dias: number;
  desde: string;
  hasta: string;
  /** Todo lo que vendió el período, carta + lo que no es carta. */
  ventasTotales: number;
  /** Solo productos de carta: la base de los rankings y los porcentajes. */
  ventas: number;
  unidades: number;
  productos: number;
  ventaPorDia: number;
  familias: FamiliaResumen[];
  top: ProductoRanking[];
  postres: ProductoRanking[];
  /** Todos los productos de carta, ordenados por ingresos (para el ranking por familia). */
  carta: ProductoRanking[];
  /** Productos de carta con 3 unidades o menos en el período (la "cola larga"). */
  colaLarga: number;
  /** % de las ventas de carta que explican los 10 primeros. */
  concentracionTop10: number;
  /** Delivery, extras, packaging, retail y combos: suman al total, no al ranking. */
  fueraDeCarta: { ventas: number; unidades: number; filas: FilaProducto[] };
  /** Qué pasó con las líneas "[ELIMINADO …]" del reporte. */
  eliminadas: { lineas: number; unidasAlProducto: number; propias: number; ajustes: number; ingresos: number };
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

export function diasEntre(desde: string, hasta: string): number {
  const d1 = Date.parse(`${desde}T12:00:00Z`);
  const d2 = Date.parse(`${hasta}T12:00:00Z`);
  if (Number.isNaN(d1) || Number.isNaN(d2) || d2 < d1) return 0;
  return Math.round((d2 - d1) / 86_400_000) + 1;
}

/**
 * Arma las tres vistas del informe a partir de las filas del reporte de Byte
 * ya sumadas por producto.
 */
export function armarPanorama(filas: FilaProducto[], desde: string, hasta: string, topN = 10): PanoramaProductos {
  const dias = diasEntre(desde, hasta);

  // 1 · Consolidar por nombre canónico: las líneas "[ELIMINADO …]" se suman a
  //     su producto activo; si no existe, quedan como producto propio.
  const activos = new Set(filas.filter((f) => !esLineaEliminada(f.nombre)).map((f) => normGrupo(nombreCanonico(f.nombre))));
  const porNombre = new Map<string, FilaProducto & { ajuste: boolean }>();
  let unidasAlProducto = 0, propias = 0, ajustes = 0, ingresosElim = 0, lineasElim = 0;
  for (const f of filas) {
    const eliminada = esLineaEliminada(f.nombre);
    const nombre = nombreCanonico(f.nombre);
    const clave = normGrupo(nombre);
    const ajuste = esAjuste(f.nombre);
    if (eliminada) {
      lineasElim++; ingresosElim += f.ingresos;
      if (ajuste) ajustes++;
      else if (activos.has(clave)) unidasAlProducto++;
      else propias++;
    }
    const previo = porNombre.get(clave);
    if (previo) {
      previo.unidades += f.unidades;
      previo.ingresos += f.ingresos;
      previo.ajuste = previo.ajuste && ajuste;
    } else {
      porNombre.set(clave, { nombre, unidades: f.unidades, ingresos: f.ingresos, ajuste });
    }
  }

  // 2 · Carta vs lo que no es carta (delivery, extras, retail, ajustes).
  const todos = [...porNombre.values()].filter((f) => f.unidades > 0 || f.ingresos > 0);
  const fuera = todos.filter((f) => f.ajuste || familiaDeProducto(f.nombre) === FAMILIA_OTROS);
  const cartaFilas = todos.filter((f) => !fuera.includes(f));
  const ventas = r2(cartaFilas.reduce((t, f) => t + f.ingresos, 0));
  const unidades = r2(cartaFilas.reduce((t, f) => t + f.unidades, 0));
  const ventasFuera = r2(fuera.reduce((t, f) => t + f.ingresos, 0));

  const carta: ProductoRanking[] = cartaFilas
    .map((f) => ({
      nombre: f.nombre,
      ingresos: r2(f.ingresos),
      unidades: r2(f.unidades),
      familia: familiaDeProducto(f.nombre),
      precio: f.unidades > 0 ? r2(f.ingresos / f.unidades) : null,
      unidadesPorDia: dias > 0 ? Math.round((f.unidades / dias) * 10) / 10 : null,
      pct: pct(f.ingresos, ventas),
    }))
    .sort((a, b) => b.ingresos - a.ingresos);

  const familias: FamiliaResumen[] = FAMILIAS.map((familia) => {
    const dentro = carta.filter((p) => p.familia === familia);
    const v = r2(dentro.reduce((t, p) => t + p.ingresos, 0));
    return { familia, ventas: v, unidades: r2(dentro.reduce((t, p) => t + p.unidades, 0)), pct: pct(v, ventas) };
  })
    .filter((f) => f.ventas > 0 || f.unidades > 0)
    .sort((a, b) => b.ventas - a.ventas);

  const top = carta.slice(0, topN);
  return {
    dias, desde, hasta,
    ventasTotales: r2(ventas + ventasFuera),
    ventas, unidades,
    productos: carta.length,
    ventaPorDia: dias > 0 ? r2(ventas / dias) : 0,
    familias,
    top,
    postres: carta.filter((p) => p.familia === FAMILIA_POSTRES),
    carta,
    colaLarga: carta.filter((p) => p.unidades <= 3).length,
    concentracionTop10: pct(top.reduce((t, p) => t + p.ingresos, 0), ventas),
    fueraDeCarta: {
      ventas: ventasFuera,
      unidades: r2(fuera.reduce((t, f) => t + f.unidades, 0)),
      filas: fuera.map((f) => ({ nombre: f.nombre, unidades: r2(f.unidades), ingresos: r2(f.ingresos) })).sort((a, b) => b.ingresos - a.ingresos),
    },
    eliminadas: { lineas: lineasElim, unidasAlProducto, propias, ajustes, ingresos: r2(ingresosElim) },
  };
}
