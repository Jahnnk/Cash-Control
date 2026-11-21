"use server";

/**
 * Grupo → Precios de compra (Jahnn, 20/21-nov-2026). Desde el 21-nov los administradores registran proveedores,
 * compras y precios SOLO en Control de Caja (un solo lugar); aquí se traen de allá y la dirección los analiza:
 * entre proveedores, entre sedes, ahorro frente al precio habitual y la conexión con Recetas y costos.
 * Solo la dirección escribe (conectar un insumo, «Usar en Recetas», traer de Control de Caja); la llave de solo
 * lectura puede mirar. La lógica vive en lib/proveedores.ts.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole, puedeLeerDireccion } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import { leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { claveNombre, factorInsumo, mejorParaInsumo, nombreBonito, precioDesdeCompra, sedesDesdeNombres, type OrigenInsumo, type UnidadInsumo } from "@/lib/proveedores";
import { comprasCaja, controlCajaConfigurado, proveedoresCaja } from "@/lib/control-caja";
import { leerEnlaces, leerOfertas, type EnlaceInsumo } from "@/lib/proveedores-sql";
import { guardarPrecioInsumo } from "./precios-insumos";

const sql = neon(process.env.DATABASE_URL!);

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

export type Proveedor = {
  id: number;
  nombre: string;
  tipo: "proveedor" | "tecnico";
  rubro: string;
  contacto: string | null;
  telefono: string | null;
  telefono2: string | null;
  email: string | null;
  direccion: string | null;
  ciudad: string | null;
  notas: string | null;
  sedes: number[];
  costoEnvio: number | null;
  pedidoMinimo: number | null;
  actualizadoPor: string;
  actualizadoEl: string;
  /** Vino de Control de Caja (y se actualiza de allá). */
  deCaja?: boolean;
};

export type ProductoComparable = { id: number; nombre: string; unidad: string; rubro: string | null };

export type PrecioRegistrado = {
  id: number;
  proveedorId: number;
  productoId: number;
  presentacion: string;
  cantidad: number;
  precio: number;
  fecha: string;
  nota: string | null;
  registradoPor: string;
  /** Sede que hizo la compra (business_id). null = no se sabe. */
  sedeId: number | null;
};

/** Un insumo de Recetas y costos con su precio vigente (por kg, litro o unidad). */
export type InsumoReceta = { origen: OrigenInsumo; sku: string; nombre: string; unidad: UnidadInsumo; precio: number };

export type DatosProveedores = {
  hoy: string;
  sedeId: number;
  puedeEditar: boolean;
  /** Solo la dirección pasa un precio de proveedor al costo de Recetas. */
  puedeCambiarRecetas: boolean;
  insumos: InsumoReceta[];
  enlaces: EnlaceInsumo[];
  /** Última vez que se trajeron proveedores y compras de Control de Caja. null = nunca. */
  sincronizado: { el: string; nuevosProveedores: number; nuevosPrecios: number } | null;
  proveedores: Proveedor[];
  productos: ProductoComparable[];
  /** Todo el historial; el vigente de cada (proveedor, producto) es el último. */
  precios: PrecioRegistrado[];
};

const SIN_ACCESO = { ok: false as const, error: "No tienes acceso a proveedores." };
const LARGO = 300;
const limpio = (s: string | null | undefined, max = LARGO) => {
  const t = (s ?? "").trim().slice(0, max);
  return t === "" ? null : t;
};

function errorBD(donde: string, e: unknown): { ok: false; error: string } {
  console.error(`[proveedores:${donde}]`, e);
  const falta = /relation .*proveedor.* does not exist/i.test(e instanceof Error ? e.message : String(e));
  return { ok: false, error: falta ? "Falta crear las tablas de proveedores en la base." : "No pude conectar con la base. Intenta de nuevo." };
}

/** Quién usa el módulo: la dirección (escribe) o la llave de solo lectura (mira). Los administradores van a Control de Caja. */
async function sesion(): Promise<{ nombre: string; direccion: boolean } | null> {
  const role = await getSessionRole();
  if (!role) return null;
  if (role.kind === "full") return { nombre: role.quien === "kelly" ? "Kelly" : "Jahnn", direccion: true };
  if (puedeLeerDireccion(role)) return { nombre: "lector", direccion: false };
  return null;
}
const SOLO_DIRECCION = { ok: false as const, error: "Solo la dirección puede hacer esto." };

export async function getProveedores(): Promise<R<{ datos: DatosProveedores }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  try {
    const [provs, prods, precios, { vigentes: insumosVig }, enlaces, sync] = await Promise.all([
      sql`SELECT id, nombre, tipo, rubro, contacto, telefono, telefono2, email, direccion, ciudad, notas, sedes,
                 costo_envio::float AS "costoEnvio", pedido_minimo::float AS "pedidoMinimo",
                 COALESCE(actualizado_por, creado_por) AS "actualizadoPor", caja_id IS NOT NULL AS "deCaja",
                 to_char(COALESCE(actualizado_el, creado_el) AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "actualizadoEl"
          FROM proveedores WHERE activo ORDER BY tipo, rubro, nombre`,
      sql`SELECT id, nombre, unidad, rubro FROM proveedor_productos WHERE activo ORDER BY nombre`,
      sql`SELECT pp.id, proveedor_id AS "proveedorId", producto_id AS "productoId", presentacion, cantidad::float AS cantidad,
                 precio::float AS precio, to_char(fecha, 'YYYY-MM-DD') AS fecha, nota, registrado_por AS "registradoPor", pp.sede_id AS "sedeId"
          FROM proveedor_precios pp
          JOIN proveedores p ON p.id = pp.proveedor_id AND p.activo
          JOIN proveedor_productos x ON x.id = pp.producto_id AND x.activo
          ORDER BY fecha, pp.id`,
      leerPreciosVigentes(sql),
      leerEnlaces(sql),
      leerSync(),
    ]);
    return {
      ok: true,
      datos: {
        // sedeId 0: Grupo mira las 3 sedes (el directorio muestra a qué sedes les vende cada uno).
        hoy: getToday(), sedeId: 0, puedeEditar: s.direccion, puedeCambiarRecetas: s.direccion,
        insumos: insumosVig.map((v) => ({ origen: v.origen, sku: v.sku, nombre: v.nombre, unidad: v.unidad, precio: v.precio })),
        enlaces,
        sincronizado: sync,
        proveedores: provs as Proveedor[], productos: prods as ProductoComparable[], precios: precios as PrecioRegistrado[],
      },
    };
  } catch (e) {
    return errorBD("leer", e);
  }
}

async function insumoVigente(origen: OrigenInsumo, sku: string) {
  const { vigentes } = await leerPreciosVigentes(sql);
  return vigentes.find((v) => v.origen === origen && v.sku === sku) ?? null;
}

/** Conectar un producto de Proveedores con un insumo de Recetas (uno por lista: Atelier y cafeterías). */
export async function conectarInsumo(input: { productoId: number; origen: OrigenInsumo; sku: string }): Promise<R<object>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  if (!s.direccion) return SOLO_DIRECCION;
  if (input.origen !== "Atelier" && input.origen !== "Cafetería") return { ok: false, error: "Lista de insumos inválida." };
  try {
    const prod = (await sql`SELECT unidad FROM proveedor_productos WHERE id = ${input.productoId} AND activo`) as { unidad: string }[];
    if (!prod[0]) return { ok: false, error: "No encontré ese producto." };
    const ins = await insumoVigente(input.origen, input.sku);
    if (!ins) return { ok: false, error: "No encontré ese insumo en Recetas y costos." };
    const factor = factorInsumo(prod[0].unidad, ins.unidad);
    if (factor === null) return { ok: false, error: `No se pueden comparar: el producto se mide por ${prod[0].unidad} y el insumo por ${ins.unidad}.` };
    await sql`INSERT INTO proveedor_producto_insumos (producto_id, origen, sku, factor, creado_por)
              VALUES (${input.productoId}, ${input.origen}, ${input.sku}, ${factor}, ${s.nombre})
              ON CONFLICT (producto_id, origen) DO UPDATE SET sku = EXCLUDED.sku, factor = EXCLUDED.factor, creado_por = EXCLUDED.creado_por, creado_el = now()`;
    return { ok: true };
  } catch (err) {
    return errorBD("conectar", err);
  }
}

export async function desconectarInsumo(input: { productoId: number; origen: OrigenInsumo }): Promise<R<object>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  if (!s.direccion) return SOLO_DIRECCION;
  try {
    await sql`DELETE FROM proveedor_producto_insumos WHERE producto_id = ${input.productoId} AND origen = ${input.origen}`;
    return { ok: true };
  } catch (err) {
    return errorBD("desconectar", err);
  }
}

/**
 * «Usar en Recetas»: el costo del insumo pasa a ser el mejor precio de proveedor (de las sedes que compran ese
 * insumo), en su unidad. Solo la dirección: mueve el costo de todos los productos que lo llevan.
 */
export async function usarPrecioEnRecetas(input: { productoId: number; origen: OrigenInsumo }): Promise<R<{ precio: number; insumo: string }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  if (!s.direccion) return { ok: false, error: "Solo la dirección cambia el costo de Recetas." };
  try {
    const e = (await leerEnlaces(sql)).find((x) => x.productoId === input.productoId && x.origen === input.origen);
    if (!e) return { ok: false, error: "Ese producto no está conectado con un insumo." };
    const { proveedores, ofertas } = await leerOfertas(sql);
    const mejor = mejorParaInsumo(ofertas, proveedores, e.productoId, e.origen, e.factor);
    if (!mejor) return { ok: false, error: "Ningún proveedor de esas sedes tiene precio para este producto." };
    const r = await guardarPrecioInsumo({ origen: e.origen, sku: e.sku, precio: mejor.precioInsumo });
    if (!r.ok) return r;
    const ins = await insumoVigente(e.origen, e.sku);
    return { ok: true, precio: mejor.precioInsumo, insumo: ins?.nombre ?? e.sku };
  } catch (err) {
    return errorBD("usar", err);
  }
}

/* ─────────── Traer de Control de Caja (21-nov-2026) ─────────── */

const CLAVE_SYNC = "proveedores_caja_sync";
/** Se traen las compras del último año: lo más viejo ya no sirve para comparar precios. */
const DIAS_HISTORIAL = 365;
/** Al abrir la pantalla se actualiza solo si pasó más de esto desde la última vez. */
const MINUTOS_ENTRE_SYNC = 60;

async function leerSync(): Promise<DatosProveedores["sincronizado"]> {
  try {
    const r = (await sql`SELECT value FROM app_settings WHERE key = ${CLAVE_SYNC}`) as { value: DatosProveedores["sincronizado"] }[];
    return r[0]?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Trae de Control de Caja los proveedores y el precio real de cada compra. No duplica: cada proveedor y cada línea
 * de compra recuerdan su id de allá. A un proveedor que ya existe solo le completa lo que falta (no pisa lo editado
 * aquí). `siHaceFalta`: solo si pasó más de una hora desde la última vez (lo usa la pantalla al abrir).
 */
export async function sincronizarConControlCaja(opciones?: { siHaceFalta?: boolean }): Promise<R<{ nuevosProveedores: number; nuevosPrecios: number; omitido?: boolean }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  if (!s.direccion) return SOLO_DIRECCION;
  if (!controlCajaConfigurado()) return { ok: false, error: "La conexión con Control de Caja no está configurada." };
  if (opciones?.siHaceFalta) {
    const ult = await leerSync();
    if (ult && Date.now() - Date.parse(ult.el) < MINUTOS_ENTRE_SYNC * 60_000) return { ok: true, nuevosProveedores: 0, nuevosPrecios: 0, omitido: true };
  }
  let provsCaja, compras;
  try {
    const desde = new Date(Date.now() - DIAS_HISTORIAL * 86_400_000).toISOString().slice(0, 10);
    [provsCaja, compras] = await Promise.all([proveedoresCaja(), comprasCaja(desde)]);
  } catch (e) {
    console.error("[proveedores:caja]", e);
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, error: /function|does not exist|schema cache/i.test(msg)
      ? "Falta correr el archivo de proveedores en Supabase (Control de Caja)."
      : "No pude conectar con Control de Caja. Intenta de nuevo." };
  }
  try {
    // 1. Proveedores
    const existentes = (await sql`SELECT id, lower(nombre) AS nombre, caja_id::text AS "cajaId", telefono, direccion, sedes FROM proveedores WHERE activo`) as
      { id: number; nombre: string; cajaId: string | null; telefono: string | null; direccion: string | null; sedes: number[] }[];
    const idPorCaja = new Map<string, number>();
    let nuevosProveedores = 0;
    for (const p of provsCaja) {
      const nombre = nombreBonito(p.nombre);
      const sedes = sedesDesdeNombres(p.sedes ?? []);
      const ya = existentes.find((x) => x.cajaId === p.id) ?? existentes.find((x) => !x.cajaId && x.nombre === nombre.toLowerCase());
      if (ya) {
        const unidas = [...new Set([...ya.sedes, ...sedes])].sort();
        const alDia = ya.cajaId === p.id && unidas.length === ya.sedes.length && (ya.telefono || !p.telefono) && (ya.direccion || !p.direccion);
        idPorCaja.set(p.id, ya.id);
        if (alDia) continue;
        await sql`UPDATE proveedores SET caja_id = ${p.id}, telefono = COALESCE(telefono, ${limpio(p.telefono, 40)}),
                    direccion = COALESCE(direccion, ${limpio(p.direccion, 200)}), sedes = ${unidas}
                  WHERE id = ${ya.id}`;
        idPorCaja.set(p.id, ya.id);
        continue;
      }
      if (!p.activo) continue;
      const credito = p.condicion_pago === "credito" ? `Da crédito${p.dias_credito ? ` a ${p.dias_credito} días` : ""}.` : null;
      const notas = [credito, limpio(p.notas, 400)].filter(Boolean).join(" ") || null;
      const r = (await sql`
        INSERT INTO proveedores (nombre, tipo, rubro, telefono, direccion, notas, sedes, creado_por, caja_id)
        VALUES (${nombre}, 'proveedor', ${limpio(p.rubro ? nombreBonito(p.rubro) : null, 60) ?? "Compras"}, ${limpio(p.telefono, 40)},
                ${limpio(p.direccion, 200)}, ${notas}, ${sedes}, 'Control de Caja', ${p.id})
        RETURNING id`) as { id: number }[];
      idPorCaja.set(p.id, r[0].id);
      nuevosProveedores++;
    }

    // 2. Precios: solo las líneas de compra que aún no se trajeron.
    const ya = new Set(((await sql`SELECT caja_item_id::text AS id FROM proveedor_precios WHERE caja_item_id IS NOT NULL`) as { id: string }[]).map((x) => x.id));
    const nuevas = compras.filter((c) => !ya.has(c.item_id) && idPorCaja.has(c.proveedor_id));
    // Un solo criterio (21-nov-2026): el mismo producto con o sin tilde y en una sola unidad (g → kg, «und» → unidad).
    const productos = (await sql`SELECT id, nombre, lower(unidad) AS unidad FROM proveedor_productos WHERE activo`) as { id: number; nombre: string; unidad: string }[];
    const prodPorClave = new Map(productos.map((p) => [`${claveNombre(p.nombre)}|${p.unidad}`, p.id]));
    const listas = nuevas
      .map((c) => ({ c, precio: precioDesdeCompra({ cantidad: c.cantidad, precioTotal: c.precio_total, unidad: c.unidad }), nombre: nombreBonito(c.producto) }))
      .filter((x): x is { c: typeof nuevas[number]; precio: NonNullable<ReturnType<typeof precioDesdeCompra>>; nombre: string } => !!x.precio);
    // Productos que faltan, de una sola vez. Entre las formas de escribirlo se queda la que lleva tilde (la correcta).
    const faltan = new Map<string, { nombre: string; unidad: string }>();
    for (const x of listas) {
      const clave = `${claveNombre(x.nombre)}|${x.precio.unidad}`;
      if (prodPorClave.has(clave)) continue;
      const prev = faltan.get(clave);
      if (!prev || (/[^\x00-\x7F]/.test(x.nombre) && !/[^\x00-\x7F]/.test(prev.nombre))) faltan.set(clave, { nombre: x.nombre, unidad: x.precio.unidad });
    }
    if (faltan.size) {
      const lista = [...faltan.values()];
      const creados = (await sql`
        INSERT INTO proveedor_productos (nombre, unidad, creado_por)
        SELECT n, u, 'Control de Caja' FROM unnest(${lista.map((x) => x.nombre)}::text[], ${lista.map((x) => x.unidad)}::text[]) AS t(n, u)
        RETURNING id, nombre, unidad`) as { id: number; nombre: string; unidad: string }[];
      for (const p of creados) prodPorClave.set(`${claveNombre(p.nombre)}|${p.unidad.toLowerCase()}`, p.id);
    }
    const filas: { prov: number; prod: number; pres: string; cant: number; precio: number; fecha: string; sede: number | null; item: string }[] = [];
    for (const { c, precio, nombre } of listas) {
      const prod = prodPorClave.get(`${claveNombre(nombre)}|${precio.unidad}`);
      if (!prod) continue;
      const sedes = sedesDesdeNombres([c.sede]);
      filas.push({ prov: idPorCaja.get(c.proveedor_id)!, prod, pres: precio.presentacion, cant: precio.cantidad, precio: precio.precio, fecha: c.fecha, sede: sedes.length === 1 ? sedes[0] : null, item: c.item_id });
    }
    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500);
      await sql`
        INSERT INTO proveedor_precios (proveedor_id, producto_id, presentacion, cantidad, precio, fecha, nota, sede_id, registrado_por, caja_item_id)
        SELECT * FROM unnest(${lote.map((f) => f.prov)}::int[], ${lote.map((f) => f.prod)}::int[], ${lote.map((f) => f.pres)}::text[],
                             ${lote.map((f) => f.cant)}::numeric[], ${lote.map((f) => f.precio)}::numeric[], ${lote.map((f) => f.fecha)}::date[],
                             ${lote.map(() => "Compra real registrada en Control de Caja")}::text[], ${lote.map((f) => f.sede)}::int[],
                             ${lote.map(() => "Control de Caja")}::text[], ${lote.map((f) => f.item)}::uuid[])
        ON CONFLICT DO NOTHING`;
    }
    const resumen = { el: new Date().toISOString(), nuevosProveedores, nuevosPrecios: filas.length };
    await sql`INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (${CLAVE_SYNC}, ${JSON.stringify(resumen)}::jsonb, now(), ${s.nombre})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
    return { ok: true, nuevosProveedores, nuevosPrecios: filas.length };
  } catch (err) {
    return errorBD("caja", err);
  }
}
