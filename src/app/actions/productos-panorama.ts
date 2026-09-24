"use server";

/**
 * Qué se vendió este mes · Actions.
 *
 * Pedido de Jahnn (21-sep-2026): que su informe de ventas de Fonavi (panorama
 * del mes, top 10 por ingresos y ranking de postres) esté también en el panel
 * de cada administrador, en el panel de Grupo y en el deck de la reunión.
 *
 * La fuente es la carga de los sábados: el reporte "Platos con mayor rotación"
 * de Byte que sube cada sede (`product_period_sales`). El mes es la suma de
 * sus períodos, y el rango que se muestra es el que de verdad está cargado —
 * nunca el mes entero si solo llegó hasta el día 19.
 *
 * Acceso: dirección ve las tres sedes; el administrador, solo la suya.
 */

import { neon } from "@neondatabase/serverless";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import { armarPanorama, type PanoramaProductos, type FilaProducto } from "@/lib/productos/panorama";
import { armarTrimestral, type InformeTrimestral } from "@/lib/productos/trimestral";
import type { PeriodoCargado } from "@/lib/productos/cobertura-rotacion";
import { armarCandidatos, type Archivado, type MotivoArchivo, type ResultadoCandidatos, type SedeCandidatos } from "@/lib/productos/candidatos";
import { claveByte, type CostoCarta } from "@/lib/productos/costos-carta";
import { semanasDeCortes, type Corte } from "@/lib/productos/semanas";

const sql = neon(process.env.DATABASE_URL!);

const SEDES: { id: number; nombre: string }[] = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];

export type PanoramaDeSede = {
  businessId: number;
  sede: string;
  /** null = esa sede todavía no tiene cargado el reporte del mes. */
  panorama: PanoramaProductos | null;
  /** Cuándo se subió el último reporte del mes (para saber qué tan fresco es). */
  cargadoEl: string | null;
};

type Res<T> = ({ ok: true } & T) | { ok: false; error: string };

function mesValido(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

/**
 * Las filas del mes que CUENTAN: `rotacion_efectiva` deja pasar todo lo que
 * subió dirección y, de la sede, solo los períodos que dirección no cubrió
 * (regla del 22-sep-2026). Antes de esa migración, todo cuenta igual.
 */
async function filasDelMes(bId: number, month: string): Promise<{ filas: FilaProducto[]; desde: string | null; hasta: string | null }> {
  try {
    const filas = (await sql`
      SELECT product_name_raw AS nombre, SUM(units)::float AS unidades, SUM(revenue)::float AS ingresos
      FROM rotacion_efectiva(${bId}, ${month}) GROUP BY 1
    `) as unknown as { nombre: string; unidades: number; ingresos: number }[];
    const r = (await sql`
      SELECT MIN(period_start)::text AS desde, MAX(period_end)::text AS hasta FROM rotacion_efectiva(${bId}, ${month})
    `) as unknown as { desde: string | null; hasta: string | null }[];
    return { filas, desde: r[0]?.desde ?? null, hasta: r[0]?.hasta ?? null };
  } catch {
    const filas = (await sql`
      SELECT product_name_raw AS nombre, SUM(units)::float AS unidades, SUM(revenue)::float AS ingresos
      FROM product_period_sales WHERE business_id = ${bId} AND month = ${month} GROUP BY 1
    `) as unknown as { nombre: string; unidades: number; ingresos: number }[];
    const r = (await sql`
      SELECT MIN(period_start)::text AS desde, MAX(period_end)::text AS hasta
      FROM product_period_sales WHERE business_id = ${bId} AND month = ${month}
    `) as unknown as { desde: string | null; hasta: string | null }[];
    return { filas, desde: r[0]?.desde ?? null, hasta: r[0]?.hasta ?? null };
  }
}

async function panoramaDe(bId: number, month: string): Promise<PanoramaProductos | null> {
  const { filas, desde, hasta } = await filasDelMes(bId, month);
  if (filas.length === 0 || !desde || !hasta) return null;
  return armarPanorama(filas, desde, hasta);
}

function mesesAntes(hasta: string, n: number): string[] {
  const [y, m] = hasta.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** El panorama de UNA sede (la activa, o la que pida dirección). */
export async function getPanoramaProductos(month: string, businessId?: number): Promise<Res<{ data: PanoramaDeSede }>> {
  if (!mesValido(month)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (!role) return { ok: false, error: "Sin acceso." };
  const bId = businessId ?? (await activeBusinessId());
  if (role.kind === "admin" && role.sede !== bId) return { ok: false, error: "Sin acceso a esta sede." };
  if (role.kind !== "admin" && role.kind !== "full") return { ok: false, error: "Sin acceso." };
  try {
    const [panorama, cargado] = await Promise.all([
      panoramaDe(bId, month),
      sql`SELECT MAX(imported_at)::text AS c FROM product_period_sales WHERE business_id = ${bId} AND month = ${month}` as unknown as Promise<{ c: string | null }[]>,
    ]);
    return {
      ok: true,
      data: {
        businessId: bId,
        sede: SEDES.find((s) => s.id === bId)?.nombre ?? `Sede ${bId}`,
        panorama,
        cargadoEl: cargado[0]?.c ?? null,
      },
    };
  } catch (e) {
    console.error("[getPanoramaProductos] failed:", e);
    return { ok: false, error: "No se pudo leer la rotación de productos." };
  }
}

/** Las tres sedes, para el panel de Grupo y el deck de la reunión. */
export async function getPanoramaProductosGrupo(month: string): Promise<Res<{ sedes: PanoramaDeSede[] }>> {
  if (!mesValido(month)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  try {
    const sedes = await Promise.all(SEDES.map(async (s) => {
      const [panorama, cargado] = await Promise.all([
        panoramaDe(s.id, month),
        sql`SELECT MAX(imported_at)::text AS c FROM product_period_sales WHERE business_id = ${s.id} AND month = ${month}` as unknown as Promise<{ c: string | null }[]>,
      ]);
      return { businessId: s.id, sede: s.nombre, panorama, cargadoEl: cargado[0]?.c ?? null };
    }));
    return { ok: true, sedes };
  } catch (e) {
    console.error("[getPanoramaProductosGrupo] failed:", e);
    return { ok: false, error: "No se pudo leer la rotación de productos." };
  }
}

/* ─────────────────────── Informe trimestral ─────────────────────── */

export type InformeTrimestralSede = {
  businessId: number;
  sede: string;
  meses: string[];
  informe: InformeTrimestral | null;
};

/**
 * El informe trimestral de una sede (el Excel de Jahnn dentro del sistema) y,
 * al lado, la comparación de las tres sedes en los mismos meses.
 */
export async function getInformeTrimestral(hastaMes: string, businessId?: number, meses = 3): Promise<
  Res<{ sede: InformeTrimestralSede; comparativo: { businessId: number; sede: string; ventas: number; unidades: number; familias: { familia: string; pct: number }[] }[] }>
> {
  if (!mesValido(hastaMes)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const bId = businessId ?? 2;
  const lista = mesesAntes(hastaMes, Math.min(12, Math.max(1, meses)));
  try {
    const armar = async (sede: number) => {
      const datos = await Promise.all(lista.map(async (month) => {
        const { filas, desde, hasta } = await filasDelMes(sede, month);
        return { month, desde: desde ?? `${month}-01`, hasta: hasta ?? `${month}-01`, filas };
      }));
      return datos.some((d) => d.filas.length > 0) ? armarTrimestral(datos) : null;
    };
    const [propio, ...resto] = await Promise.all([armar(bId), ...SEDES.filter((s) => s.id !== bId).map((s) => armar(s.id))]);
    const otras = SEDES.filter((s) => s.id !== bId);
    const comparativo = [
      { businessId: bId, sede: SEDES.find((s) => s.id === bId)?.nombre ?? `Sede ${bId}`, informe: propio },
      ...otras.map((s, i) => ({ businessId: s.id, sede: s.nombre, informe: resto[i] })),
    ]
      .filter((x) => x.informe)
      .map((x) => ({
        businessId: x.businessId, sede: x.sede,
        ventas: x.informe!.ventas, unidades: x.informe!.unidades,
        familias: x.informe!.familias.map((f) => ({ familia: f.familia as string, pct: f.pct })),
      }));
    return {
      ok: true,
      sede: { businessId: bId, sede: SEDES.find((s) => s.id === bId)?.nombre ?? `Sede ${bId}`, meses: lista, informe: propio },
      comparativo,
    };
  } catch (e) {
    console.error("[getInformeTrimestral] failed:", e);
    return { ok: false, error: "No se pudo armar el informe trimestral." };
  }
}

/* ─────────────────── Cruce de las dos fuentes ─────────────────── */

export type CruceFuentes = {
  businessId: number;
  sede: string;
  month: string;
  /** Lo que subió cada uno en ese mes (null = no subió nada). */
  sede_: { ventas: number; desde: string; hasta: string; cargadoEl: string } | null;
  direccion: { ventas: number; desde: string; hasta: string; cargadoEl: string } | null;
  /** Diferencia entre las dos cargas cuando cubren el mismo rango. */
  diferencia: number | null;
  aviso: string | null;
};

/** ¿Coinciden la carga del administrador y la de dirección? (doble check). */
export async function getCruceFuentes(month: string): Promise<Res<{ sedes: CruceFuentes[] }>> {
  if (!mesValido(month)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  try {
    const filas = (await sql`
      SELECT business_id, origen, MIN(period_start)::text AS desde, MAX(period_end)::text AS hasta,
             SUM(revenue)::float AS ventas, MAX(imported_at)::text AS cargado
      FROM product_period_sales WHERE month = ${month} AND business_id IN (1,2,3)
      GROUP BY 1, 2
    `) as unknown as { business_id: number; origen: string; desde: string; hasta: string; ventas: number; cargado: string }[];
    const sedes = SEDES.map((s) => {
      const de = (o: string) => {
        const f = filas.find((x) => x.business_id === s.id && x.origen === o);
        return f ? { ventas: Math.round(f.ventas * 100) / 100, desde: f.desde, hasta: f.hasta, cargadoEl: f.cargado } : null;
      };
      const carSede = de("sede");
      const carDir = de("direccion");
      let diferencia: number | null = null;
      let aviso: string | null = null;
      if (carSede && carDir) {
        diferencia = Math.round((carDir.ventas - carSede.ventas) * 100) / 100;
        const mismoRango = carSede.desde === carDir.desde && carSede.hasta === carDir.hasta;
        if (mismoRango && Math.abs(diferencia) >= 1) {
          aviso = `Las dos cargas cubren ${carSede.desde} → ${carSede.hasta} y difieren en S/${Math.abs(diferencia).toFixed(2)}: la de la sede trae ${diferencia > 0 ? "menos" : "más"}.`;
        } else if (!mismoRango) {
          aviso = `Cubren rangos distintos: la sede ${carSede.desde} → ${carSede.hasta}, dirección ${carDir.desde} → ${carDir.hasta}. Manda la de dirección.`;
        }
      } else if (!carSede && carDir) {
        aviso = "Solo hay carga de dirección: la sede no subió su reporte este mes.";
      } else if (carSede && !carDir) {
        aviso = null;
      }
      return { businessId: s.id, sede: s.nombre, month, sede_: carSede, direccion: carDir, diferencia, aviso };
    });
    return { ok: true, sedes };
  } catch (e) {
    console.error("[getCruceFuentes] failed:", e);
    return { ok: false, error: "No se pudo cruzar las fuentes." };
  }
}

/* ───────────── Versión corta para el panel del administrador ───────────── */

export type TrimestreSede = {
  sede: string;
  meses: { month: string; ventas: number; unidades: number; incompleto: boolean; sospechoso: boolean }[];
  familias: { familia: string; porMes: { month: string; ventas: number }[]; ventas: number; pct: number; variacionPct: number | null }[];
  top: { nombre: string; familia: string; unidades: number; ingresos: number; pctTrimestre: number }[];
  suben: { nombre: string; variacionPct: number | null; ingresos: number }[];
  bajan: { nombre: string; variacionPct: number | null; ingresos: number }[];
  ventas: number;
};

/**
 * Lo mismo que el trimestral, recortado para el administrador: sus meses, sus
 * familias, su top 10 y qué subió o cayó. Sin clase ABC, sin recomendaciones
 * de carta y sin comparación con otras sedes — eso es conversación de
 * dirección (decisión de Jahnn, 22-sep-2026).
 */
export async function getTrimestreSede(hastaMes: string): Promise<Res<{ data: TrimestreSede | null }>> {
  if (!mesValido(hastaMes)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (!role) return { ok: false, error: "Sin acceso." };
  const bId = await activeBusinessId();
  if (role.kind === "admin" && role.sede !== bId) return { ok: false, error: "Sin acceso a esta sede." };
  if (role.kind !== "admin" && role.kind !== "full") return { ok: false, error: "Sin acceso." };
  try {
    const lista = mesesAntes(hastaMes, 3);
    const datos = await Promise.all(lista.map(async (month) => {
      const { filas, desde, hasta } = await filasDelMes(bId, month);
      return { month, desde: desde ?? `${month}-01`, hasta: hasta ?? `${month}-01`, filas };
    }));
    if (!datos.some((d) => d.filas.length > 0)) return { ok: true, data: null };
    const t = armarTrimestral(datos);
    const conVar = t.productosTodos.filter((p) => p.variacionPct !== null && p.ingresos >= 100);
    return {
      ok: true,
      data: {
        sede: SEDES.find((s) => s.id === bId)?.nombre ?? `Sede ${bId}`,
        ventas: t.ventas,
        meses: t.meses.map((m) => ({ month: m.month, ventas: m.ventas, unidades: m.unidades, incompleto: m.incompleto, sospechoso: m.sospechoso })),
        familias: t.familias.map((f) => ({ familia: f.familia as string, porMes: f.porMes.map((x) => ({ month: x.month, ventas: x.ventas })), ventas: f.ventas, pct: f.pct, variacionPct: f.variacionPct })),
        top: t.top.map((p) => ({ nombre: p.nombre, familia: p.familia as string, unidades: p.unidades, ingresos: p.ingresos, pctTrimestre: p.pctTrimestre })),
        suben: conVar.filter((p) => (p.variacionPct ?? 0) >= 15).sort((a, b) => (b.variacionPct ?? 0) - (a.variacionPct ?? 0)).slice(0, 5)
          .map((p) => ({ nombre: p.nombre, variacionPct: p.variacionPct, ingresos: p.ingresos })),
        bajan: conVar.filter((p) => (p.variacionPct ?? 0) <= -15).sort((a, b) => (a.variacionPct ?? 0) - (b.variacionPct ?? 0)).slice(0, 5)
          .map((p) => ({ nombre: p.nombre, variacionPct: p.variacionPct, ingresos: p.ingresos })),
      },
    };
  } catch (e) {
    console.error("[getTrimestreSede] failed:", e);
    return { ok: false, error: "No se pudo armar el resumen del trimestre." };
  }
}

/* ─────────────── Qué hay cargado (la grilla de Grupo) ─────────────── */

/**
 * Los períodos cargados de las tres sedes en los últimos `meses` meses, con
 * quién los subió. La grilla y el aviso de "qué hará este archivo" salen de
 * acá (ver lib/productos/cobertura-rotacion.ts).
 */
export async function getCoberturaRotacion(meses = 6): Promise<Res<{ hoy: string; meses: string[]; periodos: PeriodoCargado[] }>> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const lista = mesesAntes(hoy.slice(0, 7), Math.min(12, Math.max(1, meses)));
  try {
    const filas = (await sql`
      SELECT business_id, month, origen, period_start::text AS desde, period_end::text AS hasta,
             SUM(revenue)::float AS ventas,
             (MAX(imported_at) AT TIME ZONE 'America/Lima')::date::text AS cargado
      FROM product_period_sales
      WHERE business_id IN (1, 2, 3) AND month = ANY(${lista}::text[])
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY 1, 2, 4
    `) as unknown as { business_id: number; month: string; origen: string; desde: string; hasta: string; ventas: number; cargado: string | null }[];
    return {
      ok: true,
      hoy,
      meses: lista,
      periodos: filas.map((f) => ({
        businessId: f.business_id, month: f.month, origen: f.origen === "direccion" ? "direccion" : "sede",
        desde: f.desde, hasta: f.hasta, ventas: Math.round(f.ventas * 100) / 100, cargadoEl: f.cargado,
      })),
    };
  } catch (e) {
    console.error("[getCoberturaRotacion] failed:", e);
    return { ok: false, error: "No se pudo leer qué está cargado." };
  }
}

/* ─────────────────── Candidatos a reemplazo ─────────────────── */

export type CandidatosReemplazo = ResultadoCandidatos & {
  /** Hasta qué día llega lo cargado de cada cafetería en el último mes. */
  hasta: { sede: string; hasta: string | null }[];
  /** Lista de costos de carta (para vincular a mano lo que no enlaza solo). */
  carta: { ref: string; nombre: string; costo: number; precio: number | null }[];
};

/**
 * Qué productos de la carta de Fonavi y Centro conviene reemplazar (motor en
 * lib/productos/candidatos.ts). Últimos 6 meses hasta `hastaMes`; decide con
 * los 3 más recientes. Solo dirección.
 */
export async function getCandidatosReemplazo(hastaMes: string): Promise<Res<{ data: CandidatosReemplazo }>> {
  if (!mesValido(hastaMes)) return { ok: false, error: "Mes inválido." };
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const lista = mesesAntes(hastaMes, 6);
  const cafeterias = SEDES.filter((s) => s.id === 2 || s.id === 3);
  try {
    const [costos, vinculos, acompanamientos, archivos] = await Promise.all([
      (sql`SELECT ref, nombre, nombre_carta AS "nombreCarta", categoria, costo::float AS costo, precio::float AS precio FROM costos_carta` as unknown as Promise<CostoCarta[]>).catch(() => [] as CostoCarta[]),
      (sql`SELECT clave, ref FROM carta_vinculos` as unknown as Promise<{ clave: string; ref: string }[]>).catch(() => []),
      (sql`SELECT DISTINCT regexp_replace(name, '\\s*\\((Fonavi|Centro)\\)\\s*$', '') AS name FROM products WHERE es_acompanamiento = true` as unknown as Promise<{ name: string }[]>).catch(() => []),
      (sql`
        SELECT clave, nombre, motivo, archivado_por AS "archivadoPor",
               to_char(archivado_el AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "archivadoEl"
        FROM productos_archivados
      ` as unknown as Promise<Archivado[]>).catch(() => [] as Archivado[]),
    ]);
    const hasta: { sede: string; hasta: string | null }[] = [];
    const sedes: SedeCandidatos[] = await Promise.all(cafeterias.map(async (s) => {
      const datos = await Promise.all(lista.map(async (month) => {
        const { filas, desde, hasta: h } = await filasDelMes(s.id, month);
        return { month, desde: desde ?? `${month}-01`, hasta: h ?? `${month}-01`, filas };
      }));
      const trim = armarTrimestral(datos);
      hasta.push({ sede: s.nombre, hasta: [...datos].reverse().find((d) => d.filas.length > 0)?.hasta ?? null });
      let cortes: Corte[] = [];
      try {
        cortes = ((await sql`
          SELECT origen, month, period_start::text AS "periodStart", period_end::text AS "periodEnd", cargado_el::text AS "cargadoEl",
                 product_name_raw AS nombre, units::float AS unidades, revenue::float AS ingresos
          FROM rotacion_cortes WHERE business_id = ${s.id} AND month = ANY(${lista}::text[])
        `) as unknown as Corte[]);
      } catch {
        cortes = []; // antes de la migración: sin semanas
      }
      return {
        businessId: s.id, sede: s.nombre, semanas: semanasDeCortes(cortes),
        meses: datos.map((d, i) => {
          const p = armarPanorama(d.filas, d.desde, d.hasta, 10);
          return {
            month: d.month, dias: d.filas.length > 0 ? p.dias : 0, sospechoso: trim.meses[i]?.sospechoso ?? false,
            carta: p.carta.map((c) => ({ nombre: c.nombre, familia: c.familia, unidades: c.unidades, ingresos: c.ingresos })),
          };
        }),
      };
    }));
    const r = armarCandidatos(sedes, costos, new Map(vinculos.map((v) => [v.clave, v.ref])), acompanamientos.map((a) => a.name), archivos);
    return {
      ok: true,
      data: { ...r, hasta, carta: costos.filter((c) => c.precio !== null).map((c) => ({ ref: c.ref, nombre: c.nombre, costo: c.costo, precio: c.precio })).sort((a, b) => a.nombre.localeCompare(b.nombre)) },
    };
  } catch (e) {
    console.error("[getCandidatosReemplazo] failed:", e);
    return { ok: false, error: "No se pudieron armar los candidatos a reemplazo." };
  }
}

/** "Este producto de Byte es este del Excel" (o quitar el vínculo con ref = null). */
export async function vincularCostoCarta(nombreByte: string, ref: string | null): Promise<Res<object>> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const clave = claveByte(nombreByte ?? "");
  if (!clave) return { ok: false, error: "Producto inválido." };
  try {
    if (ref === null) {
      await sql`DELETE FROM carta_vinculos WHERE clave = ${clave}`;
    } else {
      const existe = (await sql`SELECT 1 FROM costos_carta WHERE ref = ${ref}`) as unknown[];
      if (existe.length === 0) return { ok: false, error: "Ese producto ya no está en la lista de costos." };
      await sql`
        INSERT INTO carta_vinculos (clave, nombre_byte, ref, actualizado_por)
        VALUES (${clave}, ${nombreByte}, ${ref}, ${role.quien})
        ON CONFLICT (clave) DO UPDATE SET ref = EXCLUDED.ref, nombre_byte = EXCLUDED.nombre_byte,
          actualizado_por = EXCLUDED.actualizado_por, actualizado_el = NOW()`;
    }
    return { ok: true };
  } catch (e) {
    console.error("[vincularCostoCarta] failed:", e);
    return { ok: false, error: "No se pudo guardar el vínculo." };
  }
}

/**
 * Archiva productos de "Candidatos a reemplazo" (Jahnn confirmó que ya no se
 * venden o que ya los sacó de carta). Dejan de aparecer; si vuelven a
 * venderse en un mes posterior, reaparecen marcados.
 */
export async function archivarProductos(items: { nombre: string; motivo: MotivoArchivo }[]): Promise<Res<{ archivados: number }>> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const validos = (Array.isArray(items) ? items : [])
    .filter((i) => i?.nombre?.trim() && (i.motivo === "ya-no-se-vende" || i.motivo === "sacado-de-carta"))
    .map((i) => ({ clave: claveByte(i.nombre), nombre: i.nombre.trim(), motivo: i.motivo }))
    .filter((i) => i.clave)
    .slice(0, 500);
  if (validos.length === 0) return { ok: false, error: "No hay productos para archivar." };
  try {
    await sql`
      INSERT INTO productos_archivados (clave, nombre, motivo, archivado_por)
      SELECT t.clave, t.nombre, t.motivo, ${role.quien}
      FROM unnest(${validos.map((v) => v.clave)}::text[], ${validos.map((v) => v.nombre)}::text[], ${validos.map((v) => v.motivo)}::text[])
        AS t(clave, nombre, motivo)
      ON CONFLICT (clave) DO UPDATE SET motivo = EXCLUDED.motivo, archivado_por = EXCLUDED.archivado_por, archivado_el = NOW()`;
    return { ok: true, archivados: validos.length };
  } catch (e) {
    console.error("[archivarProductos] failed:", e);
    return { ok: false, error: "No se pudieron archivar." };
  }
}

/** Saca un producto de los archivados: vuelve a evaluarse con los demás. */
export async function restaurarProducto(clave: string): Promise<Res<object>> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  try {
    await sql`DELETE FROM productos_archivados WHERE clave = ${clave}`;
    return { ok: true };
  } catch (e) {
    console.error("[restaurarProducto] failed:", e);
    return { ok: false, error: "No se pudo restaurar." };
  }
}
