/**
 * Proveedores y precios (pedido de Jahnn, 20-nov-2026) · lógica PURA.
 *
 * El problema: un proveedor no es «el barato» en todo. El de Lima vende el papel manteca más barato, pero el de
 * Cajamarca vende más baratos los stickers redondos. Por eso se compara PRODUCTO por producto, siempre por la
 * misma unidad (por hoja, por sticker, por kg), aunque cada uno venda en presentaciones distintas.
 *
 * Y se compara el precio PUESTO EN CAJAMARCA: un proveedor de fuera cobra envío por pedido y pide un mínimo.
 * Comprar poco donde hay envío puede salir más caro. `armarPedido` reparte una lista de compra entre los
 * proveedores para que el total (productos + envíos) sea el menor posible, respetando los mínimos.
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

/* ─────────── Armar un pedido ─────────── */

export type ItemPedido = { productoId: number; cantidad: number };

export type LineaPlan = {
  productoId: number;
  cantidad: number;
  oferta: Oferta;
  /** Presentaciones a comprar (se compran enteras). */
  paquetes: number;
  subtotal: number;
};

export type PedidoProveedor = {
  proveedor: ProveedorCompra;
  lineas: LineaPlan[];
  productos: number;
  envio: number;
  total: number;
};

export type PlanPedido = {
  pedidos: PedidoProveedor[];
  total: number;
  /** Productos sin ningún precio registrado. */
  sinPrecio: number[];
  /** Lo que costaría comprando todo a un solo proveedor (el más barato que tenga todo). null = ninguno tiene todo. */
  unSoloProveedor: { proveedor: ProveedorCompra; total: number } | null;
  /** Mínimos que obligaron a cambiar de proveedor algún producto (para explicarlo). */
  minimosQueMandaron: number[];
};

function linea(item: ItemPedido, o: Oferta): LineaPlan {
  const paquetes = Math.max(1, Math.ceil(item.cantidad / o.cantidad));
  return { productoId: item.productoId, cantidad: item.cantidad, oferta: o, paquetes, subtotal: r2(paquetes * o.precio) };
}

/** Más proveedores que esto y se prueba de a uno (2^12 = 4.096 combinaciones ya es mucho para el navegador). */
const MAX_PROVEEDORES_EXACTO = 12;

/**
 * Reparte la lista entre proveedores para pagar lo menos posible en total (productos + un envío por proveedor
 * usado), cumpliendo el pedido mínimo de cada uno. Prueba cada combinación de proveedores: con pocos proveedores
 * es exacto.
 */
export function armarPedido(items: ItemPedido[], ofertas: Oferta[], proveedores: ProveedorCompra[]): PlanPedido {
  const pedidosValidos = items.filter((i) => i.cantidad > 0);
  const ofertasDe = (pid: number) => ofertas.filter((o) => o.productoId === pid && o.cantidad > 0);
  const sinPrecio = pedidosValidos.filter((i) => ofertasDe(i.productoId).length === 0).map((i) => i.productoId);
  const conPrecio = pedidosValidos.filter((i) => !sinPrecio.includes(i.productoId));
  const porId = new Map(proveedores.map((p) => [p.id, p]));
  const candidatos = [...new Set(conPrecio.flatMap((i) => ofertasDe(i.productoId).map((o) => o.proveedorId)))].filter((id) => porId.has(id));

  const evaluar = (usables: Set<number>, respetarMinimos: boolean): { pedidos: PedidoProveedor[]; total: number } | null => {
    const grupos = new Map<number, LineaPlan[]>();
    for (const it of conPrecio) {
      const opciones = ofertasDe(it.productoId).filter((o) => usables.has(o.proveedorId)).map((o) => linea(it, o));
      if (opciones.length === 0) return null;
      const mejor = opciones.reduce((a, b) => (b.subtotal < a.subtotal ? b : a));
      grupos.set(mejor.oferta.proveedorId, [...(grupos.get(mejor.oferta.proveedorId) ?? []), mejor]);
    }
    const pedidos: PedidoProveedor[] = [];
    for (const [pid, lineas] of grupos) {
      const p = porId.get(pid)!;
      const productos = r2(lineas.reduce((t, l) => t + l.subtotal, 0));
      if (respetarMinimos && p.pedidoMinimo && productos < p.pedidoMinimo) return null;
      const envio = r2(p.costoEnvio ?? 0);
      pedidos.push({ proveedor: p, lineas, productos, envio, total: r2(productos + envio) });
    }
    return { pedidos, total: r2(pedidos.reduce((t, p) => t + p.total, 0)) };
  };

  let mejor: { pedidos: PedidoProveedor[]; total: number } | null = null;
  if (candidatos.length <= MAX_PROVEEDORES_EXACTO) {
    for (let mask = 1; mask < 1 << candidatos.length; mask++) {
      const usables = new Set(candidatos.filter((_, i) => mask & (1 << i)));
      const r = evaluar(usables, true);
      if (r && (!mejor || r.total < mejor.total || (r.total === mejor.total && r.pedidos.length < mejor.pedidos.length))) mejor = r;
    }
  }
  // Sin combinación que cumpla todos los mínimos (o demasiados proveedores): el más barato ignorando mínimos.
  const libre = evaluar(new Set(candidatos), false);
  if (!mejor) mejor = libre ?? { pedidos: [], total: 0 };

  // ¿Qué mínimos obligaron a cambiar de proveedor? Los que en el plan «libre» no se cumplían.
  const minimosQueMandaron = (libre?.pedidos ?? [])
    .filter((p) => p.proveedor.pedidoMinimo && p.productos < p.proveedor.pedidoMinimo)
    .map((p) => p.proveedor.id);

  let unSolo: PlanPedido["unSoloProveedor"] = null;
  for (const id of candidatos) {
    const r = evaluar(new Set([id]), false);
    if (r && (!unSolo || r.total < unSolo.total)) unSolo = { proveedor: porId.get(id)!, total: r.total };
  }

  const pedidos = [...mejor.pedidos].sort((a, b) => b.total - a.total);
  return { pedidos, total: mejor.total, sinPrecio, unSoloProveedor: unSolo, minimosQueMandaron };
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

export type MejorProveedor = { proveedorId: number; proveedor: string; unitario: number; precioInsumo: number; fecha: string };

/**
 * El precio más barato por unidad de un producto entre los proveedores de las sedes que compran ese insumo,
 * ya pasado a la unidad del insumo. null = ningún proveedor de esas sedes tiene precio.
 */
export function mejorParaInsumo(
  ofertasVigentes: Oferta[], proveedores: (ProveedorCompra & { sedes: number[] })[], productoId: number, origen: OrigenInsumo, factor: number,
): MejorProveedor | null {
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

/**
 * Una línea de compra → precio por unidad. Se guarda como «1 unidad a S/ X» (no como el paquete comprado): así
 * «Armar pedido» puede pedir la cantidad exacta y no paquetes del tamaño de esa compra.
 */
export function precioDesdeCompra(c: { cantidad: number; precioTotal: number; unidad: string }): { cantidad: number; precio: number; presentacion: string } | null {
  if (!(c.cantidad > 0) || !(c.precioTotal > 0)) return null;
  const u = c.unidad.trim().toLowerCase() || "unidad";
  const cant = Number(c.cantidad.toFixed(3)).toLocaleString("es-PE", { maximumFractionDigits: 3 });
  return { cantidad: 1, precio: r4(c.precioTotal / c.cantidad), presentacion: `Por ${u} · compra de ${cant} ${c.cantidad === 1 ? u : plural(u)} a S/ ${c.precioTotal.toFixed(2)}` };
}
