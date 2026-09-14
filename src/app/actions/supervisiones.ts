"use server";

/**
 * Supervisiones de Juani — acciones (guardar y leer). La regla de cuándo
 * una observación está a tiempo y cuándo se cumple el requisito del bono
 * vive en src/lib/supervisiones.ts; los permisos, en
 * src/lib/supervision-access.ts.
 *
 * OJO CON LA SEDE (docs/CONTEXTO.md §5.6): Juani trabaja desde /grupo y
 * ahí `activeBusinessId()` cae a la cookie de la última sede visitada.
 * La sede sale SIEMPRE de lo que se está tocando (la visita, la
 * observación) o de lo que Juani eligió explícitamente. Solo el panel del
 * administrador usa la sede activa, que para él la fija el middleware.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getToday } from "@/lib/utils";
import { deletePrivateBlob } from "@/lib/blob-storage";
import {
  sesionPuede, observacionBusinessId, accionDeFoto, SEDES_SUPERVISADAS,
  type TipoFotoSupervision,
} from "@/lib/supervision-access";
import {
  plazoDesde, resumirSupervisionMes, correccionLlegoTarde, situacionObservacion,
  type Gravedad, type EstadoObservacion, type Observacion, type ResumenSupervisionMes,
  type SituacionObservacion, type EntradaSupervision,
} from "@/lib/supervisiones";

const sql = neon(process.env.DATABASE_URL!);

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const esUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const esMes = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const esGravedad = (g: string): g is Gravedad => g === "critica" || g === "normal";

function limitesMes(month: string) {
  const [y, m] = month.split("-").map(Number);
  const dias = new Date(y, m, 0).getDate();
  return { inicio: `${month}-01`, fin: `${month}-${String(dias).padStart(2, "0")}` };
}

const nombreSede = (bId: number) => SEDES_SUPERVISADAS.find((s) => s.id === bId)?.nombre ?? `Sede ${bId}`;

function refrescar() {
  revalidatePath("/grupo/supervisiones");
  revalidatePath("/[negocio]/panel", "page");
}

/* ─────────────────────────── La lista de puntos ─────────────────────────── */

export type PuntoSupervision = {
  id: number;
  nombre: string;
  descripcion: string | null;
  gravedad: Gravedad;
  orden: number;
  activo: boolean;
};

export async function getListaSupervision(): Promise<Res<{ puntos: PuntoSupervision[] }>> {
  if (!(await sesionPuede(null, "supervisar")).ok) return { ok: false, error: "Sin acceso a las supervisiones." };
  try {
    const puntos = (await sql`
      SELECT id, nombre, descripcion, gravedad, orden, activo
      FROM supervision_items ORDER BY activo DESC, orden, id
    `) as PuntoSupervision[];
    return { ok: true, puntos };
  } catch (e) {
    console.error("[getListaSupervision] failed:", e);
    return { ok: false, error: "No se pudo leer la lista de puntos." };
  }
}

export async function guardarPuntoSupervision(input: {
  id: number | null;
  nombre: string;
  descripcion: string;
  gravedad: string;
  activo: boolean;
}): Promise<Res> {
  if (!(await sesionPuede(null, "supervisar")).ok) return { ok: false, error: "Solo Juani o dirección editan la lista." };
  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "El punto necesita un nombre." };
  if (!esGravedad(input.gravedad)) return { ok: false, error: "Gravedad inválida." };
  const descripcion = input.descripcion.trim() || null;
  try {
    if (input.id === null) {
      await sql`
        INSERT INTO supervision_items (nombre, descripcion, gravedad, orden)
        VALUES (${nombre}, ${descripcion}, ${input.gravedad},
                (SELECT COALESCE(MAX(orden), 0) + 1 FROM supervision_items))
      `;
    } else {
      // Editar un punto NO cambia las visitas ya registradas: guardaron su
      // nombre y su resultado del día.
      await sql`
        UPDATE supervision_items
           SET nombre = ${nombre}, descripcion = ${descripcion}, gravedad = ${input.gravedad}, activo = ${input.activo}
         WHERE id = ${input.id}
      `;
    }
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[guardarPuntoSupervision] failed:", e);
    return { ok: false, error: "No se pudo guardar el punto." };
  }
}

/* ─────────────────────────── Registrar una visita ─────────────────────────── */

/** Cuántos días atrás se puede registrar una visita (Juani a veces la sube en la noche o al día siguiente). */
const DIAS_ATRAS_MAX = 3;

export async function registrarVisita(input: {
  businessId: number;
  fecha: string;
  notas: string;
  resultados: { itemId: number; resultado: "cumple" | "no_cumple" | "no_aplica"; detalle: string; gravedad: string }[];
  extras: { titulo: string; detalle: string; gravedad: string }[];
}): Promise<Res<{ visitaId: string; observaciones: { id: string; titulo: string }[] }>> {
  const bId = input.businessId;
  if (!SEDES_SUPERVISADAS.some((s) => s.id === bId)) return { ok: false, error: "Sede inválida." };
  const sesion = await sesionPuede(bId, "supervisar");
  if (!sesion.ok) return { ok: false, error: "Solo Juani o dirección registran supervisiones." };

  const hoy = getToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha) || input.fecha > hoy) {
    return { ok: false, error: "La fecha de la visita no puede ser futura." };
  }
  const limite = new Date(`${hoy}T12:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - DIAS_ATRAS_MAX);
  if (input.fecha < limite.toISOString().slice(0, 10)) {
    return { ok: false, error: `Solo se pueden registrar visitas de los últimos ${DIAS_ATRAS_MAX} días.` };
  }

  let puntos: { id: number; nombre: string; gravedad: Gravedad }[];
  try {
    puntos = (await sql`SELECT id, nombre, gravedad FROM supervision_items WHERE activo = true`) as typeof puntos;
  } catch (e) {
    console.error("[registrarVisita] items:", e);
    return { ok: false, error: "No se pudo leer la lista de puntos." };
  }
  const porId = new Map(puntos.map((p) => [p.id, p]));
  const resultados = input.resultados.filter((r) => porId.has(r.itemId));
  if (resultados.length !== puntos.length) {
    return { ok: false, error: "Falta marcar algún punto de la lista (cumple, no cumple o no aplica)." };
  }
  for (const r of resultados) {
    if (!["cumple", "no_cumple", "no_aplica"].includes(r.resultado)) return { ok: false, error: "Resultado inválido." };
    if (r.resultado === "no_cumple" && !esGravedad(r.gravedad)) return { ok: false, error: "Gravedad inválida." };
  }
  const extras = input.extras.filter((x) => x.titulo.trim() !== "");
  if (extras.some((x) => !esGravedad(x.gravedad))) return { ok: false, error: "Gravedad inválida." };

  const evaluados = resultados.filter((r) => r.resultado !== "no_aplica").length;
  const cumplidos = resultados.filter((r) => r.resultado === "cumple").length;
  const visitaId = crypto.randomUUID();
  const ahora = new Date().toISOString();
  // El plazo corre desde que se REGISTRA, no desde la hora de la visita:
  // el administrador no puede corregir algo que todavía no le avisaron.
  const observaciones = [
    ...resultados
      .filter((r) => r.resultado === "no_cumple")
      .map((r) => ({
        id: crypto.randomUUID(), itemId: r.itemId as number | null, titulo: porId.get(r.itemId)!.nombre,
        detalle: r.detalle.trim() || null, gravedad: r.gravedad as Gravedad,
      })),
    ...extras.map((x) => ({
      id: crypto.randomUUID(), itemId: null as number | null, titulo: x.titulo.trim(),
      detalle: x.detalle.trim() || null, gravedad: x.gravedad as Gravedad,
    })),
  ];

  try {
    await sql.transaction([
      sql`
        INSERT INTO supervision_visits (id, business_id, fecha, registrada_por, notas, puntos_evaluados, puntos_cumplidos)
        VALUES (${visitaId}, ${bId}, ${input.fecha}, ${sesion.nombre}, ${input.notas.trim() || null}, ${evaluados}, ${cumplidos})
      `,
      ...resultados.map((r) => sql`
        INSERT INTO supervision_results (visit_id, item_id, item_nombre, resultado)
        VALUES (${visitaId}, ${r.itemId}, ${porId.get(r.itemId)!.nombre}, ${r.resultado})
      `),
      ...observaciones.map((o) => sql`
        INSERT INTO supervision_observations
          (id, business_id, visit_id, item_id, titulo, detalle, gravedad, creada_en, plazo_hasta)
        VALUES (${o.id}, ${bId}, ${visitaId}, ${o.itemId}, ${o.titulo}, ${o.detalle}, ${o.gravedad},
                ${ahora}, ${plazoDesde(ahora, o.gravedad)})
      `),
    ]);
    refrescar();
    return { ok: true, visitaId, observaciones: observaciones.map((o) => ({ id: o.id, titulo: o.titulo })) };
  } catch (e) {
    console.error("[registrarVisita] failed:", e);
    return { ok: false, error: "No se pudo guardar la visita. Vuelve a intentar." };
  }
}

/**
 * Anular una visita registrada por error. Solo si NINGUNA de sus
 * observaciones fue corregida: lo que el administrador ya trabajó no se
 * borra de un clic.
 */
export async function anularVisita(visitaId: string): Promise<Res> {
  if (!esUuid(visitaId)) return { ok: false, error: "Visita inválida." };
  try {
    const rows = (await sql`
      SELECT v.business_id,
             COUNT(o.id) FILTER (WHERE o.estado <> 'abierta' OR o.rechazos > 0)::int AS trabajadas
      FROM supervision_visits v LEFT JOIN supervision_observations o ON o.visit_id = v.id
      WHERE v.id = ${visitaId} GROUP BY v.business_id
    `) as { business_id: number; trabajadas: number }[];
    if (!rows[0]) return { ok: false, error: "La visita no existe." };
    if (!(await sesionPuede(rows[0].business_id, "supervisar")).ok) return { ok: false, error: "Sin permiso." };
    if (rows[0].trabajadas > 0) {
      return { ok: false, error: "No se puede anular: el administrador ya respondió alguna observación de esta visita." };
    }
    const fotos = (await sql`
      SELECT a.id::text, a.url FROM attachments a
      JOIN supervision_observations o ON o.id = a.record_id
      WHERE o.visit_id = ${visitaId} AND a.record_type IN ('supervision_problema', 'supervision_correccion')
    `) as { id: string; url: string }[];
    await sql.transaction([
      sql`DELETE FROM attachments WHERE id = ANY(${fotos.map((f) => f.id)}::uuid[])`,
      sql`DELETE FROM supervision_visits WHERE id = ${visitaId}`,
    ]);
    for (const f of fotos) await deletePrivateBlob(f.url).catch(() => undefined);
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[anularVisita] failed:", e);
    return { ok: false, error: "No se pudo anular la visita." };
  }
}

/* ─────────────────────────── Corregir / confirmar ─────────────────────────── */

export async function marcarCorregida(obsId: string, comentario: string): Promise<Res> {
  const bId = await observacionBusinessId(obsId);
  if (bId === null) return { ok: false, error: "La observación no existe." };
  const sesion = await sesionPuede(bId, "corregir");
  if (!sesion.ok) return { ok: false, error: "Solo el administrador de la sede marca la corrección." };
  try {
    const fotos = (await sql`
      SELECT COUNT(*)::int AS n FROM attachments a
      JOIN supervision_observations o ON o.id = a.record_id
      WHERE o.id = ${obsId} AND a.record_type = 'supervision_correccion'
        AND a.created_at > COALESCE(o.rechazada_en, o.creada_en)
    `) as { n: number }[];
    if ((fotos[0]?.n ?? 0) === 0) {
      return { ok: false, error: "Sube primero la foto de cómo quedó corregido." };
    }
    const r = (await sql`
      UPDATE supervision_observations
         SET estado = 'corregida', corregida_en = now(), corregida_por = ${sesion.nombre},
             comentario_correccion = ${comentario.trim() || null}
       WHERE id = ${obsId} AND estado = 'abierta'
       RETURNING id
    `) as unknown[];
    if (r.length === 0) return { ok: false, error: "Esta observación ya no está abierta." };
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[marcarCorregida] failed:", e);
    return { ok: false, error: "No se pudo marcar como corregida." };
  }
}

export async function confirmarCorreccion(obsId: string): Promise<Res> {
  const bId = await observacionBusinessId(obsId);
  if (bId === null) return { ok: false, error: "La observación no existe." };
  const sesion = await sesionPuede(bId, "supervisar");
  if (!sesion.ok) return { ok: false, error: "Solo Juani o dirección confirman correcciones." };
  try {
    const r = (await sql`
      UPDATE supervision_observations
         SET estado = 'confirmada', confirmada_en = now(), confirmada_por = ${sesion.nombre}
       WHERE id = ${obsId} AND estado = 'corregida'
       RETURNING id
    `) as unknown[];
    if (r.length === 0) return { ok: false, error: "Esta observación no está esperando confirmación." };
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[confirmarCorreccion] failed:", e);
    return { ok: false, error: "No se pudo confirmar." };
  }
}

/**
 * La foto no muestra el arreglo: vuelve a abierta con un plazo nuevo del
 * mismo largo. Si la corrección rechazada ya había llegado tarde, queda
 * marcada fuera de plazo para siempre (ver src/lib/supervisiones.ts).
 */
export async function rechazarCorreccion(obsId: string, motivo: string): Promise<Res> {
  const bId = await observacionBusinessId(obsId);
  if (bId === null) return { ok: false, error: "La observación no existe." };
  const sesion = await sesionPuede(bId, "supervisar");
  if (!sesion.ok) return { ok: false, error: "Solo Juani o dirección rechazan correcciones." };
  const texto = motivo.trim();
  if (!texto) return { ok: false, error: "Escribe qué falta, para que el administrador sepa qué corregir." };
  try {
    const rows = (await sql`
      SELECT gravedad, plazo_hasta::text AS plazo_hasta, corregida_en::text AS corregida_en, estado
      FROM supervision_observations WHERE id = ${obsId}
    `) as { gravedad: Gravedad; plazo_hasta: string; corregida_en: string | null; estado: EstadoObservacion }[];
    const o = rows[0];
    if (!o || o.estado !== "corregida") return { ok: false, error: "Esta observación no está esperando confirmación." };
    const tarde = correccionLlegoTarde({ plazoHasta: o.plazo_hasta, corregidaEn: o.corregida_en });
    const ahora = new Date().toISOString();
    await sql`
      UPDATE supervision_observations
         SET estado = 'abierta', corregida_en = NULL, corregida_por = NULL, comentario_correccion = NULL,
             rechazos = rechazos + 1, ultimo_rechazo = ${texto}, rechazada_en = ${ahora},
             plazo_hasta = ${plazoDesde(ahora, o.gravedad)},
             vencida_alguna_vez = vencida_alguna_vez OR ${tarde}
       WHERE id = ${obsId} AND estado = 'corregida'
    `;
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[rechazarCorreccion] failed:", e);
    return { ok: false, error: "No se pudo rechazar." };
  }
}

/* ─────────────────────────── Lectura ─────────────────────────── */

export type ObservacionVista = {
  id: string;
  businessId: number;
  sede: string;
  visitaId: string;
  fechaVisita: string;
  titulo: string;
  detalle: string | null;
  gravedad: Gravedad;
  estado: EstadoObservacion;
  situacion: SituacionObservacion;
  creadaEn: string;
  plazoHasta: string;
  corregidaEn: string | null;
  corregidaPor: string | null;
  comentarioCorreccion: string | null;
  confirmadaEn: string | null;
  confirmadaPor: string | null;
  rechazos: number;
  ultimoRechazo: string | null;
  fotosProblema: number;
  fotosCorreccion: number;
};

export type VisitaVista = {
  id: string;
  businessId: number;
  sede: string;
  fecha: string;
  registradaPor: string;
  notas: string | null;
  puntosEvaluados: number;
  puntosCumplidos: number;
  observaciones: number;
};

type FilaObs = {
  id: string; business_id: number; visit_id: string; fecha_visita: string; titulo: string; detalle: string | null;
  gravedad: Gravedad; estado: EstadoObservacion; creada_en: string; plazo_hasta: string; corregida_en: string | null;
  corregida_por: string | null; comentario_correccion: string | null; confirmada_en: string | null;
  confirmada_por: string | null; rechazos: number; ultimo_rechazo: string | null; vencida_alguna_vez: boolean;
  fotos_problema: number; fotos_correccion: number;
};

function aVista(f: FilaObs, ahora: string): ObservacionVista {
  const base: Observacion = {
    id: f.id, gravedad: f.gravedad, estado: f.estado, fechaVisita: f.fecha_visita,
    plazoHasta: f.plazo_hasta, corregidaEn: f.corregida_en, vencidaAlgunaVez: f.vencida_alguna_vez,
  };
  return {
    id: f.id, businessId: f.business_id, sede: nombreSede(f.business_id), visitaId: f.visit_id,
    fechaVisita: f.fecha_visita, titulo: f.titulo, detalle: f.detalle, gravedad: f.gravedad, estado: f.estado,
    situacion: situacionObservacion(base, ahora), creadaEn: f.creada_en, plazoHasta: f.plazo_hasta,
    corregidaEn: f.corregida_en, corregidaPor: f.corregida_por, comentarioCorreccion: f.comentario_correccion,
    confirmadaEn: f.confirmada_en, confirmadaPor: f.confirmada_por, rechazos: f.rechazos,
    ultimoRechazo: f.ultimo_rechazo, fotosProblema: f.fotos_problema, fotosCorreccion: f.fotos_correccion,
  };
}

const aObservacion = (v: ObservacionVista, f: FilaObs): Observacion => ({
  id: v.id, gravedad: v.gravedad, estado: v.estado, fechaVisita: v.fechaVisita,
  plazoHasta: v.plazoHasta, corregidaEn: v.corregidaEn, vencidaAlgunaVez: f.vencida_alguna_vez,
});

/**
 * Observaciones de una o varias sedes: las del mes (por fecha de visita)
 * más TODAS las que siguen sin confirmar, sean del mes que sean — una
 * normal de fin de mes sigue viva en el siguiente.
 */
async function leerObservaciones(bIds: number[], month: string): Promise<FilaObs[]> {
  const { inicio, fin } = limitesMes(month);
  return (await sql`
    SELECT o.id::text, o.business_id, o.visit_id::text, v.fecha::text AS fecha_visita, o.titulo, o.detalle,
           o.gravedad, o.estado, o.creada_en::text, o.plazo_hasta::text, o.corregida_en::text, o.corregida_por,
           o.comentario_correccion, o.confirmada_en::text, o.confirmada_por, o.rechazos, o.ultimo_rechazo,
           o.vencida_alguna_vez,
           (SELECT COUNT(*)::int FROM attachments a WHERE a.record_id = o.id AND a.record_type = 'supervision_problema') AS fotos_problema,
           (SELECT COUNT(*)::int FROM attachments a WHERE a.record_id = o.id AND a.record_type = 'supervision_correccion') AS fotos_correccion
    FROM supervision_observations o JOIN supervision_visits v ON v.id = o.visit_id
    WHERE o.business_id = ANY(${bIds}::int[])
      AND ((v.fecha BETWEEN ${inicio} AND ${fin}) OR o.estado <> 'confirmada')
    ORDER BY (o.gravedad = 'critica') DESC, o.plazo_hasta
  `) as FilaObs[];
}

async function leerVisitas(bIds: number[], month: string): Promise<VisitaVista[]> {
  const { inicio, fin } = limitesMes(month);
  const rows = (await sql`
    SELECT v.id::text, v.business_id, v.fecha::text, v.registrada_por, v.notas, v.puntos_evaluados, v.puntos_cumplidos,
           (SELECT COUNT(*)::int FROM supervision_observations o WHERE o.visit_id = v.id) AS observaciones
    FROM supervision_visits v
    WHERE v.business_id = ANY(${bIds}::int[]) AND v.fecha BETWEEN ${inicio} AND ${fin}
    ORDER BY v.fecha DESC, v.registrada_en DESC
  `) as { id: string; business_id: number; fecha: string; registrada_por: string; notas: string | null; puntos_evaluados: number; puntos_cumplidos: number; observaciones: number }[];
  return rows.map((r) => ({
    id: r.id, businessId: r.business_id, sede: nombreSede(r.business_id), fecha: r.fecha,
    registradaPor: r.registrada_por, notas: r.notas, puntosEvaluados: r.puntos_evaluados,
    puntosCumplidos: r.puntos_cumplidos, observaciones: r.observaciones,
  }));
}

function resumen(bId: number, month: string, visitas: VisitaVista[], filas: FilaObs[], ahora: string): ResumenSupervisionMes {
  const { inicio, fin } = limitesMes(month);
  const delMes = filas.filter((f) => f.business_id === bId && f.fecha_visita >= inicio && f.fecha_visita <= fin);
  return resumirSupervisionMes(
    visitas.filter((v) => v.businessId === bId),
    delMes.map((f) => aObservacion(aVista(f, ahora), f)),
    ahora,
  );
}

async function requisitoDelMes(bId: number, month: string): Promise<boolean> {
  try {
    const rows = (await sql`
      SELECT requiere_supervision FROM incentive_config
      WHERE business_id = ${bId} AND effective_month <= ${month}
      ORDER BY effective_month DESC LIMIT 1
    `) as { requiere_supervision: boolean }[];
    return rows[0]?.requiere_supervision === true;
  } catch {
    return false;
  }
}

export type SedeSupervision = {
  businessId: number;
  sede: string;
  requisito: boolean;
  resumen: ResumenSupervisionMes;
};

export type ConsolaSupervision = {
  month: string;
  ahora: string;
  sedes: SedeSupervision[];
  visitas: VisitaVista[];
  observaciones: ObservacionVista[];
};

/** Todo lo que ve Juani: las dos sedes, el mes y las observaciones vivas. */
export async function getConsolaSupervision(month: string): Promise<Res<{ data: ConsolaSupervision }>> {
  if (!esMes(month)) return { ok: false, error: "Mes inválido." };
  if (!(await sesionPuede(null, "supervisar")).ok) return { ok: false, error: "Sin acceso a las supervisiones." };
  const ids = SEDES_SUPERVISADAS.map((s) => s.id);
  try {
    const ahora = new Date().toISOString();
    const [visitas, filas] = await Promise.all([leerVisitas(ids, month), leerObservaciones(ids, month)]);
    const sedes = await Promise.all(SEDES_SUPERVISADAS.map(async (s) => ({
      businessId: s.id, sede: s.nombre, requisito: await requisitoDelMes(s.id, month),
      resumen: resumen(s.id, month, visitas, filas, ahora),
    })));
    return { ok: true, data: { month, ahora, sedes, visitas, observaciones: filas.map((f) => aVista(f, ahora)) } };
  } catch (e) {
    console.error("[getConsolaSupervision] failed:", e);
    return { ok: false, error: "No se pudieron leer las supervisiones." };
  }
}

export type SupervisionDeSede = SedeSupervision & {
  month: string;
  ahora: string;
  observaciones: ObservacionVista[];
  ultimaVisita: VisitaVista | null;
};

/** Lo que ve el administrador en su panel (su sede, la activa). */
export async function getSupervisionDeSede(month: string): Promise<Res<{ data: SupervisionDeSede | null }>> {
  if (!esMes(month)) return { ok: false, error: "Mes inválido." };
  const bId = await activeBusinessId();
  if (!SEDES_SUPERVISADAS.some((s) => s.id === bId)) return { ok: true, data: null };
  if (!(await sesionPuede(bId, "ver")).ok) return { ok: false, error: "Sin acceso." };
  try {
    const ahora = new Date().toISOString();
    const [visitas, filas, requisito] = await Promise.all([
      leerVisitas([bId], month), leerObservaciones([bId], month), requisitoDelMes(bId, month),
    ]);
    return {
      ok: true,
      data: {
        businessId: bId, sede: nombreSede(bId), requisito, month, ahora,
        resumen: resumen(bId, month, visitas, filas, ahora),
        observaciones: filas.map((f) => aVista(f, ahora)),
        ultimaVisita: visitas[0] ?? null,
      },
    };
  } catch (e) {
    // Tabla sin migrar o BD caída: el panel sigue funcionando sin la tarjeta.
    console.error("[getSupervisionDeSede] failed:", e);
    return { ok: true, data: null };
  }
}

/**
 * Entrada del motor de incentivos: visitas y observaciones del mes de una
 * sede. null = sin permiso o sin datos legibles; el motor, sin esto,
 * bloquea el cierre en vez de pagar a ciegas.
 */
export async function getEntradaSupervision(
  bId: number,
  month: string,
): Promise<EntradaSupervision | null> {
  if (!esMes(month)) return null;
  const sesion = await sesionPuede(bId, "ver");
  if (!sesion.ok || sesion.role?.kind === "highlight") return null;
  try {
    const ahora = new Date().toISOString();
    const { inicio, fin } = limitesMes(month);
    const [visitas, filas] = await Promise.all([leerVisitas([bId], month), leerObservaciones([bId], month)]);
    return {
      visitas,
      observaciones: filas
        .filter((f) => f.fecha_visita >= inicio && f.fecha_visita <= fin)
        .map((f) => aObservacion(aVista(f, ahora), f)),
      ahoraISO: ahora,
    };
  } catch (e) {
    console.error("[getEntradaSupervision] failed:", e);
    return null;
  }
}

/* ─────────────────────────── Fotos ─────────────────────────── */

export type FotoSupervision = {
  id: string;
  tipo: TipoFotoSupervision;
  filename: string;
  contentType: string;
  createdAt: string;
  url: string;
};

export async function listarFotosObservacion(obsId: string): Promise<FotoSupervision[]> {
  const bId = await observacionBusinessId(obsId);
  if (bId === null || !(await sesionPuede(bId, "ver")).ok) return [];
  try {
    const rows = (await sql`
      SELECT id::text, record_type, filename, content_type, created_at::text
      FROM attachments
      WHERE record_id = ${obsId} AND record_type IN ('supervision_problema', 'supervision_correccion')
      ORDER BY created_at
    `) as { id: string; record_type: TipoFotoSupervision; filename: string; content_type: string; created_at: string }[];
    return rows.map((r) => ({
      id: r.id, tipo: r.record_type, filename: r.filename, contentType: r.content_type,
      createdAt: r.created_at, url: `/api/attachments/${r.id}`,
    }));
  } catch (e) {
    console.error("[listarFotosObservacion] failed:", e);
    return [];
  }
}

/**
 * Borrar una foto. La del problema la borra quien supervisa; la de la
 * corrección, el admin, y solo mientras la observación siga abierta: una
 * vez marcada corregida, esa foto es la prueba que Juani está revisando.
 */
export async function borrarFotoSupervision(id: string): Promise<Res> {
  if (!esUuid(id)) return { ok: false, error: "Foto inválida." };
  try {
    const rows = (await sql`
      SELECT a.url, a.record_type, o.business_id, o.estado
      FROM attachments a JOIN supervision_observations o ON o.id = a.record_id
      WHERE a.id = ${id} AND a.record_type IN ('supervision_problema', 'supervision_correccion')
    `) as { url: string; record_type: TipoFotoSupervision; business_id: number; estado: EstadoObservacion }[];
    const f = rows[0];
    if (!f) return { ok: false, error: "La foto no existe." };
    if (!(await sesionPuede(f.business_id, accionDeFoto(f.record_type))).ok) return { ok: false, error: "Sin permiso para borrar esta foto." };
    if (f.record_type === "supervision_correccion" && f.estado !== "abierta") {
      return { ok: false, error: "La corrección ya se envió a Juani: su foto no se puede borrar." };
    }
    await sql`DELETE FROM attachments WHERE id = ${id}`;
    await deletePrivateBlob(f.url).catch(() => undefined);
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[borrarFotoSupervision] failed:", e);
    return { ok: false, error: "No se pudo borrar la foto." };
  }
}
