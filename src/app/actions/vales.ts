"use server";

/**
 * Vales de consumo digitales · Actions (iniciativa «Primer cliente»).
 *
 * Quién puede qué:
 *   · EMITIR y ANULAR: solo Jahnn (decisión suya, 22-nov-2026).
 *   · VER la lista: la dirección (Jahnn/Kelly).
 *   · CANJEAR: quien SÍ usa Cash Control en la sede — su administrador o
 *     encargado de salón — y la dirección. Los chicos de caja no usan la
 *     app: el encargado canjea y le dice a caja qué cobrar como cortesía en
 *     Byte. Cada uno solo canjea vales de SU sede.
 *
 * El canje es UN solo UPDATE con WHERE estado = 'emitido': si dos personas
 * lo intentan a la vez, Postgres deja pasar a una sola.
 * Resiliente pre-migración: sin la tabla, avisos claros en vez de errores.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole, type SessionRole } from "@/lib/session-access";
import { getBusinessByCode } from "@/lib/businesses";
import { leerCarta } from "@/lib/carta-sql";
import {
  generarCodigo, normalizarCodigo, validarEmision, valorCarta, estadoEfectivo,
  type EstadoVale,
} from "@/lib/vales";
import { buscarVale, aValeFila, faltaTablaVales, hoyLima, type ValeFila } from "@/lib/vales-sql";

const sql = neon(process.env.DATABASE_URL!);

const SIN_TABLA = "Falta la migración de vales — avísale a Jahnn.";

export type ValeVista = Omit<ValeFila, "estado"> & { estado: EstadoVale };

function aVista(v: ValeFila, hoy: string): ValeVista {
  return { ...v, estado: estadoEfectivo(v, hoy) };
}

/** Solo Jahnn emite y anula. Kelly y la gerencia de finanzas, no. */
function esJahnn(role: SessionRole): boolean {
  return role?.kind === "full" && role.quien === "jahnn" && !role.finanzas;
}

function firma(role: NonNullable<SessionRole>): string {
  if (role.kind === "full") {
    if (role.finanzas) return role.nombre ?? "Finanzas";
    return role.quien === "jahnn" ? "Jahnn" : "Kelly";
  }
  const base = role.kind === "admin" ? "Administrador" : "Encargado";
  return "nombre" in role && role.nombre ? role.nombre : base;
}

/** ¿Puede esta sesión canjear vales de esta sede? Lista blanca explícita. */
function puedeCanjear(role: SessionRole, businessId: number): role is NonNullable<SessionRole> {
  if (role?.kind === "full") return true;
  return (role?.kind === "admin" || role?.kind === "verif") && role.sede === businessId;
}

export type ProductoVale = { ref: string; nombre: string; seccion: string; precio: number };

/** Los productos de la carta que se pueden regalar (todos los que tienen precio). Solo Jahnn. */
export async function listarProductosVale(): Promise<
  { ok: true; productos: ProductoVale[] } | { ok: false; error: string }
> {
  if (!esJahnn(await getSessionRole())) return { ok: false, error: "Solo Jahnn emite vales." };
  try {
    const carta = await leerCarta(sql);
    const productos = carta
      .filter((c) => c.precio !== null && c.precio > 0)
      .map((c) => ({
        ref: c.ref,
        nombre: (c.nombreCarta ?? c.nombre).trim(),
        seccion: c.seccion ?? c.categoria ?? "Otros",
        precio: c.precio as number,
      }))
      .sort((a, b) => a.seccion.localeCompare(b.seccion, "es") || a.nombre.localeCompare(b.nombre, "es"));
    return { ok: true, productos };
  } catch {
    return { ok: false, error: "No pude leer la carta. Reintenta en un momento." };
  }
}

/** Emite un vale. Precios y nombres salen de la carta del servidor, nunca de lo que mande el navegador. */
export async function emitirVale(input: {
  sede: string;
  items: { ref: string; cantidad: number }[];
  para?: string | null;
  venceEl: string;
}): Promise<{ ok: true; vale: ValeVista } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!esJahnn(role)) return { ok: false, error: "Solo Jahnn emite vales." };
  if (input.sede !== "fonavi" && input.sede !== "centro") {
    return { ok: false, error: "Los vales se canjean en Fonavi o Centro." };
  }
  const negocio = await getBusinessByCode(input.sede);
  if (!negocio) return { ok: false, error: "No encuentro esa sede." };

  let carta;
  try {
    carta = await leerCarta(sql);
  } catch {
    return { ok: false, error: "No pude leer la carta. Reintenta en un momento." };
  }
  const porRef = new Map(carta.map((c) => [c.ref, c]));
  const items: { ref: string; nombre: string; cantidad: number; precio: number }[] = [];
  for (const i of input.items ?? []) {
    const c = porRef.get(i.ref);
    if (!c || c.precio === null) return { ok: false, error: "Un producto ya no está en la carta. Vuelve a elegirlo." };
    items.push({ ref: c.ref, nombre: (c.nombreCarta ?? c.nombre).trim(), cantidad: i.cantidad, precio: c.precio });
  }

  const hoy = hoyLima();
  const v = validarEmision({ items, para: input.para, venceEl: input.venceEl, hoy });
  if (!v.ok) return v;

  const valor = valorCarta(v.items);
  // Un código repetido es casi imposible (1 en un billón), pero se reintenta por si acaso.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo();
    try {
      const rows = (await sql`
        INSERT INTO vales_consumo (codigo, business_id, items, valor_carta, para, vence_el, emitido_por)
        VALUES (${codigo}, ${negocio.id}, ${JSON.stringify(v.items)}::jsonb, ${valor}, ${v.para}, ${input.venceEl}::date, ${firma(role!)})
        ON CONFLICT (codigo) DO NOTHING
        RETURNING id::text
      `) as { id: string }[];
      if (rows.length === 0) continue; // choque de código: otro intento
      const vale = await buscarVale(codigo);
      if (!vale || vale === "sin-tabla") return { ok: false, error: SIN_TABLA };
      return { ok: true, vale: aVista(vale, hoy) };
    } catch (e) {
      if (faltaTablaVales(e)) return { ok: false, error: SIN_TABLA };
      return { ok: false, error: "No pude guardar el vale. Reintenta." };
    }
  }
  return { ok: false, error: "No pude generar un código único. Reintenta." };
}

/** Los vales de una sede, el último primero. Dirección. */
export async function listarVales(
  sede: string,
): Promise<{ ok: true; vales: ValeVista[]; puedeEmitir: boolean } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Sin acceso." };
  const negocio = await getBusinessByCode(sede);
  if (!negocio) return { ok: false, error: "No encuentro esa sede." };
  try {
    const rows = (await sql`
      SELECT v.id::text, v.codigo, v.business_id, b.name AS sede, v.items,
             v.valor_carta::float AS valor_carta, v.para, v.vence_el::text AS vence_el, v.estado,
             v.emitido_por, to_char(v.emitido_en AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI') AS emitido_en, v.canjeado_por,
             to_char(v.canjeado_en AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI') AS canjeado_en, v.anulado_motivo
      FROM vales_consumo v
      JOIN businesses b ON b.id = v.business_id
      WHERE v.business_id = ${negocio.id}
      ORDER BY v.emitido_en DESC
      LIMIT 100
    `) as Parameters<typeof aValeFila>[0][];
    const hoy = hoyLima();
    return { ok: true, vales: rows.map((r) => aVista(aValeFila(r), hoy)), puedeEmitir: esJahnn(role) };
  } catch (e) {
    if (faltaTablaVales(e)) return { ok: false, error: SIN_TABLA };
    return { ok: false, error: "No pude leer los vales." };
  }
}

/** Anula un vale que todavía no se canjeó (se perdió, se emitió por error). Solo Jahnn. */
export async function anularVale(input: { id: string; motivo?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!esJahnn(role)) return { ok: false, error: "Solo Jahnn anula vales." };
  const motivo = (input.motivo ?? "").trim().slice(0, 200) || null;
  try {
    const rows = (await sql`
      UPDATE vales_consumo
      SET estado = 'anulado', anulado_en = now(), anulado_por = ${firma(role!)}, anulado_motivo = ${motivo}
      WHERE id = ${input.id}::uuid AND estado = 'emitido'
      RETURNING id::text
    `) as { id: string }[];
    if (rows.length === 0) return { ok: false, error: "Ese vale ya no se puede anular (ya se canjeó o se anuló)." };
    return { ok: true };
  } catch (e) {
    if (faltaTablaVales(e)) return { ok: false, error: SIN_TABLA };
    return { ok: false, error: "No pude anular el vale." };
  }
}

/** Mira un vale por su código SIN canjearlo: lo que ve el encargado antes de confirmar. */
export async function consultarVale(
  entrada: string,
): Promise<{ ok: true; vale: ValeVista } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!role) return { ok: false, error: "Sin acceso." };
  const codigo = normalizarCodigo(entrada);
  if (!codigo) return { ok: false, error: "Ese no parece un código de vale (8 letras y números, ej. 7K3Q-M2PA)." };
  try {
    const vale = await buscarVale(codigo);
    if (vale === "sin-tabla") return { ok: false, error: SIN_TABLA };
    // Mismo mensaje si no existe o es de otra sede: no se confirma qué códigos existen.
    if (!vale || !puedeCanjear(role, vale.businessId)) return { ok: false, error: "No encuentro ese vale en esta sede." };
    return { ok: true, vale: aVista(vale, hoyLima()) };
  } catch {
    return { ok: false, error: "No pude consultar el vale. Reintenta." };
  }
}

/** Canjea el vale: lo marca usado, para siempre. Devuelve qué cobrar como cortesía. */
export async function canjearVale(
  entrada: string,
): Promise<{ ok: true; vale: ValeVista } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!role) return { ok: false, error: "Sin acceso." };
  const codigo = normalizarCodigo(entrada);
  if (!codigo) return { ok: false, error: "Ese no parece un código de vale." };

  try {
    const previo = await buscarVale(codigo);
    if (previo === "sin-tabla") return { ok: false, error: SIN_TABLA };
    if (!previo || !puedeCanjear(role, previo.businessId)) {
      return { ok: false, error: "No encuentro ese vale en esta sede." };
    }

    // El candado real: solo pasa si SIGUE emitido y vigente en este instante.
    const rows = (await sql`
      UPDATE vales_consumo
      SET estado = 'canjeado', canjeado_en = now(), canjeado_por = ${firma(role)}
      WHERE codigo = ${codigo}
        AND business_id = ${previo.businessId}
        AND estado = 'emitido'
        AND vence_el >= (now() AT TIME ZONE 'America/Lima')::date
      RETURNING id::text
    `) as { id: string }[];

    const hoy = hoyLima();
    const despues = await buscarVale(codigo);
    if (!despues || despues === "sin-tabla") return { ok: false, error: "No pude confirmar el canje. Revisa el vale." };
    if (rows.length === 1) return { ok: true, vale: aVista(despues, hoy) };

    // No pasó: explicar por qué, con la hora si ya lo usaron.
    const e = estadoEfectivo(despues, hoy);
    if (e === "canjeado") {
      const cuando = despues.canjeadoEn ?? "";
      return { ok: false, error: `Este vale YA FUE CANJEADO${cuando ? ` el ${cuando}` : ""}${despues.canjeadoPor ? ` por ${despues.canjeadoPor}` : ""}. No se puede usar otra vez.` };
    }
    if (e === "vencido") return { ok: false, error: `Este vale VENCIÓ el ${despues.venceEl.split("-").reverse().join("/")}.` };
    if (e === "anulado") return { ok: false, error: "Este vale fue ANULADO por dirección." };
    return { ok: false, error: "No pude canjear el vale. Reintenta." };
  } catch {
    return { ok: false, error: "No pude canjear el vale. Reintenta." };
  }
}
