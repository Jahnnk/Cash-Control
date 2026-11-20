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

export type DatosProveedores = {
  hoy: string;
  sedeId: number;
  puedeEditar: boolean;
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
async function sesion(): Promise<{ nombre: string; sedeFija: number | null } | null> {
  const role = await getSessionRole();
  if (!role) return null;
  if (role.kind === "full") return { nombre: role.quien === "kelly" ? "Kelly" : "Jahnn", sedeFija: null };
  if (role.kind === "admin") return { nombre: role.nombre ?? "Administración", sedeFija: role.sede };
  return null;
}

export async function getProveedores(): Promise<R<{ datos: DatosProveedores }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  try {
    const sedeId = s.sedeFija ?? (await activeBusinessId());
    const [provs, prods, precios] = await Promise.all([
      sql`SELECT id, nombre, tipo, rubro, contacto, telefono, telefono2, email, direccion, ciudad, notas, sedes,
                 costo_envio::float AS "costoEnvio", pedido_minimo::float AS "pedidoMinimo",
                 COALESCE(actualizado_por, creado_por) AS "actualizadoPor",
                 to_char(COALESCE(actualizado_el, creado_el) AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "actualizadoEl"
          FROM proveedores WHERE activo ORDER BY tipo, rubro, nombre`,
      sql`SELECT id, nombre, unidad, rubro FROM proveedor_productos WHERE activo ORDER BY nombre`,
      sql`SELECT pp.id, proveedor_id AS "proveedorId", producto_id AS "productoId", presentacion, cantidad::float AS cantidad,
                 precio::float AS precio, to_char(fecha, 'YYYY-MM-DD') AS fecha, nota, registrado_por AS "registradoPor"
          FROM proveedor_precios pp
          JOIN proveedores p ON p.id = pp.proveedor_id AND p.activo
          JOIN proveedor_productos x ON x.id = pp.producto_id AND x.activo
          ORDER BY fecha, pp.id`,
    ]);
    return {
      ok: true,
      datos: {
        hoy: getToday(), sedeId, puedeEditar: true,
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
