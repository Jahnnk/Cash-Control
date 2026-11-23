"use server";

/**
 * Acuerdos y tareas (fase 1, 19-nov-2026). Reglas puras en src/lib/acuerdos.ts.
 *
 * Quién hace qué:
 *   · Dirección (Jahnn, Kelly y el rol «highlight», ej. Juani): ve todo, crea, asigna, confirma o devuelve.
 *   · Equipo (coordinadora de marketing, socias): ve todo, crea y asigna. No confirma cumplidos.
 *   · Administradores de sede: ven y avanzan SOLO lo suyo, desde su Panel de Sede.
 * Ninguno de estos roles ve finanzas: el módulo no lee nada de dinero.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import {
  erroresAcuerdo,
  esArea,
  esPrioridad,
  limpiarApoyos,
  PRIORIDAD_LABEL,
  estaAbierto,
  puede,
  quedaTarde,
  AREA_LABEL,
  ESTADO_LABEL,
  MAX_DETALLE,
  MAX_MOTIVO,
  MAX_QUE,
  type AccionAcuerdo,
  type AcuerdoIndicador,
  type Area,
  type EstadoGuardado,
  type Persona,
  type Prioridad,
  type TipoPersona,
  type Yo,
} from "@/lib/acuerdos";

const sql = neon(process.env.DATABASE_URL!);

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

export type YoSesion = Yo & { nombre: string };

export type Acuerdo = {
  id: number;
  reunionId: number | null;
  reunionTitulo: string | null;
  que: string;
  detalle: string | null;
  area: Area;
  prioridad: Prioridad;
  responsableClave: string;
  responsableNombre: string;
  /** Personas de apoyo (23-nov-2026): ven la tarea y la avanzan; no cuentan en el cumplimiento. */
  apoyoClaves: string[];
  apoyoNombres: string[];
  fechaLimite: string;
  fechaLimiteOriginal: string;
  /** Inicio del plazo elegido (Desde). null = el plazo empieza el día en que se creó. */
  fechaInicio: string | null;
  estado: EstadoGuardado;
  tarde: boolean;
  marcadoCumplidoEl: string | null;
  confirmadoEl: string | null;
  confirmadoPor: string | null;
  creadoPor: string;
  creadoPorClave: string;
  creadoEl: string;
  /** Día de creación en Lima (para marcar lo «Nuevo»). */
  creadoDia: string;
  comentarios: number;
  /** Solo en «mis tareas»: la tarea me llega como apoyo, no como responsable. */
  soyApoyo?: boolean;
};

export type Reunion = {
  id: number;
  fecha: string;
  area: Area;
  titulo: string;
  asistentes: string | null;
  notas: string | null;
  creadoPor: string;
  acuerdos: number;
  abiertos: number;
};

export type Evento = { id: number; cuando: string; quien: string; tipo: string; detalle: string | null };

const SEDE_SCOPE: Record<number, string> = { 1: "admin-atelier", 2: "admin-fonavi", 3: "admin-centro" };
const SEDE_NOMBRE: Record<string, string> = { "admin-atelier": "Atelier", "admin-fonavi": "Fonavi", "admin-centro": "Centro" };

const SIN_ACCESO = { ok: false as const, error: "No tienes acceso a los acuerdos." };

function faltaMigracion(e: unknown): boolean {
  return /relation .*(acuerdos|reuniones|acuerdo_eventos).* does not exist/i.test(e instanceof Error ? e.message : String(e));
}
function errorBD(donde: string, e: unknown): { ok: false; error: string } {
  console.error(`[acuerdos:${donde}]`, e);
  return { ok: false, error: faltaMigracion(e) ? "Falta crear las tablas de acuerdos en la base." : "No pude conectar con la base. Intenta de nuevo." };
}

/**
 * Quién está usando el módulo. `mias` = las claves que cuentan como «mis acuerdos»: con un usuario propio
 * es solo la suya; con la contraseña heredada de la sede (sin nombre) son las de los admins de esa sede.
 */
async function sesion(): Promise<{ yo: YoSesion; mias: string[] } | null> {
  const role = await getSessionRole();
  if (!role) return null;
  if (role.kind === "full") {
    const clave = role.quien;
    return { yo: { clave, nombre: role.quien === "kelly" ? "Kelly" : "Jahnn", tipo: "direccion" }, mias: [clave] };
  }
  if (role.kind === "highlight") return { yo: { clave: `u:${role.userId}`, nombre: role.nombre, tipo: "direccion" }, mias: [`u:${role.userId}`] };
  if (role.kind === "equipo") return { yo: { clave: `u:${role.userId}`, nombre: role.nombre, tipo: "equipo" }, mias: [`u:${role.userId}`] };
  if (role.kind === "admin") {
    if (role.userId) return { yo: { clave: `u:${role.userId}`, nombre: role.nombre ?? "Administración", tipo: "admin" }, mias: [`u:${role.userId}`] };
    try {
      const rows = (await sql`SELECT id FROM app_users WHERE active AND scope = ${SEDE_SCOPE[role.sede] ?? ""}`) as { id: number }[];
      const mias = rows.map((r) => `u:${r.id}`);
      return { yo: { clave: mias[0] ?? `sede:${role.sede}`, nombre: "Administración", tipo: "admin" }, mias };
    } catch {
      return null;
    }
  }
  return null;
}

const veTodo = (yo: Yo) => yo.tipo === "direccion" || yo.tipo === "equipo";

/** Las personas a las que se puede asignar un acuerdo. `todas` incluye a las desactivadas (para nombres viejos). */
async function personas(todas = false): Promise<Persona[]> {
  const rows = (await sql`
    SELECT id, nombre, scope, active FROM app_users
    WHERE scope IN ('admin-atelier','admin-fonavi','admin-centro','highlight','equipo')
    ORDER BY nombre
  `) as { id: number; nombre: string; scope: string; active: boolean }[];
  const lista: Persona[] = [
    { clave: "jahnn", nombre: "Jahnn", tipo: "direccion", detalle: "Dirección" },
    { clave: "kelly", nombre: "Kelly", tipo: "direccion", detalle: "Finanzas" },
  ];
  for (const r of rows) {
    if (!todas && !r.active) continue;
    const tipo: TipoPersona = r.scope === "highlight" ? "direccion" : r.scope === "equipo" ? "equipo" : "admin";
    const detalle = tipo === "admin" ? `Administración · ${SEDE_NOMBRE[r.scope]}` : tipo === "direccion" ? "Dirección" : "Equipo";
    lista.push({ clave: `u:${r.id}`, nombre: r.nombre, tipo, detalle });
  }
  return lista;
}

const COLUMNAS = sql`
  a.id, a.reunion_id AS "reunionId", r.titulo AS "reunionTitulo", a.que, a.detalle, a.area, a.prioridad,
  a.responsable_clave AS "responsableClave", a.responsable_nombre AS "responsableNombre",
  a.apoyo_claves AS "apoyoClaves", a.apoyo_nombres AS "apoyoNombres",
  a.fecha_limite::text AS "fechaLimite", a.fecha_limite_original::text AS "fechaLimiteOriginal", a.fecha_inicio::text AS "fechaInicio",
  -- «Por confirmar» ya no existe (19-nov-2026): lo que quedó guardado así se lee como Hecho.
  CASE WHEN a.estado = 'por_confirmar' THEN 'cumplido' ELSE a.estado END AS estado, a.tarde, a.marcado_cumplido_el::text AS "marcadoCumplidoEl", a.confirmado_el::text AS "confirmadoEl",
  a.confirmado_por AS "confirmadoPor", a.creado_por AS "creadoPor", a.creado_por_clave AS "creadoPorClave",
  a.creado_el::text AS "creadoEl", (a.creado_el AT TIME ZONE 'America/Lima')::date::text AS "creadoDia",
  (SELECT count(*)::int FROM acuerdo_eventos e WHERE e.acuerdo_id = a.id AND e.tipo = 'comentario') AS comentarios
`;

// ─────────────────────────────────────────────────────────────────
// Lecturas

export async function getTableroAcuerdos(): Promise<R<{ hoy: string; yo: YoSesion; personas: Persona[]; acuerdos: Acuerdo[]; reuniones: Reunion[] }>> {
  const s = await sesion();
  if (!s || !veTodo(s.yo)) return SIN_ACCESO;
  try {
    const hoy = getToday();
    // Todo lo abierto, y lo cerrado o anulado de los últimos 90 días.
    const acuerdos = (await sql`
      SELECT ${COLUMNAS} FROM acuerdos a LEFT JOIN reuniones r ON r.id = a.reunion_id
      WHERE a.estado IN ('pendiente','en_proceso') OR a.actualizado_el > now() - interval '90 days'
      ORDER BY a.fecha_limite, a.id
    `) as Acuerdo[];
    const reuniones = (await sql`
      SELECT r.id, r.fecha::text AS fecha, r.area, r.titulo, r.asistentes, r.notas, r.creado_por AS "creadoPor",
             count(a.id) FILTER (WHERE a.estado <> 'anulado')::int AS acuerdos,
             count(a.id) FILTER (WHERE a.estado IN ('pendiente','en_proceso'))::int AS abiertos
      FROM reuniones r LEFT JOIN acuerdos a ON a.reunion_id = r.id
      WHERE r.fecha > (now() - interval '180 days')::date
      GROUP BY r.id ORDER BY r.fecha DESC, r.id DESC
    `) as Reunion[];
    return { ok: true, hoy, yo: s.yo, personas: await personas(), acuerdos, reuniones };
  } catch (e) {
    return errorBD("tablero", e);
  }
}

/**
 * Para el Panel de Sede (y cualquiera): lo que tengo asignado.
 * `comoAdminDe` («Ver como administrador», 19-nov-2026): la dirección pide lo asignado a los administradores
 * activos de esa sede (atelier | fonavi | centro), para ver el panel tal cual lo ven ellos. Para cualquier otra
 * sesión se ignora: cada quien solo ve lo suyo.
 */
export async function getMisAcuerdos(comoAdminDe?: string): Promise<R<{ hoy: string; yo: YoSesion; acuerdos: Acuerdo[] }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  try {
    let mias = s.mias;
    const scope = comoAdminDe && ["atelier", "fonavi", "centro"].includes(comoAdminDe) ? `admin-${comoAdminDe}` : null;
    if (scope && s.yo.tipo === "direccion") {
      const rows = (await sql`SELECT id FROM app_users WHERE active AND scope = ${scope}`) as { id: number }[];
      mias = rows.map((r) => `u:${r.id}`);
    }
    const acuerdos = mias.length === 0 ? [] : ((await sql`
      SELECT ${COLUMNAS}, NOT (a.responsable_clave = ANY(${mias})) AS "soyApoyo"
      FROM acuerdos a LEFT JOIN reuniones r ON r.id = a.reunion_id
      WHERE (a.responsable_clave = ANY(${mias}) OR a.apoyo_claves && ${mias}::text[])
        AND (a.estado IN ('pendiente','en_proceso')
             OR (a.estado IN ('cumplido','por_confirmar') AND a.actualizado_el > now() - interval '30 days'))
      ORDER BY a.fecha_limite, a.id
    `) as Acuerdo[]);
    return { ok: true, hoy: getToday(), yo: s.yo, acuerdos };
  } catch (e) {
    return errorBD("mis", e);
  }
}

export async function getHistorialAcuerdo(id: number): Promise<R<{ eventos: Evento[] }>> {
  const s = await sesion();
  if (!s) return SIN_ACCESO;
  try {
    const a = await leer(id);
    if (!a) return { ok: false, error: "No encontré ese acuerdo." };
    if (!veTodo(s.yo) && !s.mias.includes(a.responsableClave) && !a.apoyoClaves.some((c) => s.mias.includes(c))) return SIN_ACCESO;
    const eventos = (await sql`
      SELECT id, cuando::text AS cuando, quien, tipo, detalle FROM acuerdo_eventos
      WHERE acuerdo_id = ${id} ORDER BY cuando, id
    `) as Evento[];
    return { ok: true, eventos };
  } catch (e) {
    return errorBD("historial", e);
  }
}

// ─────────────────────────────────────────────────────────────────
// Escrituras

const limpio = (t: string | null | undefined, max: number) => {
  const v = (t ?? "").trim();
  return v ? v.slice(0, max) : null;
};

async function leer(id: number): Promise<Acuerdo | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = (await sql`SELECT ${COLUMNAS} FROM acuerdos a LEFT JOIN reuniones r ON r.id = a.reunion_id WHERE a.id = ${id}`) as Acuerdo[];
  return rows[0] ?? null;
}

/** Lee el acuerdo y revisa el permiso. Si es un admin con la contraseña de sede, actúa como el responsable (o como el apoyo). */
async function conPermiso(id: number, accion: AccionAcuerdo): Promise<{ s: { yo: YoSesion; mias: string[] }; a: Acuerdo } | { error: string }> {
  const s = await sesion();
  if (!s) return { error: SIN_ACCESO.error };
  const a = await leer(id);
  if (!a) return { error: "No encontré ese acuerdo." };
  const apoyo = a.apoyoClaves.find((c) => s.mias.includes(c));
  const yo = s.mias.includes(a.responsableClave) ? { ...s.yo, clave: a.responsableClave } : apoyo ? { ...s.yo, clave: apoyo } : s.yo;
  if (!puede(yo, a, accion)) return { error: "No puedes hacer ese cambio en este acuerdo." };
  return { s: { ...s, yo }, a };
}

async function evento(id: number, quien: string, tipo: string, detalle: string | null) {
  await sql`INSERT INTO acuerdo_eventos (acuerdo_id, quien, tipo, detalle) VALUES (${id}, ${quien}, ${tipo}, ${detalle})`;
}

export async function crearAcuerdo(input: {
  que: string; detalle?: string; area: string; responsable: string; fechaLimite: string; reunionId?: number | null; prioridad?: string;
  apoyos?: string[];
}): Promise<R<{ id: number }>> {
  const s = await sesion();
  if (!s || !veTodo(s.yo)) return SIN_ACCESO;
  try {
    const hoy = getToday();
    const gente = await personas();
    const errores = erroresAcuerdo(input, hoy, new Set(gente.map((p) => p.clave)));
    if (errores.length) return { ok: false, error: errores.join(" ") };
    const resp = gente.find((p) => p.clave === input.responsable)!;
    const apoyos = limpiarApoyos(input.apoyos, resp.clave, new Set(gente.map((p) => p.clave)));
    const apoyoNombres = apoyos.map((c) => gente.find((p) => p.clave === c)!.nombre);
    const rows = (await sql`
      INSERT INTO acuerdos (reunion_id, que, detalle, area, prioridad, responsable_clave, responsable_nombre, apoyo_claves, apoyo_nombres, fecha_limite, fecha_limite_original, creado_por, creado_por_clave)
      VALUES (${input.reunionId ?? null}, ${input.que.trim().slice(0, MAX_QUE)}, ${limpio(input.detalle, MAX_DETALLE)}, ${input.area},
              ${esPrioridad(input.prioridad) ? input.prioridad : "media"},
              ${resp.clave}, ${resp.nombre}, ${apoyos}::text[], ${apoyoNombres}::text[], ${input.fechaLimite}, ${input.fechaLimite}, ${s.yo.nombre}, ${s.yo.clave})
      RETURNING id
    `) as { id: number }[];
    return { ok: true, id: rows[0].id };
  } catch (e) {
    return errorBD("crear", e);
  }
}

export async function crearReunion(input: {
  fecha: string; area: string; titulo: string; asistentes?: string; notas?: string;
  acuerdos: { que: string; responsable: string; fechaLimite: string }[];
}): Promise<R<{ id: number; acuerdos: number }>> {
  const s = await sesion();
  if (!s || !veTodo(s.yo)) return SIN_ACCESO;
  const titulo = (input.titulo ?? "").trim();
  if (titulo.length < 3) return { ok: false, error: "Escribe el nombre de la reunión." };
  if (!esArea(input.area)) return { ok: false, error: "Elige el área de la reunión." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return { ok: false, error: "Elige la fecha de la reunión." };
  try {
    const hoy = getToday();
    if (input.fecha > hoy) return { ok: false, error: "La reunión no puede tener fecha futura." };
    const gente = await personas();
    const claves = new Set(gente.map((p) => p.clave));
    const filas = input.acuerdos.filter((a) => a.que.trim() || a.responsable || a.fechaLimite);
    for (const [i, a] of filas.entries()) {
      const e = erroresAcuerdo({ ...a, area: input.area }, hoy, claves);
      if (e.length) return { ok: false, error: `Acuerdo ${i + 1}: ${e.join(" ")}` };
    }
    const nom = (c: string) => gente.find((p) => p.clave === c)!.nombre;
    // Un solo viaje a la base: la reunión y sus acuerdos entran juntos o no entra nada.
    const rows = (await sql`
      WITH r AS (
        INSERT INTO reuniones (fecha, area, titulo, asistentes, notas, creado_por, creado_por_clave)
        VALUES (${input.fecha}, ${input.area}, ${titulo.slice(0, MAX_QUE)}, ${limpio(input.asistentes, MAX_MOTIVO)},
                ${limpio(input.notas, MAX_DETALLE)}, ${s.yo.nombre}, ${s.yo.clave})
        RETURNING id
      ), ins AS (
        INSERT INTO acuerdos (reunion_id, que, area, responsable_clave, responsable_nombre, fecha_limite, fecha_limite_original, creado_por, creado_por_clave)
        SELECT r.id, x.que, ${input.area}, x.clave, x.nombre, x.fecha, x.fecha, ${s.yo.nombre}, ${s.yo.clave}
        FROM r, unnest(${filas.map((a) => a.que.trim().slice(0, MAX_QUE))}::text[], ${filas.map((a) => a.responsable)}::text[],
                       ${filas.map((a) => nom(a.responsable))}::text[], ${filas.map((a) => a.fechaLimite)}::date[]) AS x(que, clave, nombre, fecha)
        RETURNING id
      )
      SELECT (SELECT id FROM r) AS id, (SELECT count(*)::int FROM ins) AS n
    `) as { id: number; n: number }[];
    return { ok: true, id: rows[0].id, acuerdos: rows[0].n };
  } catch (e) {
    return errorBD("reunion", e);
  }
}

/**
 * Cambia el estado: No iniciado, En progreso o Hecho (como Monday). Lo hace el responsable o la dirección, sin
 * paso de confirmar. Desde Hecho se puede volver atrás (reabrir); «tarde» se queda como estaba.
 */
export async function avanzarAcuerdo(id: number, a: "pendiente" | "en_proceso" | "cumplido", nota?: string): Promise<R<{ estado: EstadoGuardado }>> {
  try {
    const p = await conPermiso(id, "avanzar");
    if ("error" in p) return { ok: false, error: p.error };
    if (p.a.estado === a) return { ok: true, estado: a };
    const hoy = getToday();
    if (a === "cumplido") {
      const tarde = quedaTarde(p.a.tarde, p.a.fechaLimite, hoy);
      const rows = await sql`
        UPDATE acuerdos SET estado = 'cumplido', tarde = ${tarde}, marcado_cumplido_el = now(),
               confirmado_el = now(), confirmado_por = ${p.s.yo.nombre}, actualizado_el = now()
        WHERE id = ${id} AND estado IN ('pendiente','en_proceso') RETURNING id`;
      if (rows.length === 0) return { ok: false, error: "Alguien cambió este acuerdo. Recarga la página." };
      await evento(id, p.s.yo.nombre, "estado", `Pasó a hecho${tarde ? " (tarde)" : ""}${limpio(nota, MAX_MOTIVO) ? `: ${limpio(nota, MAX_MOTIVO)}` : ""}`);
      return { ok: true, estado: a };
    }
    const rows = await sql`
      UPDATE acuerdos SET estado = ${a}, marcado_cumplido_el = NULL, confirmado_el = NULL, confirmado_por = NULL, actualizado_el = now()
      WHERE id = ${id} AND estado IN ('pendiente','en_proceso','cumplido','por_confirmar') RETURNING id`;
    if (rows.length === 0) return { ok: false, error: "Alguien cambió este acuerdo. Recarga la página." };
    await evento(id, p.s.yo.nombre, "estado", `Pasó a ${ESTADO_LABEL[a].toLowerCase()}`);
    return { ok: true, estado: a };
  } catch (e) {
    return errorBD("avanzar", e);
  }
}

export async function editarAcuerdo(id: number, input: {
  que: string; detalle?: string; area: string; responsable: string; fechaLimite: string; motivoFecha?: string; prioridad?: string;
  /** Inicio del plazo (Desde). Sin enviar = se queda como está; null = vuelve al día de creación. */
  fechaInicio?: string | null;
  /** Personas de apoyo. Sin enviar = se quedan como están. */
  apoyos?: string[];
}): Promise<R<object>> {
  try {
    const p = await conPermiso(id, "editar");
    if ("error" in p) return { ok: false, error: p.error };
    const hoy = getToday();
    const gente = await personas();
    const claves = new Set(gente.map((g) => g.clave));
    claves.add(p.a.responsableClave); // si el responsable fue desactivado, igual se puede editar lo demás
    const cambiaFecha = input.fechaLimite !== p.a.fechaLimite;
    // Validar la fecha solo si cambia: un acuerdo vencido se puede corregir sin mover su fecha.
    const errores = erroresAcuerdo({ ...input, fechaLimite: cambiaFecha ? input.fechaLimite : hoy }, hoy, claves);
    if (errores.length) return { ok: false, error: errores.join(" ") };
    const motivo = limpio(input.motivoFecha, MAX_MOTIVO);
    if (cambiaFecha && !motivo) return { ok: false, error: "Escribe por qué cambia la fecha límite." };
    // Inicio del plazo: no puede ser después de la fecha límite. Si la fecha límite se adelanta y deja el
    // inicio guardado por detrás, el inicio vuelve al día de creación.
    if (input.fechaInicio != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.fechaInicio)) return { ok: false, error: "Elige la fecha de inicio." };
    if (input.fechaInicio != null && input.fechaInicio > input.fechaLimite) return { ok: false, error: "El inicio del plazo no puede ser después de la fecha límite." };
    const inicioPedido = input.fechaInicio === undefined ? p.a.fechaInicio : input.fechaInicio;
    const fechaInicio = inicioPedido && inicioPedido <= input.fechaLimite ? inicioPedido : null;
    const resp = gente.find((g) => g.clave === input.responsable) ?? { clave: p.a.responsableClave, nombre: p.a.responsableNombre };
    const prioridad: Prioridad = esPrioridad(input.prioridad) ? input.prioridad : p.a.prioridad;
    // Un apoyo desactivado se conserva si no lo quitan (como el responsable).
    const nombreDe = (c: string) => gente.find((g) => g.clave === c)?.nombre ?? p.a.apoyoNombres[p.a.apoyoClaves.indexOf(c)];
    const clavesApoyo = new Set([...claves, ...p.a.apoyoClaves]);
    const apoyos = input.apoyos === undefined
      ? p.a.apoyoClaves.filter((c) => c !== resp.clave)
      : limpiarApoyos(input.apoyos, resp.clave, clavesApoyo);
    const apoyoNombres = apoyos.map(nombreDe);
    // Mover una fecha que ya venció no lava el atraso.
    const tarde = p.a.tarde || (cambiaFecha && estaAbierto(p.a.estado) && p.a.fechaLimite < hoy);
    await sql`
      UPDATE acuerdos SET que = ${input.que.trim().slice(0, MAX_QUE)}, detalle = ${limpio(input.detalle, MAX_DETALLE)}, area = ${input.area},
             responsable_clave = ${resp.clave}, responsable_nombre = ${resp.nombre},
             apoyo_claves = ${apoyos}::text[], apoyo_nombres = ${apoyoNombres}::text[], fecha_limite = ${input.fechaLimite},
             fecha_inicio = ${fechaInicio}, prioridad = ${prioridad}, tarde = ${tarde}, actualizado_el = now()
      WHERE id = ${id}`;
    const quien = p.s.yo.nombre;
    if (cambiaFecha) await evento(id, quien, "fecha", `${p.a.fechaLimite} → ${input.fechaLimite}: ${motivo}`);
    if (fechaInicio !== p.a.fechaInicio) await evento(id, quien, "plazo", `Inicio: ${p.a.fechaInicio ?? "día de creación"} → ${fechaInicio ?? "día de creación"}`);
    if (resp.clave !== p.a.responsableClave) await evento(id, quien, "responsable", `${p.a.responsableNombre} → ${resp.nombre}`);
    if (apoyos.join() !== p.a.apoyoClaves.join()) {
      await evento(id, quien, "apoyos", apoyoNombres.length ? `Apoyo: ${apoyoNombres.join(", ")}` : "Sin apoyo");
    }
    if (prioridad !== p.a.prioridad) await evento(id, quien, "prioridad", `${PRIORIDAD_LABEL[p.a.prioridad]} → ${PRIORIDAD_LABEL[prioridad]}`);
    if (input.que.trim() !== p.a.que || input.area !== p.a.area || limpio(input.detalle, MAX_DETALLE) !== p.a.detalle) {
      await evento(id, quien, "editado", input.area !== p.a.area ? `Área: ${AREA_LABEL[p.a.area]} → ${AREA_LABEL[input.area as Area]}` : "Texto corregido");
    }
    return { ok: true };
  } catch (e) {
    return errorBD("editar", e);
  }
}

export async function anularAcuerdo(id: number, motivo: string): Promise<R<object>> {
  try {
    const p = await conPermiso(id, "anular");
    if ("error" in p) return { ok: false, error: p.error };
    const m = limpio(motivo, MAX_MOTIVO);
    if (!m) return { ok: false, error: "Escribe por qué se anula." };
    await sql`UPDATE acuerdos SET estado = 'anulado', actualizado_el = now() WHERE id = ${id}`;
    await evento(id, p.s.yo.nombre, "anulado", m);
    return { ok: true };
  } catch (e) {
    return errorBD("anular", e);
  }
}

export async function comentarAcuerdo(id: number, texto: string): Promise<R<object>> {
  try {
    const p = await conPermiso(id, "comentar");
    if ("error" in p) return { ok: false, error: p.error };
    const t = limpio(texto, MAX_DETALLE);
    if (!t) return { ok: false, error: "Escribe el comentario." };
    await evento(id, p.s.yo.nombre, "comentario", t);
    await sql`UPDATE acuerdos SET actualizado_el = now() WHERE id = ${id}`;
    return { ok: true };
  } catch (e) {
    return errorBD("comentar", e);
  }
}

// ─────────────────────────────────────────────────────────────────
// Fase 2: indicadores y alerta al CEO

/** Todo lo que vence desde hace 12 meses (sin anulados): el cálculo de los indicadores lo hace la pantalla. */
export async function getIndicadoresAcuerdos(): Promise<R<{ hoy: string; acuerdos: AcuerdoIndicador[] }>> {
  const s = await sesion();
  if (!s || !veTodo(s.yo)) return SIN_ACCESO;
  try {
    const acuerdos = (await sql`
      SELECT a.estado, a.fecha_limite::text AS "fechaLimite", a.tarde, a.area,
             a.responsable_clave AS "responsableClave", a.responsable_nombre AS "responsableNombre"
      FROM acuerdos a
      WHERE a.estado <> 'anulado' AND a.fecha_limite >= date_trunc('month', now() - interval '11 months')::date
    `) as AcuerdoIndicador[];
    return { ok: true, hoy: getToday(), acuerdos };
  } catch (e) {
    return errorBD("indicadores", e);
  }
}

export type AlertaAcuerdos = {
  vencidos: number;
  /** Quiénes tienen vencidos, el que más primero. */
  porPersona: { nombre: string; n: number }[];
};

/**
 * Para el Dashboard de Grupo: ¿hay incumplimientos? Solo para quien supervisa (dirección). null = nada que
 * avisar o no aplica. Nunca lanza: el Dashboard se arma igual.
 */
export async function getAlertaAcuerdos(): Promise<AlertaAcuerdos | null> {
  const s = await sesion();
  if (!s || s.yo.tipo !== "direccion") return null;
  try {
    const hoy = getToday();
    const rows = (await sql`
      SELECT responsable_nombre AS nombre,
             count(*) FILTER (WHERE fecha_limite < ${hoy})::int AS vencidos
      FROM acuerdos WHERE estado IN ('pendiente','en_proceso')
      GROUP BY responsable_nombre
    `) as { nombre: string; vencidos: number }[];
    const porPersona = rows.filter((r) => r.vencidos > 0).map((r) => ({ nombre: r.nombre, n: r.vencidos })).sort((a, b) => b.n - a.n);
    const vencidos = porPersona.reduce((t, r) => t + r.n, 0);
    return vencidos ? { vencidos, porPersona } : null;
  } catch (e) {
    console.error("[acuerdos:alerta]", e);
    return null;
  }
}
