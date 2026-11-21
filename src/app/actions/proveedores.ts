"use server";

/**
 * Proveedores y precios (Jahnn, 20-nov-2026). Una sola lista para las 3 sedes: cada proveedor marca qué sedes le
 * compran. La usan los administradores (su sede) y la dirección. Ambos agregan contactos y registran precios;
 * cada cambio guarda quién y cuándo, y un precio nuevo nunca borra el anterior (queda en el historial).
 * La lógica de comparar y armar pedidos vive en lib/proveedores.ts.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { activeBusinessId } from "@/lib/active-business";
import { getToday } from "@/lib/utils";
import { leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { factorInsumo, mejorParaInsumo, nombreBonito, precioDesdeCompra, sedesDesdeNombres, unidadDesdeInsumo, type OrigenInsumo, type UnidadInsumo } from "@/lib/proveedores";
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

/** Quién usa el módulo: la dirección o el administrador de una sede. */
async function sesion(): Promise<{ nombre: string; sedeFija: number | null; direccion: boolean } | null> {
  const role = await getSessionRole();
  if (!role) return null;
  if (role.kind === "full") return { nombre: role.quien === "kelly" ? "Kelly" : "Jahnn", sedeFija: null, direccion: true };
  if (role.kind === "admin") return { nombre: role.nombre ?? "Administración", sedeFija: role.sede, direccion: false };
  return null;
}

export async function getProveedores(): Promise<R<{ datos: DatosProveedores }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  try {
    const sedeId = s.sedeFija ?? (await activeBusinessId());
    const [provs, prods, precios, { vigentes: insumosVig }, enlaces, sync] = await Promise.all([
      sql`SELECT id, nombre, tipo, rubro, contacto, telefono, telefono2, email, direccion, ciudad, notas, sedes,
                 costo_envio::float AS "costoEnvio", pedido_minimo::float AS "pedidoMinimo",
                 COALESCE(actualizado_por, creado_por) AS "actualizadoPor", caja_id IS NOT NULL AS "deCaja",
                 to_char(COALESCE(actualizado_el, creado_el) AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "actualizadoEl"
          FROM proveedores WHERE activo ORDER BY tipo, rubro, nombre`,
      sql`SELECT id, nombre, unidad, rubro FROM proveedor_productos WHERE activo ORDER BY nombre`,
      sql`SELECT pp.id, proveedor_id AS "proveedorId", producto_id AS "productoId", presentacion, cantidad::float AS cantidad,
                 precio::float AS precio, to_char(fecha, 'YYYY-MM-DD') AS fecha, nota, registrado_por AS "registradoPor"
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
        hoy: getToday(), sedeId, puedeEditar: true, puedeCambiarRecetas: s.direccion,
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

export type EntradaProveedor = {
  id?: number;
  nombre: string;
  tipo: "proveedor" | "tecnico";
  rubro: string;
  contacto?: string | null;
  telefono?: string | null;
  telefono2?: string | null;
  email?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  notas?: string | null;
  sedes: number[];
  costoEnvio?: number | null;
  pedidoMinimo?: number | null;
};

const monto = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100);

export async function guardarProveedor(e: EntradaProveedor): Promise<R<{ id: number }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  const nombre = limpio(e.nombre, 120);
  const rubro = limpio(e.rubro, 60);
  if (!nombre) return { ok: false, error: "Escribe el nombre del proveedor." };
  if (!rubro) return { ok: false, error: "Elige o escribe el rubro (ej. Packaging, Electricista)." };
  if (e.tipo !== "proveedor" && e.tipo !== "tecnico") return { ok: false, error: "Tipo inválido." };
  if (!limpio(e.telefono) && !limpio(e.email)) return { ok: false, error: "Escribe al menos un teléfono o un correo." };
  let sedes = [...new Set(e.sedes.filter((x) => [1, 2, 3].includes(x)))].sort();
  // El administrador siempre ve lo que registra: su sede va incluida.
  if (s.sedeFija && !sedes.includes(s.sedeFija)) sedes = [...sedes, s.sedeFija].sort();
  if (sedes.length === 0) return { ok: false, error: "Marca al menos una sede." };
  try {
    if (e.id) {
      const r = (await sql`
        UPDATE proveedores SET nombre = ${nombre}, tipo = ${e.tipo}, rubro = ${rubro}, contacto = ${limpio(e.contacto, 120)},
          telefono = ${limpio(e.telefono, 40)}, telefono2 = ${limpio(e.telefono2, 40)}, email = ${limpio(e.email, 120)},
          direccion = ${limpio(e.direccion, 200)}, ciudad = ${limpio(e.ciudad, 60)}, notas = ${limpio(e.notas, 600)}, sedes = ${sedes},
          costo_envio = ${monto(e.costoEnvio)}, pedido_minimo = ${monto(e.pedidoMinimo)},
          actualizado_por = ${s.nombre}, actualizado_el = now()
        WHERE id = ${e.id} AND activo RETURNING id`) as { id: number }[];
      if (!r[0]) return { ok: false, error: "No encontré ese proveedor." };
      return { ok: true, id: r[0].id };
    }
    const r = (await sql`
      INSERT INTO proveedores (nombre, tipo, rubro, contacto, telefono, telefono2, email, direccion, ciudad, notas, sedes, costo_envio, pedido_minimo, creado_por)
      VALUES (${nombre}, ${e.tipo}, ${rubro}, ${limpio(e.contacto, 120)}, ${limpio(e.telefono, 40)}, ${limpio(e.telefono2, 40)},
              ${limpio(e.email, 120)}, ${limpio(e.direccion, 200)}, ${limpio(e.ciudad, 60)}, ${limpio(e.notas, 600)}, ${sedes},
              ${monto(e.costoEnvio)}, ${monto(e.pedidoMinimo)}, ${s.nombre})
      RETURNING id`) as { id: number }[];
    return { ok: true, id: r[0].id };
  } catch (err) {
    return errorBD("guardar", err);
  }
}

/** Quitar de la lista: se archiva (activo = false), nunca se borra. Sus precios quedan guardados. */
export async function archivarProveedor(id: number): Promise<R<object>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  try {
    await sql`UPDATE proveedores SET activo = false, actualizado_por = ${s.nombre}, actualizado_el = now() WHERE id = ${id}`;
    return { ok: true };
  } catch (err) {
    return errorBD("archivar", err);
  }
}

export type EntradaPrecio = {
  proveedorId: number;
  /** Producto existente… */
  productoId?: number | null;
  /** …o uno nuevo para comparar. */
  productoNuevo?: { nombre: string; unidad: string } | null;
  /** …o un insumo de Recetas: se crea el producto con su nombre y unidad, ya conectado. */
  desdeInsumo?: { origen: OrigenInsumo; sku: string } | null;
  presentacion: string;
  cantidad: number;
  precio: number;
  fecha: string;
  nota?: string | null;
};

export async function registrarPrecio(e: EntradaPrecio): Promise<R<{ productoId: number }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  const presentacion = limpio(e.presentacion, 80);
  if (!presentacion) return { ok: false, error: "Escribe la presentación (ej. «Paquete de 500 hojas»)." };
  if (!Number.isFinite(e.cantidad) || e.cantidad <= 0) return { ok: false, error: "¿Cuántas unidades trae esa presentación? Debe ser mayor a 0." };
  if (!Number.isFinite(e.precio) || e.precio < 0) return { ok: false, error: "Escribe el precio en soles." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha) || e.fecha > getToday()) return { ok: false, error: "La fecha no puede ser futura." };
  try {
    let productoId = e.productoId ?? null;
    if (!productoId && e.desdeInsumo) {
      const r = await productoDesdeInsumo(e.desdeInsumo.origen, e.desdeInsumo.sku, s.nombre);
      if (!r.ok) return r;
      productoId = r.productoId;
    }
    if (!productoId) {
      const nombre = limpio(e.productoNuevo?.nombre, 100);
      const unidad = limpio(e.productoNuevo?.unidad, 30)?.toLowerCase() ?? null;
      if (!nombre || !unidad) return { ok: false, error: "Escribe el producto y su unidad (ej. «Papel manteca», «hoja»)." };
      const existe = (await sql`SELECT id FROM proveedor_productos WHERE activo AND lower(nombre) = lower(${nombre}) AND lower(unidad) = ${unidad}`) as { id: number }[];
      productoId = existe[0]?.id ?? ((await sql`
        INSERT INTO proveedor_productos (nombre, unidad, creado_por) VALUES (${nombre}, ${unidad}, ${s.nombre}) RETURNING id`) as { id: number }[])[0].id;
    }
    const prov = (await sql`SELECT id FROM proveedores WHERE id = ${e.proveedorId} AND activo`) as { id: number }[];
    if (!prov[0]) return { ok: false, error: "Elige un proveedor de la lista." };
    const sedeId = s.sedeFija ?? (await activeBusinessId().catch(() => null));
    await sql`
      INSERT INTO proveedor_precios (proveedor_id, producto_id, presentacion, cantidad, precio, fecha, nota, sede_id, registrado_por)
      VALUES (${e.proveedorId}, ${productoId}, ${presentacion}, ${e.cantidad}, ${Math.round(e.precio * 100) / 100}, ${e.fecha},
              ${limpio(e.nota, 300)}, ${sedeId}, ${s.nombre})`;
    return { ok: true, productoId };
  } catch (err) {
    return errorBD("precio", err);
  }
}

async function insumoVigente(origen: OrigenInsumo, sku: string) {
  const { vigentes } = await leerPreciosVigentes(sql);
  return vigentes.find((v) => v.origen === origen && v.sku === sku) ?? null;
}

/** El producto conectado a ese insumo; si no existe, lo crea con el nombre y la unidad del insumo. */
async function productoDesdeInsumo(origen: OrigenInsumo, sku: string, quien: string): Promise<R<{ productoId: number }>> {
  const ins = await insumoVigente(origen, sku);
  if (!ins) return { ok: false, error: "No encontré ese insumo en Recetas y costos." };
  const ya = (await sql`SELECT e.producto_id AS id FROM proveedor_producto_insumos e JOIN proveedor_productos p ON p.id = e.producto_id AND p.activo
                        WHERE e.origen = ${origen} AND e.sku = ${sku} LIMIT 1`) as { id: number }[];
  if (ya[0]) return { ok: true, productoId: ya[0].id };
  const unidad = unidadDesdeInsumo(ins.unidad);
  const existe = (await sql`SELECT id FROM proveedor_productos WHERE activo AND lower(nombre) = lower(${ins.nombre}) AND lower(unidad) = ${unidad}`) as { id: number }[];
  const productoId = existe[0]?.id ?? ((await sql`
    INSERT INTO proveedor_productos (nombre, unidad, creado_por) VALUES (${ins.nombre}, ${unidad}, ${quien}) RETURNING id`) as { id: number }[])[0].id;
  await sql`INSERT INTO proveedor_producto_insumos (producto_id, origen, sku, factor, creado_por)
            VALUES (${productoId}, ${origen}, ${sku}, 1, ${quien})
            ON CONFLICT (producto_id, origen) DO UPDATE SET sku = EXCLUDED.sku, factor = EXCLUDED.factor, creado_por = EXCLUDED.creado_por, creado_el = now()`;
  return { ok: true, productoId };
}

/** Conectar un producto de Proveedores con un insumo de Recetas (uno por lista: Atelier y cafeterías). */
export async function conectarInsumo(input: { productoId: number; origen: OrigenInsumo; sku: string }): Promise<R<object>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
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
    const productos = (await sql`SELECT id, lower(nombre) AS nombre, lower(unidad) AS unidad FROM proveedor_productos WHERE activo`) as { id: number; nombre: string; unidad: string }[];
    const prodPorClave = new Map(productos.map((p) => [`${p.nombre}|${p.unidad}`, p.id]));
    const filas: { prov: number; prod: number; pres: string; cant: number; precio: number; fecha: string; sede: number | null; item: string }[] = [];
    for (const c of nuevas) {
      const precio = precioDesdeCompra({ cantidad: c.cantidad, precioTotal: c.precio_total, unidad: c.unidad });
      if (!precio) continue;
      const nombre = nombreBonito(c.producto);
      const unidad = (c.unidad || "unidad").trim().toLowerCase();
      const clave = `${nombre.toLowerCase()}|${unidad}`;
      let prod = prodPorClave.get(clave);
      if (!prod) {
        prod = ((await sql`INSERT INTO proveedor_productos (nombre, unidad, creado_por) VALUES (${nombre}, ${unidad}, 'Control de Caja') RETURNING id`) as { id: number }[])[0].id;
        prodPorClave.set(clave, prod);
      }
      filas.push({ prov: idPorCaja.get(c.proveedor_id)!, prod, pres: precio.presentacion, cant: precio.cantidad, precio: precio.precio, fecha: c.fecha, sede: sedesDesdeNombres([c.sede]).length === 1 ? sedesDesdeNombres([c.sede])[0] : null, item: c.item_id });
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
