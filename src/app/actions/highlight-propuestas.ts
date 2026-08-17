"use server";

/**
 * Propuestas de Highlight — el administrador propone, dirección aprueba.
 *
 * Pedido de Jahnn (17-ago-2026): "quién mejor que ellos que están en la
 * operación diaria para darse cuenta en lo que se debe mejorar… sin
 * embargo, este highlight deberá ser aprobado por mí".
 *
 * Reglas duras que sostienen esto:
 *
 *  1. Una propuesta NO es un Highlight. Vive en otra tabla y solo se
 *     convierte al aprobarla. Así la regla de "un Highlight por sede y
 *     día" no necesita ninguna excepción.
 *  2. Aprueban Jahnn y Juani (decisión de Jahnn). Los administradores
 *     proponen para SU sede y nada más.
 *  3. Pisar un día ya programado NUNCA es silencioso: la acción devuelve
 *     el conflicto y espera una segunda llamada con a dónde correr el
 *     que estaba. Es lo que pidió Jahnn y es lo correcto: mover la
 *     tarea de otro sin avisar es cómo se pierde la confianza.
 *
 * La lógica sin base de datos está en src/lib/highlight-propuestas.ts.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import { MAX_POR_QUE } from "@/lib/highlight";
import {
  validarPropuesta, validarMotivo, siguienteDiaLibre, estadoEfectivo,
  type Propuesta, type EstadoPropuesta,
} from "@/lib/highlight-propuestas";

const sql = neon(process.env.DATABASE_URL!);
// Cliente aparte para transacciones no-interactivas (mismo patrón que
// bank-income.ts): aprobar toca DOS tablas y no puede quedar a medias.
const txSql = neon(process.env.DATABASE_URL!);

const SEDES: Record<number, string> = { 1: "Atelier", 2: "Fonavi", 3: "Centro" };
const esFecha = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

function faltaMigracion(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .*highlight_propuestas.* does not exist/i.test(msg);
}

/** Quién puede APROBAR, y con qué nombre queda firmada la decisión. */
async function quienAprueba(): Promise<string | null> {
  const role = await getSessionRole();
  if (role?.kind === "full") return role.quien === "kelly" ? "Kelly" : "Jahnn";
  // Juani entra con rol de Highlight: asigna en las 3 sedes, así que
  // también responde las propuestas (decisión de Jahnn, 17-ago-2026).
  if (role?.kind === "highlight") return role.nombre;
  return null;
}

/**
 * Qué sede propone, y con qué nombre firma el administrador.
 *
 * El nombre real solo existe si entró con su usuario propio (app_users).
 * Con las contraseñas por sede heredadas no hay forma de saber quién
 * es, y entonces firma la sede — que es verdad, aunque diga menos.
 */
async function quienPropone(): Promise<{ businessId: number; nombre: string } | null> {
  const role = await getSessionRole();
  if (role?.kind !== "admin") return null;
  return {
    businessId: role.sede,
    nombre: role.nombre ?? SEDES[role.sede] ?? "Administrador",
  };
}

type FilaDB = {
  id: string; business_id: number; fecha: string; texto: string;
  por_que: string | null; propuesta_por: string; estado: string;
  resuelta_por: string | null; motivo: string | null; creado_en: string;
};

const aPropuesta = (f: FilaDB): Propuesta => ({
  id: f.id,
  businessId: f.business_id,
  sede: SEDES[f.business_id] ?? `Sede ${f.business_id}`,
  fecha: f.fecha,
  texto: f.texto,
  porQue: f.por_que,
  propuestaPor: f.propuesta_por,
  estado: f.estado as Propuesta["estado"],
  resueltaPor: f.resuelta_por,
  motivo: f.motivo,
  creadoEn: f.creado_en,
});

const recorta = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? "").trim();
  return t ? t.slice(0, max) : null;
};

// ─────────────────────────────────────────────────────────────────
// El administrador propone
// ─────────────────────────────────────────────────────────────────

export async function proponerHighlight(input: {
  fecha: string;
  texto: string;
  porQue?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const quien = await quienPropone();
  if (!quien) {
    return { ok: false, error: "Solo el administrador de la sede puede proponer un Highlight." };
  }

  const hoy = getToday();
  const v = validarPropuesta({ texto: input.texto, porQue: input.porQue, fecha: input.fecha, hoy });
  if (!v.ok) return { ok: false, error: v.error };

  try {
    const filas = (await sql`
      INSERT INTO highlight_propuestas (business_id, fecha, texto, por_que, propuesta_por)
      VALUES (${quien.businessId}, ${input.fecha}, ${v.texto}, ${v.porQue}, ${quien.nombre})
      RETURNING id
    `) as { id: string }[];

    revalidatePath("/", "layout");
    return { ok: true, id: filas[0].id };
  } catch (e) {
    console.error("[proponerHighlight] failed:", e);
    if (faltaMigracion(e)) {
      return { ok: false, error: "Falta correr la migración de la base de datos." };
    }
    // El índice parcial impide dos propuestas pendientes para el mismo día.
    const msg = e instanceof Error ? e.message : String(e);
    if (/highlight_propuestas_una_por_dia|duplicate key/i.test(msg)) {
      return {
        ok: false,
        error: "Ya tienes una propuesta esperando respuesta para ese día. Puedes retirarla y mandar otra.",
      };
    }
    return { ok: false, error: "No pude guardar la propuesta." };
  }
}

/** Retirar la propia propuesta mientras nadie la haya respondido. */
export async function retirarPropuesta(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const quien = await quienPropone();
  if (!quien) return { ok: false, error: "No tienes permiso para retirar esta propuesta." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Propuesta inválida." };

  try {
    // El WHERE lleva la sede: nadie retira la propuesta de otro local.
    const r = (await sql`
      DELETE FROM highlight_propuestas
      WHERE id = ${id} AND business_id = ${quien.businessId} AND estado = 'pendiente'
      RETURNING id
    `) as { id: string }[];

    if (r.length === 0) {
      return { ok: false, error: "Esa propuesta ya fue respondida o no es tuya." };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[retirarPropuesta] failed:", e);
    return { ok: false, error: "No pude retirar la propuesta." };
  }
}

/** Lo que ve el administrador en su panel sobre sus propias propuestas. */
export type PropuestasSede = {
  puedeProponer: boolean;
  hoy: string;
  /** Sus propuestas recientes, la más nueva primero. */
  mias: (Propuesta & { estadoEfectivo: EstadoPropuesta })[];
  faltaMigracion: boolean;
};

export async function getPropuestasSede(): Promise<PropuestasSede> {
  const hoy = getToday();
  const quien = await quienPropone();
  const vacio: PropuestasSede = { puedeProponer: false, hoy, mias: [], faltaMigracion: false };
  if (!quien) return vacio;

  try {
    const filas = (await sql`
      SELECT id, business_id, fecha::text AS fecha, texto, por_que, propuesta_por,
             estado, resuelta_por, motivo, creado_en::text AS creado_en
      FROM highlight_propuestas
      WHERE business_id = ${quien.businessId}
      ORDER BY creado_en DESC
      LIMIT 10
    `) as FilaDB[];

    return {
      puedeProponer: true,
      hoy,
      mias: filas.map((f) => {
        const p = aPropuesta(f);
        return { ...p, estadoEfectivo: estadoEfectivo(p, hoy) };
      }),
      faltaMigracion: false,
    };
  } catch (e) {
    console.error("[getPropuestasSede] failed:", e);
    if (faltaMigracion(e)) return { ...vacio, puedeProponer: true, faltaMigracion: true };
    return vacio;
  }
}

// ─────────────────────────────────────────────────────────────────
// Dirección responde
// ─────────────────────────────────────────────────────────────────

export type PropuestaEnBandeja = Propuesta & {
  estadoEfectivo: EstadoPropuesta;
  /** Qué hay ya programado ese día en esa sede, si hay algo. */
  choqueCon: { id: string; texto: string; asignadoPor: string | null; cerrado: boolean } | null;
};

export type BandejaPropuestas = {
  esDireccion: boolean;
  hoy: string;
  pendientes: PropuestaEnBandeja[];
  /** Las que se pasaron sin respuesta: el espejo del propio tiempo. */
  caducadas: PropuestaEnBandeja[];
  /** Últimas ya respondidas, para tener memoria de lo decidido. */
  resueltas: PropuestaEnBandeja[];
  faltaMigracion: boolean;
};

export async function getBandejaPropuestas(): Promise<BandejaPropuestas> {
  const hoy = getToday();
  const vacio: BandejaPropuestas = {
    esDireccion: false, hoy, pendientes: [], caducadas: [], resueltas: [], faltaMigracion: false,
  };

  const firma = await quienAprueba();
  if (!firma) return vacio;

  try {
    const filas = (await sql`
      SELECT id, business_id, fecha::text AS fecha, texto, por_que, propuesta_por,
             estado, resuelta_por, motivo, creado_en::text AS creado_en
      FROM highlight_propuestas
      ORDER BY fecha ASC, creado_en ASC
      LIMIT 100
    `) as FilaDB[];

    const props = filas.map(aPropuesta);

    // Qué días ya tienen Highlight, para avisar del choque ANTES de que
    // dirección apruebe. Solo hacen falta los de las propuestas vivas.
    const vivas = props.filter((p) => estadoEfectivo(p, hoy) === "pendiente");
    const ocupados = vivas.length
      ? ((await sql`
          SELECT id, business_id, fecha::text AS fecha, texto, asignado_por, estado
          FROM highlights
          WHERE fecha = ANY(${vivas.map((p) => p.fecha)}::date[])
        `) as { id: string; business_id: number; fecha: string; texto: string; asignado_por: string | null; estado: string }[])
      : [];

    const conChoque = (p: Propuesta): PropuestaEnBandeja => {
      const h = ocupados.find((o) => o.business_id === p.businessId && o.fecha === p.fecha);
      return {
        ...p,
        estadoEfectivo: estadoEfectivo(p, hoy),
        choqueCon: h
          ? { id: h.id, texto: h.texto, asignadoPor: h.asignado_por, cerrado: h.estado !== "pendiente" }
          : null,
      };
    };

    const todas = props.map(conChoque);
    return {
      esDireccion: true,
      hoy,
      pendientes: todas.filter((p) => p.estadoEfectivo === "pendiente"),
      caducadas: todas.filter((p) => p.estadoEfectivo === "caducada").slice(-10),
      resueltas: todas
        .filter((p) => p.estadoEfectivo === "aprobada" || p.estadoEfectivo === "rechazada")
        .slice(-10),
      faltaMigracion: false,
    };
  } catch (e) {
    console.error("[getBandejaPropuestas] failed:", e);
    if (faltaMigracion(e)) return { ...vacio, esDireccion: true, faltaMigracion: true };
    return vacio;
  }
}

export type ResultadoAprobar =
  | { ok: true; movido: { texto: string; a: string } | null }
  | { ok: false; error: string }
  | {
      ok: false;
      /** Ese día ya tiene Highlight: dirección decide a dónde correrlo. */
      conflicto: true;
      existente: { texto: string; asignadoPor: string | null };
      sugerido: string | null;
    };

/**
 * Aprobar una propuesta y convertirla en el Highlight de ese día.
 *
 * Si el día ya tiene Highlight, la primera llamada NO hace nada: avisa
 * del choque y sugiere a dónde correr el que estaba. La segunda llamada
 * llega con `moverExistenteA` y recién ahí se toca la base. Es la
 * decisión de Jahnn — él corre el que ya estaba, no el sistema.
 */
export async function aprobarPropuesta(input: {
  id: string;
  /** Aprobar para otro día distinto al propuesto. */
  fecha?: string | null;
  /** A dónde correr el Highlight que ocupaba ese día. */
  moverExistenteA?: string | null;
}): Promise<ResultadoAprobar> {
  const firma = await quienAprueba();
  if (!firma) return { ok: false, error: "Solo dirección puede aprobar propuestas." };
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Propuesta inválida." };

  const hoy = getToday();

  try {
    const filas = (await sql`
      SELECT id, business_id, fecha::text AS fecha, texto, por_que, propuesta_por,
             estado, resuelta_por, motivo, creado_en::text AS creado_en
      FROM highlight_propuestas WHERE id = ${input.id}
    `) as FilaDB[];
    if (filas.length === 0) return { ok: false, error: "Esa propuesta ya no existe." };

    const p = aPropuesta(filas[0]);
    if (p.estado !== "pendiente") {
      return { ok: false, error: "Esa propuesta ya fue respondida." };
    }

    const fecha = input.fecha && esFecha(input.fecha) ? input.fecha : p.fecha;
    if (fecha < hoy) {
      return { ok: false, error: "No se puede aprobar para un día que ya pasó." };
    }

    // ¿Ese día ya tiene Highlight en esa sede?
    const previo = (await sql`
      SELECT id, texto, asignado_por, estado FROM highlights
      WHERE business_id = ${p.businessId} AND fecha = ${fecha}
    `) as { id: string; texto: string; asignado_por: string | null; estado: string }[];

    let mover: { id: string; texto: string; a: string } | null = null;

    if (previo[0]) {
      if (previo[0].estado !== "pendiente") {
        return {
          ok: false,
          error: "Ese día ya tiene un Highlight cerrado. Aprueba la propuesta para otro día.",
        };
      }
      if (!input.moverExistenteA) {
        // Primera llamada: se avisa y no se toca nada.
        const tomados = (await sql`
          SELECT fecha::text AS fecha FROM highlights
          WHERE business_id = ${p.businessId} AND fecha >= ${fecha}
        `) as { fecha: string }[];
        return {
          ok: false,
          conflicto: true,
          existente: { texto: previo[0].texto, asignadoPor: previo[0].asignado_por },
          sugerido: siguienteDiaLibre(fecha, tomados.map((t) => t.fecha)),
        };
      }
      if (!esFecha(input.moverExistenteA) || input.moverExistenteA < hoy) {
        return { ok: false, error: "El día al que mueves el Highlight no es válido." };
      }
      if (input.moverExistenteA === fecha) {
        return { ok: false, error: "Ese es el mismo día: elige otro para el Highlight que estaba." };
      }
      const destinoOcupado = (await sql`
        SELECT 1 FROM highlights
        WHERE business_id = ${p.businessId} AND fecha = ${input.moverExistenteA}
      `) as unknown[];
      if (destinoOcupado.length > 0) {
        return { ok: false, error: "Ese día también tiene Highlight. Elige uno libre." };
      }
      mover = { id: previo[0].id, texto: previo[0].texto, a: input.moverExistenteA };
    }

    // Todo en una transacción: mover el viejo, crear el nuevo y marcar
    // la propuesta. A medias, la sede quedaría sin Highlight o con dos.
    const nuevoId = crypto.randomUUID();
    const queries = [];
    if (mover) {
      queries.push(txSql`
        UPDATE highlights SET fecha = ${mover.a}, actualizado_en = now()
        WHERE id = ${mover.id}
      `);
    }
    queries.push(txSql`
      INSERT INTO highlights (id, business_id, fecha, texto, por_que, asignado_por)
      VALUES (${nuevoId}, ${p.businessId}, ${fecha}, ${p.texto},
              ${recorta(p.porQue, MAX_POR_QUE)}, ${`${p.propuestaPor} · aprobado por ${firma}`})
    `);
    queries.push(txSql`
      UPDATE highlight_propuestas
      SET estado = 'aprobada', resuelta_por = ${firma}, resuelta_en = now(),
          highlight_id = ${nuevoId}, actualizado_en = now()
      WHERE id = ${input.id}
    `);
    await txSql.transaction(queries);

    revalidatePath("/", "layout");
    return { ok: true, movido: mover ? { texto: mover.texto, a: mover.a } : null };
  } catch (e) {
    console.error("[aprobarPropuesta] failed:", e);
    if (faltaMigracion(e)) {
      return { ok: false, error: "Falta correr la migración de la base de datos." };
    }
    return { ok: false, error: "No pude aprobar la propuesta." };
  }
}

/** Rechazar, idealmente con el motivo: sin motivo el admin deja de proponer. */
export async function rechazarPropuesta(input: {
  id: string;
  motivo?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const firma = await quienAprueba();
  if (!firma) return { ok: false, error: "Solo dirección puede responder propuestas." };
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Propuesta inválida." };

  const m = validarMotivo(input.motivo ?? "");
  if (!m.ok) return { ok: false, error: m.error };

  try {
    const r = (await sql`
      UPDATE highlight_propuestas
      SET estado = 'rechazada', resuelta_por = ${firma}, resuelta_en = now(),
          motivo = ${m.motivo}, actualizado_en = now()
      WHERE id = ${input.id} AND estado = 'pendiente'
      RETURNING id
    `) as { id: string }[];

    if (r.length === 0) return { ok: false, error: "Esa propuesta ya fue respondida." };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[rechazarPropuesta] failed:", e);
    return { ok: false, error: "No pude guardar la respuesta." };
  }
}
