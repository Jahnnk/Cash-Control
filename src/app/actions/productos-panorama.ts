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
  meses: { month: string; ventas: number; unidades: number; incompleto: boolean }[];
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
        meses: t.meses.map((m) => ({ month: m.month, ventas: m.ventas, unidades: m.unidades, incompleto: m.incompleto })),
        familias: t.familias.map((f) => ({ familia: f.familia as string, porMes: f.porMes.map((x) => ({ month: x.month, ventas: x.ventas })), ventas: f.ventas, pct: f.pct, variacionPct: f.variacionPct })),
        top: t.top.map((p) => ({ nombre: p.nombre, familia: p.familia as string, unidades: p.unidades, ingresos: p.ingresos, pctTrimestre: p.pctTrimestre })),
        suben: [...conVar].sort((a, b) => (b.variacionPct ?? 0) - (a.variacionPct ?? 0)).slice(0, 5).map((p) => ({ nombre: p.nombre, variacionPct: p.variacionPct, ingresos: p.ingresos })),
        bajan: [...conVar].sort((a, b) => (a.variacionPct ?? 0) - (b.variacionPct ?? 0)).slice(0, 5).map((p) => ({ nombre: p.nombre, variacionPct: p.variacionPct, ingresos: p.ingresos })),
      },
    };
  } catch (e) {
    console.error("[getTrimestreSede] failed:", e);
    return { ok: false, error: "No se pudo armar el resumen del trimestre." };
  }
}
