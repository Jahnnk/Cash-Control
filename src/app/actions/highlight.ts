"use server";

/**
 * Highlight diario — "Make Time" (ver src/lib/highlight.ts).
 *
 * Dos lados bien separados:
 *
 *   · ASIGNAR el Highlight es exclusivo de dirección (sesión completa).
 *     Un administrador NO puede escribirse su propia tarea: si pudiera,
 *     dejaría de ser un encargo y el control no valdría nada.
 *   · CERRARLO y escribir el Reflect lo hace quien esté en el panel de
 *     esa sede — normalmente el administrador. Dirección también puede
 *     (a veces Jahnn opera Atelier él mismo), pero cada quien solo
 *     toca SU sede: un admin de Fonavi no puede cerrar el de Centro.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import {
  validarTexto,
  calcularRacha,
  calcularCumplimiento,
  MAX_POR_QUE,
  MAX_REFLECT,
  type EstadoHighlight,
  type Cumplimiento,
} from "@/lib/highlight";

const sql = neon(process.env.DATABASE_URL!);

const SEDES = [
  { id: 1, nombre: "Atelier" },
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
] as const;

const esFecha = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

function faltaMigracion(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .*highlights.* does not exist/i.test(msg);
}

const recorta = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? "").trim();
  return t ? t.slice(0, max) : null;
};

// ─────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────

export type Highlight = {
  id: string;
  businessId: number;
  fecha: string;
  texto: string;
  porQue: string | null;
  asignadoPor: string | null;
  estado: EstadoHighlight;
  reflectAyudo: string | null;
  reflectDistrajo: string | null;
  reflectManana: string | null;
  tieneReflect: boolean;
};

export type HighlightSede = {
  faltaMigracion?: boolean;
  /** El de hoy, que es el que el admin tiene que cumplir. */
  hoy: Highlight | null;
  fecha: string;
  /** Días cerrados hacia atrás, para la racha y el historial corto. */
  racha: number;
  cumplimiento: Cumplimiento;
  historial: { fecha: string; texto: string; estado: EstadoHighlight }[];
};

export type HighlightGrupoSede = {
  businessId: number;
  sede: string;
  highlight: Highlight | null;
  racha: number;
  cumplimiento: Cumplimiento;
};

export type HighlightGrupo = {
  faltaMigracion?: boolean;
  fecha: string;
  sedes: HighlightGrupoSede[];
  /** Cuántas sedes aún no tienen Highlight para esa fecha. */
  sinAsignar: number;
};

type FilaDB = {
  id: string; business_id: number; fecha: string; texto: string;
  por_que: string | null; asignado_por: string | null; estado: string;
  reflect_ayudo: string | null; reflect_distrajo: string | null;
  reflect_manana: string | null;
};

function aHighlight(f: FilaDB): Highlight {
  return {
    id: f.id,
    businessId: f.business_id,
    fecha: f.fecha,
    texto: f.texto,
    porQue: f.por_que,
    asignadoPor: f.asignado_por,
    estado: f.estado as EstadoHighlight,
    reflectAyudo: f.reflect_ayudo,
    reflectDistrajo: f.reflect_distrajo,
    reflectManana: f.reflect_manana,
    tieneReflect: Boolean(
      f.reflect_ayudo?.trim() || f.reflect_distrajo?.trim() || f.reflect_manana?.trim(),
    ),
  };
}

// ─────────────────────────────────────────────────────────────────
// Lado del administrador
// ─────────────────────────────────────────────────────────────────

/** El Highlight de MI sede para hoy, con la racha y el historial corto. */
export async function getHighlightSede(): Promise<HighlightSede> {
  const hoy = getToday();
  const vacio: HighlightSede = {
    hoy: null, fecha: hoy, racha: 0,
    cumplimiento: { cerrados: 0, logrados: 0, pendientes: 0, pct: null },
    historial: [],
  };

  const role = await getSessionRole();
  if (!role) return vacio;

  // Jahnn entrando a /atelier/panel ve el de Atelier: la sede sale de
  // la ruta, no del rol.
  const bId = await activeBusinessId();
  if (role.kind !== "full" && role.sede !== bId) return vacio;

  try {
    const filas = (await sql`
      SELECT id, business_id, fecha::text AS fecha, texto, por_que, asignado_por, estado,
             reflect_ayudo, reflect_distrajo, reflect_manana
      FROM highlights
      WHERE business_id = ${bId} AND fecha <= ${hoy}
      ORDER BY fecha DESC
      LIMIT 30
    `) as FilaDB[];

    const dias = filas.map((f) => ({ fecha: f.fecha, estado: f.estado as EstadoHighlight }));
    // La racha se mide sobre días YA cerrados: si el de hoy sigue
    // pendiente, no debe aparecer como si hubiera cortado la racha.
    const cerrados = dias.filter((d) => d.estado !== "pendiente");

    return {
      hoy: filas[0]?.fecha === hoy ? aHighlight(filas[0]) : null,
      fecha: hoy,
      racha: calcularRacha(cerrados),
      cumplimiento: calcularCumplimiento(dias),
      historial: filas
        .filter((f) => f.fecha !== hoy)
        .slice(0, 7)
        .map((f) => ({ fecha: f.fecha, texto: f.texto, estado: f.estado as EstadoHighlight })),
    };
  } catch (e) {
    console.error("[getHighlightSede] failed:", e);
    if (faltaMigracion(e)) return { ...vacio, faltaMigracion: true };
    return vacio;
  }
}

/**
 * El admin cierra su Highlight y (opcionalmente) escribe el Reflect.
 *
 * Se permite volver a guardar: si marcó "logrado" por error, o quiere
 * completar el Reflect más tarde, no tiene que pedirle nada a nadie.
 */
export async function cerrarHighlight(input: {
  id: string;
  estado: Exclude<EstadoHighlight, "pendiente">;
  ayudo?: string | null;
  distrajo?: string | null;
  manana?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!role) return { ok: false, error: "Sin acceso." };
  const bId = await activeBusinessId();
  if (role.kind === "verif") return { ok: false, error: "Sin acceso." };
  if (role.kind === "admin" && role.sede !== bId) return { ok: false, error: "Sin acceso." };
  if (input.estado !== "logrado" && input.estado !== "no_logrado") {
    return { ok: false, error: "Estado inválido." };
  }

  try {
    const filas = (await sql`
      UPDATE highlights
      SET estado = ${input.estado},
          cerrado_en = now(),
          reflect_ayudo    = ${recorta(input.ayudo, MAX_REFLECT)},
          reflect_distrajo = ${recorta(input.distrajo, MAX_REFLECT)},
          reflect_manana   = ${recorta(input.manana, MAX_REFLECT)},
          reflect_en = CASE
            WHEN ${recorta(input.ayudo, MAX_REFLECT)} IS NOT NULL
              OR ${recorta(input.distrajo, MAX_REFLECT)} IS NOT NULL
              OR ${recorta(input.manana, MAX_REFLECT)} IS NOT NULL
            THEN now() ELSE NULL END,
          actualizado_en = now()
      WHERE id = ${input.id} AND business_id = ${bId}
      RETURNING id
    `) as { id: string }[];

    if (filas.length === 0) return { ok: false, error: "No encontré ese Highlight." };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[cerrarHighlight] failed:", e);
    return { ok: false, error: "No pude guardar. Intenta de nuevo." };
  }
}

// ─────────────────────────────────────────────────────────────────
// Lado de Jahnn (dirección)
// ─────────────────────────────────────────────────────────────────

/** Las 3 sedes para una fecha: qué asignó, cómo va, y qué falta asignar. */
export async function getHighlightGrupo(fecha?: string): Promise<HighlightGrupo> {
  const dia = fecha && esFecha(fecha) ? fecha : getToday();
  const vacio: HighlightGrupo = {
    fecha: dia,
    sedes: SEDES.map((s) => ({
      businessId: s.id, sede: s.nombre, highlight: null, racha: 0,
      cumplimiento: { cerrados: 0, logrados: 0, pendientes: 0, pct: null },
    })),
    sinAsignar: SEDES.length,
  };

  const role = await getSessionRole();
  if (role?.kind !== "full") return vacio;

  try {
    const delDia = (await sql`
      SELECT id, business_id, fecha::text AS fecha, texto, por_que, asignado_por, estado,
             reflect_ayudo, reflect_distrajo, reflect_manana
      FROM highlights WHERE fecha = ${dia}
    `) as FilaDB[];

    // Historial de los últimos 30 días para racha y cumplimiento.
    const hist = (await sql`
      SELECT business_id, fecha::text AS fecha, estado
      FROM highlights
      WHERE fecha <= ${dia} AND fecha >= ${dia}::date - 30
      ORDER BY fecha DESC
    `) as { business_id: number; fecha: string; estado: string }[];

    const sedes: HighlightGrupoSede[] = SEDES.map((s) => {
      const fila = delDia.find((f) => f.business_id === s.id);
      const dias = hist
        .filter((h) => h.business_id === s.id)
        .map((h) => ({ fecha: h.fecha, estado: h.estado as EstadoHighlight }));
      return {
        businessId: s.id,
        sede: s.nombre,
        highlight: fila ? aHighlight(fila) : null,
        racha: calcularRacha(dias.filter((d) => d.estado !== "pendiente")),
        cumplimiento: calcularCumplimiento(dias),
      };
    });

    return { fecha: dia, sedes, sinAsignar: sedes.filter((s) => !s.highlight).length };
  } catch (e) {
    console.error("[getHighlightGrupo] failed:", e);
    if (faltaMigracion(e)) return { ...vacio, faltaMigracion: true };
    return vacio;
  }
}

/**
 * Jahnn asigna (o corrige) el Highlight de una sede para una fecha.
 *
 * Reasignar el mismo día SOBRESCRIBE el texto pero NO toca el estado ni
 * el Reflect: si el admin ya lo cerró y Jahnn corrige una palabra, sería
 * absurdo borrarle su reflexión.
 */
export async function asignarHighlight(input: {
  businessId: number;
  fecha: string;
  texto: string;
  porQue?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionRole().then((r) => r?.kind === "full"))) {
    return { ok: false, error: "Solo dirección puede asignar el Highlight." };
  }
  if (!SEDES.some((s) => s.id === input.businessId)) {
    return { ok: false, error: "Sede inválida." };
  }
  if (!esFecha(input.fecha)) return { ok: false, error: "Fecha inválida." };

  const v = validarTexto(input.texto);
  if (!v.ok) return { ok: false, error: v.error };

  try {
    await sql`
      INSERT INTO highlights (business_id, fecha, texto, por_que, asignado_por)
      VALUES (${input.businessId}, ${input.fecha}, ${v.texto},
              ${recorta(input.porQue, MAX_POR_QUE)}, 'Dirección')
      ON CONFLICT (business_id, fecha) DO UPDATE SET
        texto = EXCLUDED.texto,
        por_que = EXCLUDED.por_que,
        actualizado_en = now()
    `;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[asignarHighlight] failed:", e);
    if (faltaMigracion(e)) {
      return { ok: false, error: "Falta correr la migración de la base de datos." };
    }
    return { ok: false, error: "No pude guardar el Highlight." };
  }
}

/** Quitar un Highlight asignado por error (solo si aún nadie lo cerró). */
export async function borrarHighlight(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getSessionRole().then((r) => r?.kind === "full"))) {
    return { ok: false, error: "Solo dirección puede quitar el Highlight." };
  }
  try {
    const filas = (await sql`
      DELETE FROM highlights
      WHERE id = ${id} AND estado = 'pendiente'
      RETURNING id
    `) as { id: string }[];
    if (filas.length === 0) {
      return {
        ok: false,
        error: "No se puede quitar: el administrador ya lo cerró. Corrige el texto si hace falta.",
      };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[borrarHighlight] failed:", e);
    return { ok: false, error: "No pude quitar el Highlight." };
  }
}
