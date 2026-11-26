"use server";

/**
 * Grupo → Insumos y packaging → «Dónde se compra» · Actions (pedido de Jahnn, 24-nov-2026: «la leche condensada
 * se compra en Metro Almacén y Plaza Vea… que Proveedores me muestre qué proveedor vende qué y a qué precio»).
 *
 * No hay datos nuevos: los proveedores y sus precios ya vienen de las compras reales de Control de Caja (tablas
 * proveedores, proveedor_productos, proveedor_precios). Lo que faltaba es decir qué producto de proveedor es qué
 * insumo (proveedor_producto_insumos) — se hace aquí, desde el insumo, una vez. También se puede anotar un precio
 * visto en la tienda (Plaza Vea) que todavía no es una compra: queda como «cotizado».
 *
 * Reglas: la conexión vale para el mismo insumo en las dos listas (Atelier ↔ cafeterías). El precio de proveedor
 * NUNCA cambia solo el precio de las recetas (decisión de Jahnn, 20-nov-2026). Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";
import { claveInsumo, leerArchivados, leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { leerParejas } from "@/lib/insumos-parejas-sql";
import { leerEnlaces } from "@/lib/proveedores-sql";
import { MOTIVOS_ELEGIDO, SEDES_DE_ORIGEN, factorInsumo, nombreBonito, unidadDesdeInsumo, type OrigenInsumo } from "@/lib/proveedores";
import { PARECIDO_POSIBLE, PARECIDO_SEGURO, factorSeguro, masParecidos } from "@/lib/insumos-ficha";

const sql = neon(process.env.DATABASE_URL!);

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const ORIGEN_DE_SEDE: Record<number, OrigenInsumo> = { 1: "Atelier", 2: "Cafetería", 3: "Cafetería" };

async function direccion(): Promise<string | null> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return null;
  return role.nombre ?? (role.quien === "kelly" ? "Kelly" : "Jahnn");
}

/** El insumo y su pareja de la otra lista (si la tiene). */
async function insumoYPareja(origen: string, sku: string) {
  const { vigentes } = await leerPreciosVigentes(sql);
  const v = vigentes.find((x) => x.origen === origen && x.sku === sku);
  if (!v) return null;
  const kp = (await leerParejas(sql, vigentes)).get(claveInsumo(v.origen, v.sku));
  const p = kp ? vigentes.find((x) => claveInsumo(x.origen, x.sku) === kp) ?? null : null;
  return { v, p };
}

/** Cuánto de la unidad del insumo trae UNA unidad del producto → factor de precio (precio por unidad × factor). */
function factorDe(unidadProducto: string, unidadInsumo: string, cuanto: number | null | undefined): number | null {
  const directo = factorSeguro(unidadProducto, unidadInsumo);
  if (directo != null) return directo;
  return cuanto != null && cuanto > 0 ? r4(1 / cuanto) : null;
}

async function enlazar(productoId: number, origen: string, sku: string, factor: number, quien: string) {
  await sql`INSERT INTO proveedor_producto_insumos (producto_id, origen, sku, factor, creado_por)
            VALUES (${productoId}, ${origen}, ${sku}, ${factor}, ${quien})
            ON CONFLICT (producto_id, origen) DO UPDATE SET sku = EXCLUDED.sku, factor = EXCLUDED.factor, creado_por = EXCLUDED.creado_por, creado_el = now()`;
}

export type ProductoProveedor = {
  id: number;
  nombre: string;
  unidad: string;
  /** Insumos a los que ya está conectado («origen|SKU»). */
  conectadoA: string[];
  /** Último precio visto, para reconocerlo. */
  ultimo: { proveedor: string; presentacion: string; precio: number; fecha: string } | null;
  /** Listas de insumos que lo compran (por las sedes de sus compras); vacío = no se sabe. */
  origenes: OrigenInsumo[];
};

export type OpcionesProveedores = { proveedores: { id: number; nombre: string }[]; productos: ProductoProveedor[] };

async function leerProductosProveedor(): Promise<OpcionesProveedores> {
  const [provs, prods, precios, enlaces] = await Promise.all([
    sql`SELECT id, nombre FROM proveedores WHERE activo AND tipo = 'proveedor' ORDER BY nombre` as unknown as Promise<{ id: number; nombre: string }[]>,
    sql`SELECT id, nombre, unidad FROM proveedor_productos WHERE activo ORDER BY nombre` as unknown as Promise<{ id: number; nombre: string; unidad: string }[]>,
    sql`SELECT pp.producto_id AS "productoId", p.nombre AS proveedor, pp.presentacion, pp.precio::float AS precio,
               to_char(pp.fecha, 'YYYY-MM-DD') AS fecha, pp.sede_id AS "sedeId"
        FROM proveedor_precios pp JOIN proveedores p ON p.id = pp.proveedor_id ORDER BY pp.fecha, pp.id` as unknown as
      Promise<{ productoId: number; proveedor: string; presentacion: string; precio: number; fecha: string; sedeId: number | null }[]>,
    leerEnlaces(sql),
  ]);
  const ultimo = new Map<number, ProductoProveedor["ultimo"]>();
  const origenes = new Map<number, Set<OrigenInsumo>>();
  for (const x of precios) {
    ultimo.set(x.productoId, { proveedor: x.proveedor, presentacion: x.presentacion, precio: x.precio, fecha: x.fecha });
    const o = x.sedeId != null ? ORIGEN_DE_SEDE[x.sedeId] : undefined;
    if (o) origenes.set(x.productoId, (origenes.get(x.productoId) ?? new Set()).add(o));
  }
  const conectados = new Map<number, string[]>();
  for (const e of enlaces) conectados.set(e.productoId, [...(conectados.get(e.productoId) ?? []), claveInsumo(e.origen, e.sku)]);
  return {
    proveedores: provs,
    productos: prods.map((p) => ({ ...p, conectadoA: conectados.get(p.id) ?? [], ultimo: ultimo.get(p.id) ?? null, origenes: [...(origenes.get(p.id) ?? [])] })),
  };
}

/** Proveedores y productos de proveedor, para buscar desde la ficha de un insumo. */
export async function getOpcionesProveedores(): Promise<R<{ datos: OpcionesProveedores }>> {
  if (!(await direccion())) return { ok: false, error: "Solo dirección." };
  try {
    return { ok: true, datos: await leerProductosProveedor() };
  } catch (e) {
    console.error("[getOpcionesProveedores]", e);
    return { ok: false, error: "No se pudo leer Proveedores." };
  }
}

/**
 * «Este producto de proveedor es este insumo». Si las unidades no se pueden convertir solas (el producto va por
 * bolsa y el insumo por kg), `cuanto` dice cuánto del insumo trae una unidad del producto (1 bolsa = 1.2 kg).
 * Se conecta también la pareja de la otra lista.
 */
export async function conectarProductoInsumo(input: { productoId: number; origen: string; sku: string; cuanto?: number | null }): Promise<R<{ pareja: boolean }>> {
  const quien = await direccion();
  if (!quien) return { ok: false, error: "Solo dirección." };
  try {
    const prod = (await sql`SELECT unidad FROM proveedor_productos WHERE id = ${input.productoId} AND activo`) as { unidad: string }[];
    if (!prod[0]) return { ok: false, error: "No encontré ese producto de proveedor." };
    const ip = await insumoYPareja(input.origen, input.sku);
    if (!ip) return { ok: false, error: "No encontré ese insumo." };
    const factor = factorDe(prod[0].unidad, ip.v.unidad, input.cuanto);
    if (factor == null) return { ok: false, error: `¿Cuánto trae 1 ${prod[0].unidad}? Escríbelo en ${ip.v.unidad}.` };
    await enlazar(input.productoId, ip.v.origen, ip.v.sku, factor, quien);
    if (ip.p && ip.p.unidad === ip.v.unidad) await enlazar(input.productoId, ip.p.origen, ip.p.sku, factor, quien);
    revalidatePath("/grupo/insumos");
    revalidatePath("/grupo/precios-compra");
    return { ok: true, pareja: !!ip.p };
  } catch (e) {
    console.error("[conectarProductoInsumo]", e);
    return { ok: false, error: "No se pudo conectar. Intenta de nuevo." };
  }
}

export async function desconectarProductoInsumo(input: { productoId: number; origen: string; sku: string }): Promise<R> {
  if (!(await direccion())) return { ok: false, error: "Solo dirección." };
  try {
    const ip = await insumoYPareja(input.origen, input.sku);
    if (!ip) return { ok: false, error: "No encontré ese insumo." };
    for (const x of [ip.v, ip.p]) {
      if (x) await sql`DELETE FROM proveedor_producto_insumos WHERE producto_id = ${input.productoId} AND origen = ${x.origen} AND sku = ${x.sku}`;
    }
    revalidatePath("/grupo/insumos");
    revalidatePath("/grupo/precios-compra");
    return { ok: true };
  } catch (e) {
    console.error("[desconectarProductoInsumo]", e);
    return { ok: false, error: "No se pudo quitar. Intenta de nuevo." };
  }
}

/**
 * Proveedor elegido para un insumo (y su pareja de la otra lista), con el motivo (26-nov-2026: a veces se elige uno
 * más caro por calidad). Desde entonces ese proveedor manda sobre el más barato al sugerir el
 * precio de Recetas. No cambia el precio de las recetas: eso sigue siendo «Usar este precio».
 */
export async function elegirProveedorInsumo(input: { origen: string; sku: string; proveedorId: number; motivo: string; nota?: string | null }): Promise<R> {
  const quien = await direccion();
  if (!quien) return { ok: false, error: "Solo dirección." };
  if (!(input.motivo in MOTIVOS_ELEGIDO)) return { ok: false, error: "Elige el motivo." };
  const nota = typeof input.nota === "string" && input.nota.trim() ? input.nota.trim().slice(0, 200) : null;
  try {
    const prov = (await sql`SELECT id FROM proveedores WHERE id = ${input.proveedorId} AND activo`) as { id: number }[];
    if (!prov[0]) return { ok: false, error: "No encontré ese proveedor." };
    const ip = await insumoYPareja(input.origen, input.sku);
    if (!ip) return { ok: false, error: "No encontré ese insumo." };
    for (const x of [ip.v, ip.p]) {
      if (!x) continue;
      await sql`INSERT INTO insumo_proveedor_elegido (origen, sku, proveedor_id, motivo, nota, elegido_por)
                VALUES (${x.origen}, ${x.sku}, ${input.proveedorId}, ${input.motivo}, ${nota}, ${quien})
                ON CONFLICT (origen, sku) DO UPDATE SET proveedor_id = EXCLUDED.proveedor_id, motivo = EXCLUDED.motivo, nota = EXCLUDED.nota,
                  elegido_por = EXCLUDED.elegido_por, elegido_el = now()`;
    }
    revalidatePath("/grupo/insumos");
    revalidatePath("/grupo/precios-compra");
    return { ok: true };
  } catch (e) {
    console.error("[elegirProveedorInsumo]", e);
    const falta = /insumo_proveedor_elegido.*does not exist/i.test(e instanceof Error ? e.message : String(e));
    return { ok: false, error: falta ? "Falta crear la tabla del proveedor elegido (migración pendiente)." : "No se pudo guardar. Intenta de nuevo." };
  }
}

export async function quitarProveedorElegido(input: { origen: string; sku: string }): Promise<R> {
  if (!(await direccion())) return { ok: false, error: "Solo dirección." };
  try {
    const ip = await insumoYPareja(input.origen, input.sku);
    if (!ip) return { ok: false, error: "No encontré ese insumo." };
    for (const x of [ip.v, ip.p]) if (x) await sql`DELETE FROM insumo_proveedor_elegido WHERE origen = ${x.origen} AND sku = ${x.sku}`;
    revalidatePath("/grupo/insumos");
    revalidatePath("/grupo/precios-compra");
    return { ok: true };
  } catch (e) {
    console.error("[quitarProveedorElegido]", e);
    return { ok: false, error: "No se pudo quitar. Intenta de nuevo." };
  }
}

/**
 * Anota dónde se compra un insumo con un precio visto (no una compra): «Plaza Vea, lata de 393 g, S/ 5.90». Crea el
 * proveedor si no existe (para las sedes que compran esa lista) y un producto con el nombre del insumo, conectado a
 * él y a su pareja. El precio queda como «Precio cotizado» con la fecha de hoy.
 */
export async function agregarDondeSeCompra(input: {
  origen: string;
  sku: string;
  proveedorId?: number | null;
  proveedorNuevo?: string | null;
  /** Cómo viene: «lata de 393 g». */
  envase: string;
  /** Cuánto trae, en la unidad del insumo (0.393 kg). */
  cuanto: number;
  /** Lo que cuesta ese envase. */
  precio: number;
}): Promise<R<{ proveedor: string }>> {
  const quien = await direccion();
  if (!quien) return { ok: false, error: "Solo dirección." };
  const cuanto = r4(Number(input.cuanto));
  const precio = Math.round(Number(input.precio) * 100) / 100;
  if (!(cuanto > 0)) return { ok: false, error: "Escribe cuánto trae." };
  if (!(precio > 0) || precio > 100000) return { ok: false, error: "Escribe el precio, mayor que cero." };
  const envase = (input.envase ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "unidad";
  try {
    const ip = await insumoYPareja(input.origen, input.sku);
    if (!ip) return { ok: false, error: "No encontré ese insumo." };
    const origen = ip.v.origen as OrigenInsumo;

    // Proveedor: el elegido o uno nuevo (si ya existe con ese nombre, se usa ese).
    let proveedorId = input.proveedorId ?? null;
    let proveedor = "";
    if (proveedorId) {
      const r = (await sql`SELECT nombre FROM proveedores WHERE id = ${proveedorId} AND activo`) as { nombre: string }[];
      if (!r[0]) return { ok: false, error: "No encontré ese proveedor." };
      proveedor = r[0].nombre;
    } else {
      const nombre = nombreBonito((input.proveedorNuevo ?? "").replace(/\s+/g, " ").trim().slice(0, 80));
      if (nombre.length < 2) return { ok: false, error: "Elige el proveedor o escribe su nombre." };
      const ya = (await sql`SELECT id, nombre FROM proveedores WHERE activo AND lower(nombre) = lower(${nombre}) LIMIT 1`) as { id: number; nombre: string }[];
      if (ya[0]) { proveedorId = ya[0].id; proveedor = ya[0].nombre; }
      else {
        const sedes = [...new Set([...SEDES_DE_ORIGEN[origen], ...(ip.p ? SEDES_DE_ORIGEN[ip.p.origen as OrigenInsumo] : [])])].sort();
        const r = (await sql`INSERT INTO proveedores (nombre, tipo, rubro, sedes, creado_por) VALUES (${nombre}, 'proveedor', 'Compras', ${sedes}, ${quien}) RETURNING id`) as { id: number }[];
        proveedorId = r[0].id;
        proveedor = nombre;
      }
    }

    // Producto: el que ya tiene el nombre del insumo en su unidad, o uno nuevo.
    const unidad = unidadDesdeInsumo(ip.v.unidad as "kg" | "l" | "und");
    const prods = (await sql`SELECT id FROM proveedor_productos WHERE activo AND lower(nombre) = lower(${ip.v.nombre}) AND lower(unidad) = ${unidad} LIMIT 1`) as { id: number }[];
    const productoId = prods[0]?.id ?? ((await sql`INSERT INTO proveedor_productos (nombre, unidad, creado_por) VALUES (${ip.v.nombre}, ${unidad}, ${quien}) RETURNING id`) as { id: number }[])[0].id;
    const factor = factorInsumo(unidad, ip.v.unidad as "kg" | "l" | "und") ?? 1;
    await enlazar(productoId, ip.v.origen, ip.v.sku, factor, quien);
    if (ip.p && ip.p.unidad === ip.v.unidad) await enlazar(productoId, ip.p.origen, ip.p.sku, factor, quien);

    await sql`
      INSERT INTO proveedor_precios (proveedor_id, producto_id, presentacion, cantidad, precio, fecha, nota, sede_id, registrado_por)
      VALUES (${proveedorId}, ${productoId}, ${`Precio cotizado: ${envase}`}, ${cuanto}, ${precio}, ${hoyLima()}::date,
              'Precio visto o cotizado, no es una compra', NULL, ${quien})`;
    revalidatePath("/grupo/insumos");
    revalidatePath("/grupo/precios-compra");
    return { ok: true, proveedor };
  } catch (e) {
    console.error("[agregarDondeSeCompra]", e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
}

/* ─────────── Conectar en bloque ─────────── */

export type SugerenciaProveedor = {
  producto: ProductoProveedor;
  /** Por cada lista que lo compra, los insumos más parecidos. */
  candidatos: { origen: OrigenInsumo; sku: string; nombre: string; unidad: string; parecido: number; unidadesCalzan: boolean }[];
  /** Mismo nombre y unidades que se convierten solas: se puede conectar con un botón. */
  seguro: boolean;
};

async function calcularSugerencias(): Promise<SugerenciaProveedor[]> {
  const [{ productos }, { vigentes }, archivados] = await Promise.all([leerProductosProveedor(), leerPreciosVigentes(sql), leerArchivados(sql)]);
  const activos = vigentes.filter((v) => !archivados.has(claveInsumo(v.origen, v.sku)));
  const out: SugerenciaProveedor[] = [];
  for (const p of productos) {
    if (p.conectadoA.length > 0) continue;
    const origenes: OrigenInsumo[] = p.origenes.length > 0 ? p.origenes : ["Atelier", "Cafetería"];
    const candidatos: SugerenciaProveedor["candidatos"] = [];
    for (const o of origenes) {
      for (const m of masParecidos(p.nombre, activos.filter((v) => v.origen === o), 3, PARECIDO_POSIBLE)) {
        candidatos.push({ origen: o, sku: m.item.sku, nombre: m.item.nombre, unidad: m.item.unidad, parecido: Math.round(m.parecido * 100) / 100,
          unidadesCalzan: factorSeguro(p.unidad, m.item.unidad) != null });
      }
    }
    candidatos.sort((a, b) => b.parecido - a.parecido);
    const mejor = candidatos[0];
    out.push({ producto: p, candidatos, seguro: !!mejor && mejor.parecido >= PARECIDO_SEGURO && mejor.unidadesCalzan
      && candidatos.filter((c) => c.origen === mejor.origen && c.parecido === mejor.parecido).length === 1 });
  }
  return out.sort((a, b) => Number(b.seguro) - Number(a.seguro) || (b.candidatos[0]?.parecido ?? 0) - (a.candidatos[0]?.parecido ?? 0) || a.producto.nombre.localeCompare(b.producto.nombre, "es"));
}

/** Los productos de proveedor que aún no son ningún insumo, con los insumos que más se les parecen. */
export async function getSugerenciasProveedor(): Promise<R<{ sugerencias: SugerenciaProveedor[]; conectados: number }>> {
  if (!(await direccion())) return { ok: false, error: "Solo dirección." };
  try {
    const [sugerencias, enlaces] = await Promise.all([calcularSugerencias(), leerEnlaces(sql)]);
    return { ok: true, sugerencias, conectados: new Set(enlaces.map((e) => e.productoId)).size };
  } catch (e) {
    console.error("[getSugerenciasProveedor]", e);
    return { ok: false, error: "No se pudo leer Proveedores." };
  }
}

/** Conecta de una vez los seguros (se recalculan aquí: no se confía en lo que manda la pantalla). */
export async function conectarSugerenciasSeguras(): Promise<R<{ conectados: number }>> {
  const quien = await direccion();
  if (!quien) return { ok: false, error: "Solo dirección." };
  try {
    const seguras = (await calcularSugerencias()).filter((s) => s.seguro);
    const { vigentes } = await leerPreciosVigentes(sql);
    const parejas = await leerParejas(sql, vigentes);
    const porClave = new Map(vigentes.map((v) => [claveInsumo(v.origen, v.sku), v]));
    let n = 0;
    for (const s of seguras) {
      const c = s.candidatos[0];
      const factor = factorSeguro(s.producto.unidad, c.unidad);
      if (factor == null) continue;
      await enlazar(s.producto.id, c.origen, c.sku, factor, quien);
      const kp = parejas.get(claveInsumo(c.origen, c.sku));
      const p = kp ? porClave.get(kp) : undefined;
      if (p && p.unidad === c.unidad) await enlazar(s.producto.id, p.origen, p.sku, factor, quien);
      n++;
    }
    revalidatePath("/grupo/insumos");
    revalidatePath("/grupo/precios-compra");
    return { ok: true, conectados: n };
  } catch (e) {
    console.error("[conectarSugerenciasSeguras]", e);
    return { ok: false, error: "No se pudo conectar. Intenta de nuevo." };
  }
}
