"use server";

/**
 * Ficha única de producto (fase 1 de «unificar pricing e ingeniería de menú», 25-nov-2026): la misma ventana se
 * abre desde Recetas y costos, Productos (matriz de la carta) y Dirección → Precios. Junta lo que ya vive en un
 * solo lugar cada uno: la receta y su costo (lista de costos de Atelier o receta de la cafetería), los precios de
 * venta (carta de las cafeterías + precios_b2b) y, aparte (getMenuDeProducto en productos-panorama), su lugar en
 * la matriz de la carta. Solo lee: cada dato se sigue cambiando en su pantalla.
 */

import { neon } from "@neondatabase/serverless";
import { getSessionRole, puedeLeerDireccion } from "@/lib/session-access";
import { leerCatalogo } from "@/lib/catalogo-costos-sql";
import { leerCambiosCarta, leerCartaConCostos } from "@/lib/carta-sql";
import { costoIngrediente } from "@/lib/recetas";
import type { CostoPreparacion } from "@/lib/costos-preparaciones";
import { enlazarCosto, type CostoCarta } from "@/lib/productos/costos-carta";

const sql = neon(process.env.DATABASE_URL!);
const ATELIER = 1;

export type LineaFicha = { nombre: string; cantidad: number | null; unidad: string | null; costo: number | null; tipo: "insumo" | "preparacion" | "producto" | null };

export type DatosFicha = {
  nombre: string;
  /** Atelier = lo produce Atelier (va por precio interno a las cafeterías y a B2B); Cafetería = se prepara en tienda. */
  origen: "Atelier" | "Cafetería";
  seccion: string | null;
  /** Ref en la carta de las cafeterías (null = no está en la carta). */
  cartaRef: string | null;
  /** Ref de la receta en la lista de costos de Atelier (para «Editar receta»). */
  recetaRef: string | null;
  /** Costo por unidad: en Atelier, sus insumos; en la cafetería, su receta. null = sin costo. */
  costo: number | null;
  precios: { interno: number | null; carta: number | null; b2b: number | null };
  rendimiento: number | null;
  merma: number;
  ingredientes: LineaFicha[];
  /** Por qué la receta no se ve (ej. el Excel no la trae). */
  sinReceta: string | null;
};

/** Uno de los tres: ref de la carta, ref de la receta, o el nombre con que lo vende Byte (matriz y Precios). */
type Pedido = { cartaRef?: string | null; recetaRef?: string | null; nombreByte?: string | null };

/** La receta de Atelier que corresponde a una ref (la del Excel o la versión hecha en el sistema). */
function recetaPorRef(efectivo: CostoPreparacion[], ref: string): CostoPreparacion | null {
  return efectivo.find((i) => i.ref === ref && i.tipo !== "insumo") ?? efectivo.find((i) => i.reemplaza === ref && i.tipo !== "insumo") ?? null;
}

export async function getFichaProducto(pedido: Pedido): Promise<{ ok: true; ficha: DatosFicha } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!puedeLeerDireccion(role)) return { ok: false, error: "Solo dirección." };
  if (!pedido?.cartaRef && !pedido?.recetaRef && !pedido?.nombreByte) return { ok: false, error: "Falta el producto." };
  try {
    const [catalogo, { costos, vinculos }, cambios, b2b] = await Promise.all([
      leerCatalogo(sql, ATELIER),
      leerCartaConCostos(sql),
      leerCambiosCarta(sql),
      (sql`SELECT ref, precio::float AS precio FROM precios_b2b` as unknown as Promise<{ ref: string; precio: number }[]>).catch(() => []),
    ]);
    const efectivo = catalogo.efectivo;
    const porRef = new Map<string, CostoPreparacion>();
    for (const i of efectivo) { porRef.set(i.ref, i); if (i.reemplaza) porRef.set(i.reemplaza, i); }
    // Producto nuevo de la carta → su receta de Atelier (AT-S001 → REC:5).
    const recetaDeCarta = new Map<string, string>();
    for (const c of cambios) if (c.nuevo && c.receta?.tipo === "atelier" && c.receta.recetaRef) recetaDeCarta.set(c.ref, c.receta.recetaRef);

    // 1) Quién es: carta y receta, partiendo de lo que se tenga.
    let carta: CostoCarta | null = pedido.cartaRef ? costos.find((c) => c.ref === pedido.cartaRef) ?? null
      // Desde Byte: el mismo enlace que usa la matriz para ponerle costo (vínculo a mano o por nombre).
      : pedido.nombreByte ? enlazarCosto(pedido.nombreByte, costos, vinculos)?.item ?? null : null;
    if (pedido.nombreByte && !carta && !pedido.recetaRef) return { ok: false, error: `«${pedido.nombreByte}» no está enlazado a la carta: conéctalo en Productos para ver su receta y precios.` };
    let receta: CostoPreparacion | null = null;
    if (pedido.recetaRef) receta = recetaPorRef(efectivo, pedido.recetaRef);
    else if (carta) {
      const r = recetaDeCarta.get(carta.ref) ?? (carta.ref.startsWith("AT-") ? carta.ref : null);
      receta = r ? recetaPorRef(efectivo, r) : null;
    }
    if (!carta && receta) {
      const refs = new Set([receta.ref, receta.reemplaza].filter(Boolean) as string[]);
      carta = costos.find((c) => { const r = recetaDeCarta.get(c.ref); return r ? refs.has(r) : refs.has(c.ref); }) ?? null;
    }
    if (!carta && !receta) return { ok: false, error: "No encontré ese producto." };

    // 2) Atelier o cafetería: lo de Atelier tiene receta en la lista de costos o ref AT-.
    const deAtelier = !!receta || !!carta?.ref.startsWith("AT-");
    const b2bDe = (refs: (string | null | undefined)[]) => {
      for (const r of refs) { const p = b2b.find((x) => x.ref === r)?.precio; if (p && p > 0) return p; }
      return null;
    };
    const enCarta = carta && carta.enCarta !== false;
    const precios = {
      interno: deAtelier && enCarta && carta!.costo > 0 ? carta!.costo : null,
      carta: enCarta && carta!.precio && carta!.precio > 0 ? carta!.precio : null,
      b2b: deAtelier ? b2bDe([receta?.ref, receta?.reemplaza, carta?.ref]) : null,
    };

    // 3) La receta, con el costo de cada línea.
    let ingredientes: LineaFicha[] = [];
    let sinReceta: string | null = null;
    if (receta) {
      const d = receta.detalle;
      if (d && d.ingredientes.length > 0) {
        ingredientes = d.ingredientes.map((g) => {
          const item = g.ref ? porRef.get(g.ref) ?? null : null;
          return { nombre: item?.nombre ?? g.nombre, cantidad: g.cantidad, unidad: g.unidad, costo: item ? costoIngrediente(item, g.cantidad, g.unidad) : null, tipo: item?.tipo ?? null };
        });
      } else sinReceta = "El Excel no trae su receta: solo su costo.";
    } else if (carta?.desglose && carta.desglose.length > 0) {
      // Cafetería: lo que aporta cada insumo a una unidad (sin cantidades: así lo trae el Excel).
      ingredientes = carta.desglose.map((a) => ({ nombre: a.nombre, cantidad: null, unidad: null, costo: a.costo, tipo: "insumo" as const }));
    } else sinReceta = deAtelier ? "Todavía no tiene receta en el sistema." : "El Excel no trae el detalle de su receta.";

    const costo = receta ? (receta.costo > 0 ? receta.costo : null) : carta ? (carta.costoInsumos ?? (carta.costo > 0 ? carta.costo : null)) : null;
    return {
      ok: true,
      ficha: {
        nombre: carta?.nombreCarta || carta?.nombre || receta!.nombre,
        origen: deAtelier ? "Atelier" : "Cafetería",
        seccion: carta?.seccion ?? null,
        cartaRef: carta?.ref ?? null,
        recetaRef: receta?.ref ?? null,
        costo,
        precios,
        rendimiento: receta?.detalle?.rendimiento ?? null,
        merma: receta?.detalle?.merma ?? 0,
        ingredientes,
        sinReceta,
      },
    };
  } catch (e) {
    console.error("[getFichaProducto]", e);
    return { ok: false, error: "No se pudo armar la ficha del producto." };
  }
}
