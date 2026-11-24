"use server";

/**
 * Grupo → Insumos · Actions (fase 1, pedido de Jahnn, 24-nov-2026: «de aquí parte todo»).
 *
 * Junta en una sola lista lo que se sabe de cada insumo: precio vigente y su historial (insumos_precios),
 * categoría, crítico y nombre corregido (insumos_ficha), cuánto se gasta al mes a través de lo que venden las
 * cafeterías (desglose de la carta × unidades, últimos 3 meses cerrados), qué recetas de Atelier y qué
 * productos de la carta lo usan, el mejor precio de Proveedores, si está conectado con Producción y si está
 * archivado. Motor: lib/insumos-ficha.ts. Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { claveInsumo, leerArchivados, leerCatalogo, leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { ARCHIVO_SISTEMA } from "@/lib/productos/precios-vigentes";
import type { AporteInsumo } from "@/lib/productos/desglose-insumos";
import { mejoresPorInsumo } from "@/lib/proveedores-sql";
import type { MejorProveedor } from "@/lib/proveedores";
import { getRentabilidadProductos } from "@/app/actions/productos-panorama";
import { CAFETERIAS } from "@/lib/productos/cafeterias";
import { productosParaSimular } from "@/lib/productos/simulador-insumos";
import {
  CATEGORIAS, categoriaDelSku, criticosPorGasto, esCritico, historialPorDia, mesesCerrados, ultimoCambio,
  type CambioPrecio, type PuntoPrecio,
} from "@/lib/insumos-ficha";

const sql = neon(process.env.DATABASE_URL!);

type Origen = "Atelier" | "Cafetería";

export type FichaInsumo = {
  origen: Origen;
  sku: string;
  nombre: string;
  /** El nombre del Excel cuando se corrigió aquí (null = no se corrigió). */
  nombreExcel: string | null;
  unidad: string;
  precio: number;
  /** Desde cuándo vale el precio. */
  fecha: string;
  delSistema: boolean;
  creadoAqui: boolean;
  categoria: string;
  /** La categoría se eligió aquí (no es la del Excel). */
  categoriaElegida: boolean;
  critico: boolean;
  /** La estrella puesta a mano (null = la decide el sistema). */
  criticoManual: boolean | null;
  criticoSugerido: boolean;
  /** Lo que se gasta al mes en este insumo por lo que venden las cafeterías (S/). */
  gastoMes: number;
  /** Su parte del gasto total en insumos (0–100). */
  pctGasto: number;
  /** Recetas de Atelier (preparaciones y productos) que lo llevan directo. */
  recetas: string[];
  /** Productos de la carta de las cafeterías que lo llevan. */
  productos: string[];
  proveedor: MejorProveedor | null;
  archivado: boolean;
  /** Atelier: conectado con un insumo de Producción. Cafetería: null (Producción es solo de Atelier). */
  produccion: boolean | null;
  historial: PuntoPrecio[];
  cambio: CambioPrecio | null;
};

export type DatosInsumos = {
  insumos: FichaInsumo[];
  /** Meses con los que se estimó el gasto (YYYY-MM). */
  meses: string[];
  gastoTotalMes: number;
  categorias: string[];
  hoy: string;
};

type Ficha = { origen: string; sku: string; categoria: string | null; critico: boolean | null; nombre: string | null };

const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Gasto mensual por insumo («origen|SKU»), promedio de los meses con ventas. */
async function gastoPorInsumo(meses: string[]): Promise<{ gasto: Map<string, number>; conDatos: string[] }> {
  const gasto = new Map<string, number>();
  const conDatos: string[] = [];
  const resultados = await Promise.all(meses.map((m) => getRentabilidadProductos(m, CAFETERIAS).catch(() => null)));
  resultados.forEach((r, i) => {
    if (!r?.ok || !r.data) return;
    conDatos.push(meses[i]);
    for (const p of productosParaSimular(r.data).productos) {
      // Lo de Atelier viene abierto en los insumos de Atelier; lo de la cafetería, en los suyos.
      const origen: Origen = p.deAtelier ? "Atelier" : "Cafetería";
      for (const x of p.desglose) {
        if (!x.sku?.trim()) continue;
        const k = claveInsumo(origen, x.sku.split("·")[0]);
        gasto.set(k, (gasto.get(k) ?? 0) + x.costo * p.unidadesMes);
      }
    }
  });
  if (conDatos.length > 1) for (const [k, g] of gasto) gasto.set(k, g / conDatos.length);
  return { gasto, conDatos };
}

export async function getInsumos(): Promise<{ ok: true; datos: DatosInsumos } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const hoy = hoyLima();
    const [{ vigentes }, fichas, archivados, catalogo, carta, mejores, parejas, fotos, gastos] = await Promise.all([
      leerPreciosVigentes(sql),
      (sql`SELECT origen, sku, categoria, critico, nombre FROM insumos_ficha` as unknown as Promise<Ficha[]>).catch(() => [] as Ficha[]),
      leerArchivados(sql),
      leerCatalogo(sql, 1),
      (sql`SELECT ref, COALESCE(nombre_carta, nombre) AS nombre, desglose FROM costos_carta WHERE desglose IS NOT NULL` as unknown as Promise<{ ref: string; nombre: string; desglose: AporteInsumo[] }[]>).catch(() => []),
      mejoresPorInsumo(sql).catch(() => new Map<string, MejorProveedor>()),
      (sql`SELECT cc_ref FROM recetas_produccion_parejas WHERE tipo = 'insumo'` as unknown as Promise<{ cc_ref: string | null }[]>).catch(() => []),
      (sql`SELECT fecha::text AS fecha, origen, sku, nombre, precio::float AS precio, archivo FROM insumos_precios
           WHERE fecha >= (CURRENT_DATE - INTERVAL '800 days')` as unknown as Promise<{ fecha: string; origen: string; sku: string; nombre: string; precio: number; archivo: string | null }[]>),
      gastoPorInsumo(mesesCerrados(hoy, 3)),
    ]);

    const ficha = new Map(fichas.map((f) => [claveInsumo(f.origen, f.sku), f]));
    const conectados = new Set(parejas.filter((p) => p.cc_ref?.trim()).map((p) => p.cc_ref!.trim().toUpperCase()));

    // Historial y nombre del Excel de cada insumo.
    const filasPorInsumo = new Map<string, { fecha: string; precio: number; sistema: boolean }[]>();
    const nombreExcel = new Map<string, string>();
    for (const f of [...fotos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const k = claveInsumo(f.origen, f.sku);
      filasPorInsumo.set(k, [...(filasPorInsumo.get(k) ?? []), { fecha: f.fecha, precio: f.precio, sistema: f.archivo === ARCHIVO_SISTEMA }]);
      if (f.archivo !== ARCHIVO_SISTEMA) nombreExcel.set(k, f.nombre);
      else if (!nombreExcel.has(k)) nombreExcel.set(k, f.nombre);
    }

    // Qué recetas de Atelier lo llevan directo.
    const recetas = new Map<string, Set<string>>();
    for (const item of catalogo.efectivo) {
      for (const ing of item.detalle?.ingredientes ?? []) {
        if (!ing.ref) continue;
        const k = claveInsumo("Atelier", ing.ref);
        recetas.set(k, (recetas.get(k) ?? new Set()).add(item.nombre));
      }
    }

    // Qué productos de la carta lo llevan.
    const productos = new Map<string, Set<string>>();
    for (const c of carta) {
      const origen = c.ref.startsWith("AT-") ? "Atelier" : "Cafetería";
      for (const a of c.desglose ?? []) {
        if (!a.sku) continue;
        const k = claveInsumo(origen, a.sku.split("·")[0]);
        productos.set(k, (productos.get(k) ?? new Set()).add(c.nombre));
      }
    }

    // Críticos sugeridos: entre los que no están archivados.
    const gastoActivos = new Map([...gastos.gasto].filter(([k]) => !archivados.has(k)));
    const sugeridos = criticosPorGasto(gastoActivos);
    const gastoTotalMes = [...gastoActivos.values()].reduce((t, g) => t + g, 0);

    const orden = (s: Set<string> | undefined) => [...(s ?? [])].sort((a, b) => a.localeCompare(b, "es"));
    const insumos: FichaInsumo[] = vigentes
      .filter((v): v is typeof v & { origen: Origen } => v.origen === "Atelier" || v.origen === "Cafetería")
      .map((v) => {
        const k = claveInsumo(v.origen, v.sku);
        const f = ficha.get(k);
        const gastoMes = gastoActivos.get(k) ?? 0;
        const historial = historialPorDia(filasPorInsumo.get(k) ?? []);
        const criticoSugerido = sugeridos.has(k);
        const excelNombre = nombreExcel.get(k) ?? v.nombre;
        return {
          origen: v.origen, sku: v.sku, nombre: v.nombre,
          nombreExcel: f?.nombre && f.nombre !== excelNombre ? excelNombre : null,
          unidad: v.unidad, precio: v.precio, fecha: v.fecha, delSistema: v.delSistema, creadoAqui: v.base == null && v.delSistema,
          categoria: f?.categoria || categoriaDelSku(v.sku), categoriaElegida: !!f?.categoria,
          critico: esCritico(f?.critico ?? null, criticoSugerido), criticoManual: f?.critico ?? null, criticoSugerido,
          gastoMes: r2(gastoMes), pctGasto: gastoTotalMes > 0 ? Math.round((gastoMes / gastoTotalMes) * 1000) / 10 : 0,
          recetas: v.origen === "Atelier" ? orden(recetas.get(k)) : [],
          productos: orden(productos.get(k)),
          proveedor: mejores.get(k) ?? null,
          archivado: archivados.has(k),
          produccion: v.origen === "Atelier" ? conectados.has(v.sku.trim().toUpperCase()) : null,
          historial,
          cambio: ultimoCambio(historial),
        };
      });

    const categorias = [...new Set([...CATEGORIAS, ...insumos.map((i) => i.categoria)])].sort((a, b) => a.localeCompare(b, "es"));
    return { ok: true, datos: { insumos, meses: gastos.conDatos, gastoTotalMes: r2(gastoTotalMes), categorias, hoy } };
  } catch (e) {
    console.error("[getInsumos] failed:", e);
    return { ok: false, error: "No se pudo leer la lista de insumos." };
  }
}

/**
 * Guarda lo que se decide de un insumo en su ficha: categoría, crítico (true/false a mano, null = que decida el
 * sistema) y nombre corregido (null = el del Excel). Solo cambia los campos que vienen. Solo dirección.
 */
export async function guardarFichaInsumo(input: {
  origen: string;
  sku: string;
  categoria?: string | null;
  critico?: boolean | null;
  nombre?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const { vigentes } = await leerPreciosVigentes(sql);
  const v = vigentes.find((x) => x.origen === input?.origen && x.sku === input?.sku);
  if (!v) return { ok: false, error: "No encontré ese insumo en la lista." };

  const limpio = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const tocaCategoria = input.categoria !== undefined;
  const tocaCritico = input.critico !== undefined;
  const tocaNombre = input.nombre !== undefined;
  const categoria = input.categoria == null ? null : limpio(input.categoria, 60) || null;
  const critico = input.critico === true ? true : input.critico === false ? false : null;
  const nombre = input.nombre == null ? null : limpio(input.nombre, 120) || null;
  if (tocaNombre && nombre != null && nombre.length < 2) return { ok: false, error: "Escribe el nombre." };
  if (tocaCritico && input.critico !== null && typeof input.critico !== "boolean") return { ok: false, error: "Valor inválido." };
  const quien = role.nombre ?? (role.quien === "kelly" ? "Kelly" : "Jahnn");
  try {
    await sql`
      INSERT INTO insumos_ficha (origen, sku, categoria, critico, nombre, actualizado_por)
      VALUES (${v.origen}, ${v.sku}, ${tocaCategoria ? categoria : null}, ${tocaCritico ? critico : null}, ${tocaNombre ? nombre : null}, ${quien})
      ON CONFLICT (origen, sku) DO UPDATE SET
        categoria = CASE WHEN ${tocaCategoria}::boolean THEN EXCLUDED.categoria ELSE insumos_ficha.categoria END,
        critico   = CASE WHEN ${tocaCritico}::boolean   THEN EXCLUDED.critico   ELSE insumos_ficha.critico   END,
        nombre    = CASE WHEN ${tocaNombre}::boolean    THEN EXCLUDED.nombre    ELSE insumos_ficha.nombre    END,
        actualizado_por = EXCLUDED.actualizado_por, actualizado_el = now()`;
  } catch (e) {
    console.error("[guardarFichaInsumo] failed:", e);
    return { ok: false, error: "No se pudo guardar. Intenta de nuevo." };
  }
  revalidatePath("/grupo/insumos");
  if (tocaNombre) revalidatePath("/grupo/recetas");
  return { ok: true };
}
