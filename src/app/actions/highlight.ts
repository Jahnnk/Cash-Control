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
import { deletePrivateBlob } from "@/lib/blob-storage";
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

/**
 * Quién puede ASIGNAR, y con qué nombre queda firmado.
 *
 * Desde ago-2026 el Highlight lo reparten varias personas (Jahnn y
 * Juani, que supervisa los locales una o dos veces por semana). El
 * administrador tiene que saber DE QUIÉN viene el encargo, así que el
 * nombre no se teclea: sale de la llave con la que entró cada uno.
 */
async function quienAsigna(): Promise<string | null> {
  const role = await getSessionRole();
  if (role?.kind === "full") return role.quien === "kelly" ? "Kelly" : "Jahnn";
  if (role?.kind === "highlight") return role.nombre;
  return null;
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
  /** La pantalla la ve dirección (no el administrador de la sede). */
  esDireccion: boolean;
  /** El de hoy, que es el que el admin tiene que cumplir. */
  hoy: Highlight | null;
  /**
   * Highlights de los últimos 7 días (sin contar hoy), cerrados o no.
   *
   * Se entregan COMPLETOS —no un resumen— por dos razones que costaron
   * un reporte cada una:
   *   · Los pendientes se pueden cerrar tarde. Antes el panel solo
   *     mostraba el del día y quedaban atrapados para siempre.
   *   · A los YA CERRADOS todavía se les puede adjuntar la foto de
   *     evidencia. Luis cerró el suyo y recién ahí quiso subir la foto:
   *     al cerrarse desaparecía de su vista y se quedaba sin poder.
   */
  diasAnteriores: Highlight[];
  fecha: string;
  /** Días cerrados hacia atrás, para la racha y el historial corto. */
  racha: number;
  cumplimiento: Cumplimiento;
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
    esDireccion: false,
    hoy: null, diasAnteriores: [], fecha: hoy, racha: 0,
    cumplimiento: { cerrados: 0, logrados: 0, pendientes: 0, pct: null },
  };

  const role = await getSessionRole();
  if (!role) return vacio;

  // activeBusinessId() lanza si no hay negocio activo (headers/cookie
  // ausentes) — no debería pasar en /[negocio]/panel, pero si pasa no
  // tiene que tumbar la pantalla: se degrada a "sin acceso" como
  // cualquier otro caso sin permiso.
  let bId: number;
  try {
    bId = await activeBusinessId();
  } catch (e) {
    console.error("[getHighlightSede] activeBusinessId:", e);
    return vacio;
  }

  // Jahnn entrando a /atelier/panel ve el de Atelier: la sede sale de
  // la ruta, no del rol. Lista blanca: dirección completa, o el
  // administrador de ESA sede. El rol de Highlight trabaja desde Grupo
  // y no entra a los paneles de sede.
  const puedeVer =
    role.kind === "full" || (role.kind === "admin" && role.sede === bId);
  if (!puedeVer) return vacio;

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
      esDireccion: role.kind === "full",
      hoy: filas[0]?.fecha === hoy ? aHighlight(filas[0]) : null,
      // Últimos 7 días sin contar hoy, cerrados o no: los pendientes
      // para poder cerrarlos, y los cerrados para poder adjuntarles la
      // foto de evidencia después. Dirección siempre ve la fecha real
      // del Highlight y la hora real del cierre, así que un cierre o
      // una foto tardía se notan.
      diasAnteriores: filas
        .filter((f) => f.fecha !== hoy)
        .slice(0, 7)
        .map(aHighlight),
      fecha: hoy,
      racha: calcularRacha(cerrados),
      cumplimiento: calcularCumplimiento(dias),
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
  let bId: number;
  try {
    bId = await activeBusinessId();
  } catch (e) {
    console.error("[cerrarHighlight] activeBusinessId:", e);
    return { ok: false, error: "No pude confirmar la sede activa. Recarga la página." };
  }
  // Lista blanca: cerrar el Highlight es de quien HIZO el trabajo (el
  // administrador de esa sede) o de dirección completa. Quien solo
  // asigna no puede darse por cumplido a sí mismo.
  const puedeCerrar =
    role.kind === "full" || (role.kind === "admin" && role.sede === bId);
  if (!puedeCerrar) return { ok: false, error: "Sin acceso." };
  if (input.estado !== "logrado" && input.estado !== "no_logrado") {
    return { ok: false, error: "Estado inválido." };
  }

  // Las tres respuestas del Reflect se limpian UNA vez y se decide acá
  // si hubo reflexión. Antes esto se resolvía con un
  // `CASE WHEN ${param} IS NOT NULL` dentro del SQL, y Postgres no podía
  // inferir el tipo de ese parámetro (solo aparecía en un IS NOT NULL):
  // fallaba con "could not determine data type of parameter $5" y el
  // administrador veía "No pude guardar" al cerrar su Highlight.
  // Regla: nunca usar un parámetro SOLO dentro de un IS NULL / IS NOT NULL.
  const ayudo = recorta(input.ayudo, MAX_REFLECT);
  const distrajo = recorta(input.distrajo, MAX_REFLECT);
  const manana = recorta(input.manana, MAX_REFLECT);
  const hayReflect = ayudo !== null || distrajo !== null || manana !== null;

  try {
    const filas = (await sql`
      UPDATE highlights
      SET estado = ${input.estado},
          cerrado_en = now(),
          reflect_ayudo    = ${ayudo},
          reflect_distrajo = ${distrajo},
          reflect_manana   = ${manana},
          reflect_en = ${hayReflect ? new Date().toISOString() : null}::timestamptz,
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
  if (role?.kind !== "full" && role?.kind !== "highlight") return vacio;

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
  /** Confirmación explícita para pisar el Highlight de otra persona. */
  reemplazarDe?: string | null;
}): Promise<
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; confirmar: true; asignadoPor: string; textoActual: string }
> {
  const firma = await quienAsigna();
  if (!firma) {
    return { ok: false, error: "Solo dirección puede asignar el Highlight." };
  }
  if (!SEDES.some((s) => s.id === input.businessId)) {
    return { ok: false, error: "Sede inválida." };
  }
  if (!esFecha(input.fecha)) return { ok: false, error: "Fecha inválida." };

  const v = validarTexto(input.texto);
  if (!v.ok) return { ok: false, error: v.error };

  try {
    // Solo hay UN Highlight por sede y día (lo garantiza el UNIQUE). Con
    // varias personas asignando, pisar el de otro en silencio sería el
    // peor error posible: el administrador vería una tarea distinta a la
    // que su jefe cree haberle dejado. Se avisa y se pide confirmación.
    const previo = (await sql`
      SELECT texto, COALESCE(asignado_por, 'otra persona') AS asignado_por
      FROM highlights
      WHERE business_id = ${input.businessId} AND fecha = ${input.fecha}
    `) as { texto: string; asignado_por: string }[];

    if (previo[0] && previo[0].asignado_por !== firma && !input.reemplazarDe) {
      return {
        ok: false,
        confirmar: true,
        asignadoPor: previo[0].asignado_por,
        textoActual: previo[0].texto,
      };
    }

    await sql`
      INSERT INTO highlights (business_id, fecha, texto, por_que, asignado_por)
      VALUES (${input.businessId}, ${input.fecha}, ${v.texto},
              ${recorta(input.porQue, MAX_POR_QUE)}, ${firma})
      ON CONFLICT (business_id, fecha) DO UPDATE SET
        texto = EXCLUDED.texto,
        por_que = EXCLUDED.por_que,
        asignado_por = EXCLUDED.asignado_por,
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
  if (!(await quienAsigna())) {
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

    // Las fotos NO tienen llave foránea contra `highlights` (viven en la
    // tabla compartida `attachments`), así que si no se limpian acá
    // quedan filas apuntando a un Highlight inexistente y archivos
    // pagándose en el Blob para siempre. Primero el archivo y después la
    // fila, igual que en deleteAttachment: un blob suelto es invisible,
    // una fila sin archivo rompe la pantalla.
    const fotos = (await sql`
      SELECT id::text, url AS pathname FROM attachments
      WHERE record_id = ${id}
        AND record_type IN ('highlight_indicacion', 'highlight_evidencia')
    `) as { id: string; pathname: string }[];
    for (const f of fotos) {
      try {
        await deletePrivateBlob(f.pathname);
      } catch (e) {
        // Se sigue: dejar la fila viva sería peor que dejar el archivo.
        console.error("[borrarHighlight] blob huérfano:", f.pathname, e);
      }
    }
    if (fotos.length > 0) {
      await sql`
        DELETE FROM attachments
        WHERE record_id = ${id}
          AND record_type IN ('highlight_indicacion', 'highlight_evidencia')
      `;
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[borrarHighlight] failed:", e);
    return { ok: false, error: "No pude quitar el Highlight." };
  }
}

// ─────────────────────────────────────────────────────────────────
// Planificador: varios días de un tirón
// ─────────────────────────────────────────────────────────────────

export type CeldaPlan = {
  /** Solo existe si el Highlight ya se guardó. Las fotos se cuelgan de
   *  este id, así que hasta que no se programa no se pueden adjuntar. */
  id: string;
  fecha: string;
  businessId: number;
  texto: string | null;
  porQue: string | null;
  asignadoPor: string | null;
  estado: EstadoHighlight | null;
};

export type PlanSemana = {
  faltaMigracion?: boolean;
  hoy: string;
  dias: string[];
  sedes: { businessId: number; sede: string }[];
  celdas: CeldaPlan[];
};

/**
 * Los próximos N días × las 3 sedes, para programar por adelantado.
 *
 * Nace de cómo trabaja Jahnn de verdad: el domingo ya sabe qué tienen
 * que hacer el lunes, el martes y el miércoles. Ir fecha por fecha hacía
 * que en la práctica no se programara nada.
 *
 * El administrador NO ve los días futuros (getHighlightSede filtra por
 * fecha <= hoy): lo programado le llega recién el día que toca.
 */
export async function getPlanSemana(desde?: string, dias = 7): Promise<PlanSemana> {
  const hoy = getToday();
  const inicio = desde && esFecha(desde) ? desde : hoy;
  const n = Math.min(Math.max(dias, 1), 14);

  const fechas: string[] = [];
  const [y, m, d] = inicio.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const f = new Date(Date.UTC(y, m - 1, d + i));
    fechas.push(
      `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}-${String(
        f.getUTCDate(),
      ).padStart(2, "0")}`,
    );
  }

  const vacio: PlanSemana = {
    hoy,
    dias: fechas,
    sedes: SEDES.map((s) => ({ businessId: s.id, sede: s.nombre })),
    celdas: [],
  };

  const role = await getSessionRole();
  if (role?.kind !== "full" && role?.kind !== "highlight") return vacio;

  try {
    const filas = (await sql`
      SELECT id, business_id, fecha::text AS fecha, texto, por_que, asignado_por, estado
      FROM highlights
      WHERE fecha >= ${fechas[0]} AND fecha <= ${fechas[fechas.length - 1]}
    `) as { id: string; business_id: number; fecha: string; texto: string; por_que: string | null; asignado_por: string | null; estado: string }[];

    return {
      ...vacio,
      celdas: filas.map((f) => ({
        id: f.id,
        fecha: f.fecha,
        businessId: f.business_id,
        texto: f.texto,
        porQue: f.por_que,
        asignadoPor: f.asignado_por,
        estado: f.estado as EstadoHighlight,
      })),
    };
  } catch (e) {
    console.error("[getPlanSemana] failed:", e);
    if (faltaMigracion(e)) return { ...vacio, faltaMigracion: true };
    return vacio;
  }
}

// ─────────────────────────────────────────────────────────────────
// Control de cumplimiento — pedido de Jahnn, 12-ago-2026
// ─────────────────────────────────────────────────────────────────

export type CierreReciente = {
  id: string;
  businessId: number;
  sede: string;
  fecha: string;
  texto: string;
  estado: EstadoHighlight;
  /** ISO del momento en que el administrador lo cerró. */
  cerradoEn: string | null;
  tieneReflect: boolean;
};

export type SinCerrar = {
  id: string;
  businessId: number;
  sede: string;
  fecha: string;
  texto: string;
  /** Días que lleva sin respuesta. */
  diasEnSilencio: number;
};

export type EstadoHoySede = {
  businessId: number;
  sede: string;
  /** null = no se le asignó nada hoy. */
  estado: EstadoHighlight | null;
  texto: string | null;
  cerradoEn: string | null;
};

export type ControlCumplimiento = {
  faltaMigracion?: boolean;
  hoy: string;
  /** Cómo va el día, sede por sede. */
  estadoHoy: EstadoHoySede[];
  /**
   * Highlights de días PASADOS que el administrador nunca cerró. Es la
   * señal más importante: un "no lo logré" es información, pero el
   * silencio no dice nada y es lo que hay que perseguir.
   */
  sinCerrar: SinCerrar[];
  /** Lo último que cerró cada sede, para enterarse de un vistazo. */
  cierresRecientes: CierreReciente[];
  /** Resumen de los últimos 30 días por sede. */
  resumen: {
    businessId: number;
    sede: string;
    logrados: number;
    noLogrados: number;
    sinCerrar: number;
    pct: number | null;
  }[];
};

/**
 * Todo lo que dirección necesita para controlar el cumplimiento.
 *
 * Se separa en tres preguntas distintas a propósito:
 *   1. ¿Cómo va HOY?           → estadoHoy
 *   2. ¿Qué quedó en silencio? → sinCerrar (lo que hay que perseguir)
 *   3. ¿Qué pasó últimamente?  → cierresRecientes + resumen
 */
export async function getControlCumplimiento(): Promise<ControlCumplimiento> {
  const hoy = getToday();
  const vacio: ControlCumplimiento = {
    hoy,
    estadoHoy: SEDES.map((s) => ({
      businessId: s.id, sede: s.nombre, estado: null, texto: null, cerradoEn: null,
    })),
    sinCerrar: [],
    cierresRecientes: [],
    resumen: SEDES.map((s) => ({
      businessId: s.id, sede: s.nombre, logrados: 0, noLogrados: 0, sinCerrar: 0, pct: null,
    })),
  };

  const role = await getSessionRole();
  if (role?.kind !== "full" && role?.kind !== "highlight") return vacio;

  try {
    const filas = (await sql`
      SELECT id, business_id, fecha::text AS fecha, texto, estado,
             cerrado_en::text AS cerrado_en,
             (reflect_ayudo IS NOT NULL OR reflect_distrajo IS NOT NULL
              OR reflect_manana IS NOT NULL) AS tiene_reflect
      FROM highlights
      WHERE fecha <= ${hoy} AND fecha >= ${hoy}::date - 30
      ORDER BY fecha DESC, business_id
    `) as {
      id: string; business_id: number; fecha: string; texto: string;
      estado: string; cerrado_en: string | null; tiene_reflect: boolean;
    }[];

    const nombre = (id: number) => SEDES.find((s) => s.id === id)?.nombre ?? `Sede ${id}`;

    const estadoHoy: EstadoHoySede[] = SEDES.map((s) => {
      const f = filas.find((x) => x.business_id === s.id && x.fecha === hoy);
      return {
        businessId: s.id,
        sede: s.nombre,
        estado: f ? (f.estado as EstadoHighlight) : null,
        texto: f?.texto ?? null,
        cerradoEn: f?.cerrado_en ?? null,
      };
    });

    // Silencio: asignado en un día ya pasado y nunca cerrado.
    const sinCerrar: SinCerrar[] = filas
      .filter((f) => f.fecha < hoy && f.estado === "pendiente")
      .map((f) => ({
        id: f.id,
        businessId: f.business_id,
        sede: nombre(f.business_id),
        fecha: f.fecha,
        texto: f.texto,
        diasEnSilencio: Math.round(
          (Date.UTC(...(hoy.split("-").map(Number) as [number, number, number])) -
            Date.UTC(...(f.fecha.split("-").map(Number) as [number, number, number]))) /
            86_400_000,
        ),
      }))
      .sort((a, b) => b.diasEnSilencio - a.diasEnSilencio);

    const cierresRecientes: CierreReciente[] = filas
      .filter((f) => f.estado !== "pendiente")
      .slice(0, 12)
      .map((f) => ({
        id: f.id,
        businessId: f.business_id,
        sede: nombre(f.business_id),
        fecha: f.fecha,
        texto: f.texto,
        estado: f.estado as EstadoHighlight,
        cerradoEn: f.cerrado_en,
        tieneReflect: f.tiene_reflect,
      }));

    const resumen = SEDES.map((s) => {
      const suyas = filas.filter((f) => f.business_id === s.id);
      const logrados = suyas.filter((f) => f.estado === "logrado").length;
      const noLogrados = suyas.filter((f) => f.estado === "no_logrado").length;
      // El de HOY todavía puede cerrarse: no cuenta como silencio.
      const silencio = suyas.filter((f) => f.estado === "pendiente" && f.fecha < hoy).length;
      const cerrados = logrados + noLogrados;
      return {
        businessId: s.id,
        sede: s.nombre,
        logrados,
        noLogrados,
        sinCerrar: silencio,
        pct: cerrados > 0 ? Math.round((logrados / cerrados) * 1000) / 10 : null,
      };
    });

    return { hoy, estadoHoy, sinCerrar, cierresRecientes, resumen };
  } catch (e) {
    console.error("[getControlCumplimiento] failed:", e);
    if (faltaMigracion(e)) return { ...vacio, faltaMigracion: true };
    return vacio;
  }
}
