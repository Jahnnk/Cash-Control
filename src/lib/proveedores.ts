/**
 * Proveedores y precios (pedido de Jahnn, 20-nov-2026) · lógica PURA.
 *
 * El problema: un proveedor no es «el barato» en todo. El de Lima vende el papel manteca más barato, pero el de
 * Cajamarca vende más baratos los stickers redondos. Por eso se compara PRODUCTO por producto, siempre por la
 * misma unidad (por hoja, por sticker, por kg), aunque cada uno venda en presentaciones distintas.
 *
 * Los pedidos se arman en Control de Caja (un solo lugar, 21-nov-2026): aquí solo se compara y se analiza.
 */

/** Las sedes por su business_id. */
export const SEDES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };

export type ProveedorCompra = {
  id: number;
  nombre: string;
  /** Costo de envío por pedido (S/). null o 0 = sin envío (ej. está en Cajamarca o trae él). */
  costoEnvio: number | null;
  /** Pedido mínimo (S/). null = sin mínimo. */
  pedidoMinimo: number | null;
};

/** El precio vigente de un producto en un proveedor: `precio` soles por una presentación de `cantidad` unidades. */
export type Oferta = {
  proveedorId: number;
  productoId: number;
  presentacion: string;
  cantidad: number;
  precio: number;
  /** Fecha del precio (YYYY-MM-DD). */
  fecha: string;
};

/** Un precio de más de 90 días ya no es confiable: se marca para preguntarlo de nuevo. */
export const DIAS_PRECIO_VIEJO = 90;

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Precio por unidad con 4 decimales (una hoja de papel manteca cuesta centavos). */
export const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export function precioUnitario(o: Pick<Oferta, "precio" | "cantidad">): number | null {
  return o.cantidad > 0 ? r4(o.precio / o.cantidad) : null;
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

/** La última oferta de cada (proveedor, producto). Entran todas las filas del historial. */
export function vigentes<T extends Oferta & { id?: number }>(historial: T[]): T[] {
  const ultima = new Map<string, T>();
  for (const o of historial) {
    const k = `${o.proveedorId}:${o.productoId}`;
    const prev = ultima.get(k);
    if (!prev || o.fecha > prev.fecha || (o.fecha === prev.fecha && (o.id ?? 0) > (prev.id ?? 0))) ultima.set(k, o);
  }
  return [...ultima.values()];
}

export type FilaComparacion = {
  oferta: Oferta;
  proveedor: ProveedorCompra;
  unitario: number;
  /** % más caro que el mejor precio por unidad (0 = es el mejor). */
  sobreMejor: number;
  esMejor: boolean;
  viejo: boolean;
  /**
   * Solo para el más barato por unidad cuando cobra envío: desde cuántas unidades en un mismo pedido el envío se
   * paga solo frente a la mejor opción SIN envío. null = no aplica (no cobra envío, o no hay alternativa sin envío).
   */
  convieneDesde: number | null;
};

/** Las ofertas de UN producto, de la más barata a la más cara por unidad. */
export function compararProducto(ofertas: Oferta[], proveedores: ProveedorCompra[], hoy: string): FilaComparacion[] {
  const porId = new Map(proveedores.map((p) => [p.id, p]));
  const filas = ofertas
    .map((o) => ({ o, p: porId.get(o.proveedorId), u: precioUnitario(o) }))
    .filter((x): x is { o: Oferta; p: ProveedorCompra; u: number } => !!x.p && x.u !== null)
    .sort((a, b) => a.u - b.u || a.p.nombre.localeCompare(b.p.nombre));
  if (filas.length === 0) return [];
  const mejor = filas[0].u;
  const sinEnvio = filas.find((f) => !(f.p.costoEnvio && f.p.costoEnvio > 0));
  return filas.map((f, i) => {
    const envio = f.p.costoEnvio ?? 0;
    const convieneDesde = i === 0 && envio > 0 && sinEnvio && sinEnvio.u > f.u ? Math.ceil(envio / (sinEnvio.u - f.u)) : null;
    return {
      oferta: f.o,
      proveedor: f.p,
      unitario: f.u,
      sobreMejor: mejor > 0 ? r2(((f.u - mejor) / mejor) * 100) : 0,
      esMejor: f.u === mejor,
      viejo: diasEntre(f.o.fecha, hoy) > DIAS_PRECIO_VIEJO,
      convieneDesde,
    };
  });
}

/** «Dónde comprar cada cosa»: para cada proveedor, los productos en los que tiene el mejor precio por unidad. */
export function dondeComprar(ofertas: Oferta[], proveedores: ProveedorCompra[], hoy: string): Map<number, number[]> {
  const porProducto = new Map<number, Oferta[]>();
  for (const o of ofertas) porProducto.set(o.productoId, [...(porProducto.get(o.productoId) ?? []), o]);
  const res = new Map<number, number[]>();
  for (const [productoId, lista] of porProducto) {
    const filas = compararProducto(lista, proveedores, hoy);
    // Solo cuenta si hay con quién comparar: con un único proveedor no hay «mejor».
    if (new Set(filas.map((f) => f.proveedor.id)).size < 2) continue;
    for (const f of filas.filter((x) => x.esMejor)) res.set(f.proveedor.id, [...(res.get(f.proveedor.id) ?? []), productoId]);
  }
  return res;
}

/** «987 654 321» → enlace de WhatsApp con el código de Perú si falta. null si no parece un número. */
export function enlaceWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (d.length < 9) return null;
  const n = d.length === 9 ? `51${d}` : d;
  return `https://wa.me/${n}`;
}

export function enlaceTelefono(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/[^\d+]/g, "");
  return d.length >= 6 ? `tel:${d}` : null;
}

/** «hoja» → «hojas», «unidad» → «unidades»; abreviaturas (kg, g, ml) quedan igual. */
export function plural(unidad: string): string {
  const u = unidad.trim();
  if (/^(kg|g|ml|l|lt|oz|lb)$/i.test(u)) return u;
  return /[aeiouáéíóú]$/i.test(u) ? `${u}s` : `${u}es`;
}

/* ─────────── Conexión con los insumos de Recetas y costos ─────────── */

export type OrigenInsumo = "Atelier" | "Cafetería";
export type UnidadInsumo = "kg" | "l" | "und";

/** Qué sedes compran para cada lista de insumos: Atelier para la suya; Fonavi y Centro para la de cafeterías. */
export const SEDES_DE_ORIGEN: Record<OrigenInsumo, number[]> = { Atelier: [1], "Cafetería": [2, 3] };

/** Cuánto es UNA unidad del producto, medida en kg, litros o unidades. null = unidad que no se reconoce como peso/volumen. */
function medida(unidad: string): { tipo: UnidadInsumo; cuanto: number } {
  const u = normalUnidad(unidad);
  if (["kg", "kilo", "kilos", "kilogramo", "kilogramos"].includes(u)) return { tipo: "kg", cuanto: 1 };
  if (["g", "gr", "gramo", "gramos"].includes(u)) return { tipo: "kg", cuanto: 0.001 };
  if (["l", "lt", "litro", "litros"].includes(u)) return { tipo: "l", cuanto: 1 };
  if (["ml", "mililitro", "mililitros"].includes(u)) return { tipo: "l", cuanto: 0.001 };
  return { tipo: "und", cuanto: 1 };
}
const normalUnidad = (u: string) => u.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * Factor para pasar el precio por unidad del producto al precio por unidad del insumo.
 * Ej.: producto por g, insumo por kg → 1000 (S/ 0.02 el gramo = S/ 20 el kilo). null = no se pueden comparar
 * (un producto por kg no puede ser un insumo por unidad).
 */
export function factorInsumo(unidadProducto: string, unidadInsumo: UnidadInsumo): number | null {
  const m = medida(unidadProducto);
  if (m.tipo !== unidadInsumo) return null;
  return r4(1 / m.cuanto);
}

/** La unidad con la que se crea un producto nuevo a partir de un insumo. */
export function unidadDesdeInsumo(u: UnidadInsumo): string {
  return u === "und" ? "unidad" : u === "l" ? "litro" : "kg";
}

export type MejorProveedor = {
  proveedorId: number; proveedor: string; unitario: number; precioInsumo: number; fecha: string;
  /** Es el proveedor elegido para el insumo (aunque no sea el más barato, 26-nov-2026). */
  elegido?: boolean;
};

/** Por qué se eligió un proveedor para un insumo (26-nov-2026: a veces gana uno más caro, por calidad). */
export const MOTIVOS_ELEGIDO = { calidad: "Calidad", precio: "Precio", disponibilidad: "Disponibilidad", servicio: "Servicio", otro: "Otro" } as const;
export type MotivoElegido = keyof typeof MOTIVOS_ELEGIDO;
export type ProveedorElegido = { proveedorId: number; proveedor: string; motivo: MotivoElegido; nota: string | null; por: string | null; el: string };

/**
 * El precio más barato por unidad de un producto entre los proveedores de las sedes que compran ese insumo,
 * ya pasado a la unidad del insumo. null = ningún proveedor de esas sedes tiene precio.
 * Si el insumo tiene proveedor elegido y ese proveedor tiene precio, manda ese (aunque sea más caro).
 */
export function mejorParaInsumo(
  ofertasVigentes: Oferta[], proveedores: (ProveedorCompra & { sedes: number[] })[], productoId: number, origen: OrigenInsumo, factor: number,
  elegidoId: number | null = null,
): MejorProveedor | null {
  if (elegidoId !== null) {
    const p = proveedores.find((x) => x.id === elegidoId);
    const o = ofertasVigentes.find((x) => x.productoId === productoId && x.proveedorId === elegidoId && precioUnitario(x) !== null);
    if (p && o) { const u = precioUnitario(o)!; return { proveedorId: p.id, proveedor: p.nombre, unitario: u, precioInsumo: r4(u * factor), fecha: o.fecha, elegido: true }; }
  }
  const sedes = SEDES_DE_ORIGEN[origen];
  const porId = new Map(proveedores.filter((p) => p.sedes.some((s) => sedes.includes(s))).map((p) => [p.id, p]));
  let mejor: MejorProveedor | null = null;
  for (const o of ofertasVigentes) {
    if (o.productoId !== productoId) continue;
    const p = porId.get(o.proveedorId);
    const u = precioUnitario(o);
    if (!p || u === null) continue;
    if (!mejor || u < mejor.unitario) mejor = { proveedorId: p.id, proveedor: p.nombre, unitario: u, precioInsumo: r4(u * factor), fecha: o.fecha };
  }
  return mejor;
}

/* ─────────── Lo que viene de Control de Caja (21-nov-2026) ─────────── */

const MINUSCULAS = new Set(["de", "del", "la", "las", "el", "los", "y", "x", "con", "en", "para", "sin", "a"]);

/** «HARINA SANTA ROSA X 50KG» → «Harina Santa Rosa x 50kg» (Control de Caja guarda los nombres en mayúsculas). */
export function nombreBonito(nombre: string): string {
  const palabras = nombre.trim().replace(/\s+/g, " ").toLowerCase().split(" ");
  return palabras
    .map((w, i) => (/\d/.test(w) || (i > 0 && MINUSCULAS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const SEDE_POR_NOMBRE: Record<string, number> = { atelier: 1, fonavi: 2, centro: 3 };

/** Nombres de sede de Control de Caja → business_id. Sin compras registradas: las 3 sedes. */
export function sedesDesdeNombres(nombres: string[]): number[] {
  const ids = [...new Set(nombres.map((n) => SEDE_POR_NOMBRE[n.trim().toLowerCase()]).filter((x): x is number => !!x))].sort();
  return ids.length ? ids : [1, 2, 3];
}

/** Clave para reconocer el mismo producto aunque se escriba distinto: sin tildes, sin mayúsculas, sin espacios dobles. */
export function claveNombre(nombre: string): string {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Cada administrador escribió la unidad a su manera («und», «unidades», «pqte», «gr», «litros»…). Se lleva todo a una
 * sola forma y los gramos/mililitros a kilos/litros, para comparar igual. `factor` pasa la cantidad a esa unidad.
 * null = compra anotada «en soles» («S/ 1 de perejil»): no dice cuánto se compró, no sirve para comparar.
 */
const UNIDADES: [RegExp, string, number][] = [
  [/^(sol|soles|s\/\.?)$/, "", 0],
  [/^(u|und|unds|unid|unids|unidad|unidades)$/, "unidad", 1],
  [/^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$/, "kg", 1],
  [/^(g|gr|grs|gramo|gramos)$/, "kg", 0.001],
  [/^(l|lt|lts|litro|litros)$/, "litro", 1],
  [/^(ml|mililitro|mililitros)$/, "litro", 0.001],
  [/^(paquete|paquetes|pqte|pqtes|paq|paqs)$/, "paquete", 1],
  [/^(galon|galones)$/, "galón", 1],
  [/^(caja|cajas)$/, "caja", 1],
  [/^(frasco|frascos)$/, "frasco", 1],
  [/^(bolsa|bolsas)$/, "bolsa", 1],
  [/^(atado|atados)$/, "atado", 1],
  [/^(juego|juegos)$/, "juego", 1],
  [/^(balde|baldes)$/, "balde", 1],
  [/^(ciento|cientos)$/, "ciento", 1],
  [/^(arroba|arrobas)$/, "arroba", 1],
  [/^(docena|docenas)$/, "docena", 1],
  [/^(rollo|rollos)$/, "rollo", 1],
];
export function unidadCanonica(unidad: string): { unidad: string; factor: number } | null {
  const u = claveNombre(unidad || "unidad");
  for (const [re, canon, factor] of UNIDADES) if (re.test(u)) return canon ? { unidad: canon, factor } : null;
  return { unidad: u, factor: 1 };
}

/** Una línea de compra en la unidad única (g → kg, «und» → unidad). null = no sirve para comparar («en soles»). */
export function precioDesdeCompra(c: { cantidad: number; precioTotal: number; unidad: string }): { unidad: string; cantidad: number; precio: number; presentacion: string } | null {
  if (!(c.cantidad > 0) || !(c.precioTotal > 0)) return null;
  const canon = unidadCanonica(c.unidad);
  if (!canon) return null;
  const cantidad = c.cantidad * canon.factor;
  const u = canon.unidad;
  const original = (c.unidad || "unidad").trim().toLowerCase();
  const cant = Number(c.cantidad.toFixed(3)).toLocaleString("es-PE", { maximumFractionDigits: 3 });
  // Se guarda la compra tal cual (cantidad en la unidad única y lo pagado): el precio por unidad sale de dividir, y
  // con la cantidad se sabe cuántos soles se ahorraron o se pagaron de más.
  return { unidad: u, cantidad: r4(cantidad), precio: r2(c.precioTotal), presentacion: `Compra de ${cant} ${c.cantidad === 1 ? original : plural(original)}` };
}

/* ─────────── Análisis de compras para la dirección (21-nov-2026) ─────────── */

/** Una compra real (de Control de Caja): `precio` = lo pagado por `cantidad` unidades. */
export type CompraReal = { productoId: number; proveedorId: number; sedeId: number | null; fecha: string; cantidad: number; precio: number };

const unit = (c: CompraReal) => c.precio / c.cantidad;
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
/** Igual que Control de Caja: el habitual es la mediana de las 3 compras anteriores del producto (cualquier sede o proveedor). */
export const COMPRAS_PARA_HABITUAL = 3;

export type DiferenciaCompra = { compra: CompraReal; habitual: number; unitario: number; soles: number; pct: number };

/** Cada compra contra su precio habitual. Positivo = se pagó de más; negativo = ahorro. Solo compras con historial. */
export function diferenciasContraHabitual(compras: CompraReal[]): DiferenciaCompra[] {
  const porProd = new Map<number, CompraReal[]>();
  for (const c of [...compras].filter((c) => c.cantidad > 0 && c.precio > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    porProd.set(c.productoId, [...(porProd.get(c.productoId) ?? []), c]);
  }
  const out: DiferenciaCompra[] = [];
  for (const lista of porProd.values()) {
    lista.forEach((c, i) => {
      const previas = lista.slice(Math.max(0, i - COMPRAS_PARA_HABITUAL), i);
      if (!previas.length) return;
      const habitual = mediana(previas.map(unit));
      const u = unit(c);
      out.push({ compra: c, habitual: r4(habitual), unitario: r4(u), soles: r2((u - habitual) * c.cantidad), pct: r2(((u - habitual) / habitual) * 100) });
    });
  }
  return out;
}

export type AhorroSedeMes = { sedeId: number | null; mes: string; deMas: number; ahorro: number; compras: number };

/** Por sede y mes: soles pagados de más y ahorrados frente al habitual. */
export function ahorroPorSedeMes(compras: CompraReal[]): AhorroSedeMes[] {
  const m = new Map<string, AhorroSedeMes>();
  for (const d of diferenciasContraHabitual(compras)) {
    const mes = d.compra.fecha.slice(0, 7);
    const k = `${d.compra.sedeId}|${mes}`;
    const a = m.get(k) ?? { sedeId: d.compra.sedeId, mes, deMas: 0, ahorro: 0, compras: 0 };
    if (d.soles > 0) a.deMas = r2(a.deMas + d.soles); else a.ahorro = r2(a.ahorro - d.soles);
    a.compras++;
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.mes.localeCompare(a.mes) || (a.sedeId ?? 0) - (b.sedeId ?? 0));
}

export type ComparacionSedes = {
  productoId: number;
  /** Último precio por unidad que pagó cada sede (en la ventana). */
  porSede: { sedeId: number; unitario: number; fecha: string; cantidad: number }[];
  /** % que paga la más cara sobre la más barata. */
  brecha: number;
  /** Soles que se habrían ahorrado si cada sede hubiera pagado como la más barata (compras de la ventana). */
  ahorroPosible: number;
};

/** El mismo producto comprado por 2 o más sedes en los últimos `dias`: quién paga más. */
export function compararSedes(compras: CompraReal[], hoy: string, dias = 90): ComparacionSedes[] {
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
  const enVentana = compras.filter((c) => c.sedeId !== null && c.fecha >= desde && c.cantidad > 0 && c.precio > 0);
  const porProd = new Map<number, CompraReal[]>();
  for (const c of enVentana) porProd.set(c.productoId, [...(porProd.get(c.productoId) ?? []), c]);
  const out: ComparacionSedes[] = [];
  for (const [productoId, lista] of porProd) {
    const ultima = new Map<number, CompraReal>();
    for (const c of lista) { const u = ultima.get(c.sedeId!); if (!u || c.fecha >= u.fecha) ultima.set(c.sedeId!, c); }
    if (ultima.size < 2) continue;
    const porSede = [...ultima.values()].map((c) => ({ sedeId: c.sedeId!, unitario: r4(unit(c)), fecha: c.fecha, cantidad: c.cantidad })).sort((a, b) => a.unitario - b.unitario);
    const min = porSede[0].unitario, max = porSede.at(-1)!.unitario;
    const ahorroPosible = r2(lista.reduce((t, c) => t + Math.max(0, unit(c) - min) * c.cantidad, 0));
    out.push({ productoId, porSede, brecha: min > 0 ? r2(((max - min) / min) * 100) : 0, ahorroPosible });
  }
  return out.sort((a, b) => b.ahorroPosible - a.ahorroPosible || b.brecha - a.brecha);
}

export type PrecioQueSube = { productoId: number; desde: { unitario: number; fecha: string }; hasta: { unitario: number; fecha: string }; pct: number; compras: number };

/** Productos cuyo precio por unidad subió (primera vs última compra de los últimos `dias`), de más a menos. */
export function preciosQueSuben(compras: CompraReal[], hoy: string, dias = 90, minimoPct = 5): PrecioQueSube[] {
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
  const porProd = new Map<number, CompraReal[]>();
  for (const c of compras.filter((c) => c.fecha >= desde && c.cantidad > 0 && c.precio > 0)) porProd.set(c.productoId, [...(porProd.get(c.productoId) ?? []), c]);
  const out: PrecioQueSube[] = [];
  for (const [productoId, lista] of porProd) {
    if (lista.length < 2) continue;
    const o = [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const a = o[0], b = o.at(-1)!;
    const pct = r2(((unit(b) - unit(a)) / unit(a)) * 100);
    if (pct >= minimoPct) out.push({ productoId, desde: { unitario: r4(unit(a)), fecha: a.fecha }, hasta: { unitario: r4(unit(b)), fecha: b.fecha }, pct, compras: o.length });
  }
  return out.sort((a, b) => b.pct - a.pct);
}
