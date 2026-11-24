"use server";

/**
 * «Nueva receta» en 3 pasos · Actions (fase A de «recetas y precios en el sistema», pedido de Jahnn, 24-nov-2026:
 * «las casitas de jengibre me demoraron una hora en Excel; debería poder hacerlo en el sistema en 5 minutos»).
 *
 * No hay un motor nuevo: la receta de Atelier se guarda con guardarReceta (recetas_sistema), lo que va a la carta
 * con guardarProductoNuevo (carta_sistema) y el insumo nuevo como un precio más de insumos_precios (SKU SIS-A… /
 * SIS-C…). Lo único nuevo es el precio B2B (tabla precios_b2b). Precios sugeridos: lib/precios-sugeridos.ts.
 * Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { claveInsumo, leerArchivados, leerCatalogo, leerPreciosVigentes } from "@/lib/catalogo-costos-sql";
import { leerCartaConCostos } from "@/lib/carta-sql";
import { ARCHIVO_SISTEMA } from "@/lib/productos/precios-vigentes";
import { skuInsumoNuevo } from "@/lib/precios-sugeridos";
import { guardarReceta } from "@/app/actions/recetas";
import { guardarProductoNuevo } from "@/app/actions/carta";
import type { CostoPreparacion, DetalleReceta } from "@/lib/costos-preparaciones";
import type { RecetaSistema } from "@/lib/recetas";

const sql = neon(process.env.DATABASE_URL!);

type Origen = "Atelier" | "Cafetería";
export type InsumoOpcion = { sku: string; nombre: string; unidad: string; precio: number };

export type OpcionesNuevaReceta = {
  /** Lista de costos de Atelier (insumos, preparaciones y productos; Excel + sistema). */
  atelier: CostoPreparacion[];
  /** Lo que compra la cafetería, con su precio vigente. */
  insumosCafeteria: InsumoOpcion[];
  /** Lo que la cafetería le compra a Atelier: precio interno y lo que le cuesta a Atelier. */
  deAtelier: { ref: string; nombre: string; interno: number; costoReal: number | null }[];
  secciones: string[];
  /** Insumos archivados («origen|SKU»): no se ofrecen en el buscador, pero siguen costeando lo que ya los usa. */
  archivados: string[];
};

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");

export async function getOpcionesNuevaReceta(): Promise<{ ok: true; data: OpcionesNuevaReceta } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const [catalogo, { vigentes }, { costos }, archivados] = await Promise.all([leerCatalogo(sql, 1), leerPreciosVigentes(sql), leerCartaConCostos(sql), leerArchivados(sql)]);
    return {
      ok: true,
      data: {
        // Las sub-recetas y productos llevan su receta: en la pantalla se abren para ver (y cambiar) sus insumos.
        atelier: catalogo.efectivo.map((i) => (i.tipo === "insumo" ? { ...i, detalle: undefined } : i)),
        insumosCafeteria: vigentes.filter((v) => v.origen === "Cafetería").map((v) => ({ sku: v.sku, nombre: v.nombre, unidad: v.unidad, precio: v.precio })).sort(porNombre),
        deAtelier: costos.filter((c) => c.ref.startsWith("AT-") && c.costo > 0)
          .map((c) => ({ ref: c.ref, nombre: c.nombreCarta ?? c.nombre, interno: c.costo, costoReal: c.costoInsumos ?? null })).sort(porNombre),
        archivados: [...archivados],
        secciones: [...new Set(costos.map((c) => c.seccion).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "es")),
      },
    };
  } catch (e) {
    console.error("[getOpcionesNuevaReceta] failed:", e);
    return { ok: false, error: "No se pudo leer la lista de insumos." };
  }
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Crea un insumo que no está en el Excel (ej. jengibre en polvo) con su precio de compra desde hoy. Queda en
 * «Precios de insumos» como cualquier otro y se puede usar en todas las recetas de su lado (Atelier o cafetería).
 */
export async function crearInsumoNuevo(input: { origen: Origen; nombre: string; unidad: string; precio: number }): Promise<{ ok: true; insumo: InsumoOpcion } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  const origen = input?.origen;
  if (origen !== "Atelier" && origen !== "Cafetería") return { ok: false, error: "Elige si es de Atelier o de la cafetería." };
  const nombre = typeof input.nombre === "string" ? input.nombre.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (nombre.length < 2) return { ok: false, error: "Escribe el nombre del insumo." };
  const unidad = input.unidad;
  if (unidad !== "kg" && unidad !== "l" && unidad !== "und") return { ok: false, error: "Elige la unidad: kg, litro o unidad." };
  const precio = Math.round(Number(input.precio) * 10000) / 10000;
  if (!Number.isFinite(precio) || precio <= 0 || precio > 100000) return { ok: false, error: "Escribe un precio mayor que cero." };
  try {
    const { vigentes } = await leerPreciosVigentes(sql);
    const mismo = vigentes.find((v) => v.origen === origen && sinTildes(v.nombre) === sinTildes(nombre));
    if (mismo) {
      const archivado = (await leerArchivados(sql)).has(claveInsumo(mismo.origen, mismo.sku));
      return { ok: false, error: archivado
        ? `«${mismo.nombre}» ya existe pero está archivado: desarchívalo en «Precios de insumos».`
        : `«${mismo.nombre}» ya existe: búscalo en la lista.` };
    }
    const usados = (await sql`SELECT DISTINCT sku FROM insumos_precios WHERE origen = ${origen}`) as { sku: string }[];
    const sku = skuInsumoNuevo(origen, usados.map((u) => u.sku));
    const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    await sql`
      INSERT INTO insumos_precios (fecha, origen, sku, nombre, unidad, precio, archivo, fuente)
      VALUES (${fecha}::date, ${origen}, ${sku}, ${nombre}, ${unidad}, ${precio}, ${ARCHIVO_SISTEMA}, 'sistema')`;
    revalidatePath("/grupo/recetas");
    return { ok: true, insumo: { sku, nombre, unidad, precio } };
  } catch (e) {
    console.error("[crearInsumoNuevo] failed:", e);
    return { ok: false, error: "No se pudo crear el insumo. Intenta de nuevo." };
  }
}

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const precioOk = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100000;

/**
 * Guarda una receta nueva de Atelier y, si es un producto, sus precios: B2B (precios_b2b) y, si va a la
 * carta, el producto de la carta con su precio interno y su precio de carta (carta_sistema).
 */
export async function crearRecetaAtelier(input: {
  nombre: string;
  tipo: RecetaSistema["tipo"];
  detalle: DetalleReceta;
  b2b: number | null;
  carta: { interno: number; precio: number; seccion: string | null } | null;
}): Promise<{ ok: true; ref: string; avisos: string[] } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  const esProducto = input?.tipo === "producto";
  if (esProducto && input.b2b != null && !precioOk(input.b2b)) return { ok: false, error: "El precio B2B no es válido." };
  if (esProducto && input.carta && (!precioOk(input.carta.interno) || !precioOk(input.carta.precio))) {
    return { ok: false, error: "Escribe el precio interno y el precio de carta." };
  }
  const r = await guardarReceta({ id: null, nombre: input.nombre, tipo: input.tipo, categoria: null, detalle: input.detalle, reemplaza: null });
  if (!r.ok) return r;
  if (!esProducto) return { ok: true, ref: r.ref, avisos: [] };

  // La receta ya quedó: si algo de los precios falla, se avisa (no se pierde la receta).
  const avisos: string[] = [];
  const quien = role.nombre ?? (role.quien === "kelly" ? "Kelly" : "Jahnn");
  if (input.b2b != null) {
    try {
      await sql`
        INSERT INTO precios_b2b (ref, precio, actualizado_por) VALUES (${r.ref}, ${redondear2(input.b2b)}, ${quien})
        ON CONFLICT (ref) DO UPDATE SET precio = EXCLUDED.precio, actualizado_por = EXCLUDED.actualizado_por, actualizado_el = now()`;
    } catch (e) {
      console.error("[crearRecetaAtelier:b2b]", e);
      avisos.push("No se guardó el precio B2B.");
    }
  }
  if (input.carta) {
    const c = await guardarProductoNuevo({
      ref: null, nombre: input.nombre, seccion: input.carta.seccion, precio: input.carta.precio, costo: input.carta.interno,
      receta: { tipo: "atelier", recetaRef: r.ref },
    });
    if (!c.ok) avisos.push(`No se agregó a la carta: ${c.error}`);
  }
  return { ok: true, ref: r.ref, avisos };
}
