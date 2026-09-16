"use server";

/**
 * "Por definir": la bandeja donde Jahnn decide lo que el sistema no puede
 * clasificar solo. Qué se pregunta y por qué: src/lib/revision-clasificacion.ts.
 * Solo dirección.
 *
 * Una decisión se aplica YA (decisión de Jahnn, 16-sep-2026):
 *   · cambia el catálogo del sistema y/o mueve gastos de categoría;
 *   · para el punto de equilibrio manda sobre la lista de Kelly;
 *   · si contradice el Excel de Kelly, va a su lista de correcciones, que
 *     se cierra sola cuando su Excel ya dice lo mismo.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole } from "@/lib/session-access";
import { grupoAColumnas, type GrupoCategoria } from "@/lib/catalogo-categorias";
import { normGrupoPE, type TipoPE } from "@/lib/pe-kelly";
import { sincronizarRevisiones } from "@/lib/revision-clasificacion-sql";
import {
  kellyDebeCorregir, lineaParaKelly,
  type AlcanceRevision, type MotivoRevision, type DecisionCategoria, type DecisionGasto,
} from "@/lib/revision-clasificacion";

const sql = neon(process.env.DATABASE_URL!);

const SEDES = [
  { id: 1, nombre: "Atelier" },
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
];
const TIPOS: TipoPE[] = ["Fijo", "Variable", "Excluido"];
const GRUPOS: GrupoCategoria[] = ["fijo", "variable", "financiamiento", "fuera"];

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function quien(): Promise<string | null> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return null;
  return role.quien === "kelly" ? "Kelly" : "Jahnn";
}

export type ItemPorDefinir = {
  id: string;
  businessId: number;
  sede: string;
  alcance: AlcanceRevision;
  motivo: MotivoRevision;
  datos: Record<string, unknown>;
  estado: "pendiente" | "resuelta";
  decision: (DecisionCategoria | DecisionGasto | { automatica: string }) | null;
  decididoPor: string | null;
  decididoEn: string | null;
  kellyPendiente: boolean;
  kellyCorregidoEn: string | null;
};

export type BandejaPorDefinir = {
  pendientes: ItemPorDefinir[];
  /** Lo que Kelly tiene que pasar a su Excel, por sede. */
  paraKelly: { businessId: number; sede: string; lineas: string[] }[];
  resueltasRecientes: ItemPorDefinir[];
  /** Categorías de cada sede, para elegir a dónde mover un gasto. */
  categorias: Record<number, string[]>;
  sedesConListaKelly: number[];
};

function aItem(r: Record<string, unknown>): ItemPorDefinir {
  const bId = Number(r.business_id);
  return {
    id: String(r.id), businessId: bId, sede: SEDES.find((s) => s.id === bId)?.nombre ?? `Sede ${bId}`,
    alcance: r.alcance as AlcanceRevision, motivo: r.motivo as MotivoRevision, datos: r.datos as Record<string, unknown>,
    estado: r.estado as "pendiente" | "resuelta", decision: (r.decision as ItemPorDefinir["decision"]) ?? null,
    decididoPor: (r.decidido_por as string) ?? null, decididoEn: (r.decidido_en as string) ?? null,
    kellyPendiente: r.kelly_pendiente === true, kellyCorregidoEn: (r.kelly_corregido_en as string) ?? null,
  };
}

export async function getPorDefinir(): Promise<Res<{ data: BandejaPorDefinir }>> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  try {
    for (const s of SEDES) await sincronizarRevisiones(s.id);
    const rows = (await sql`
      SELECT id::text, business_id, alcance, motivo, datos, estado, decision, decidido_por, decidido_en::text,
             kelly_pendiente, kelly_corregido_en::text
      FROM clasificacion_revisiones
      WHERE estado = 'pendiente'
         OR (kelly_pendiente AND kelly_corregido_en IS NULL)
         OR decidido_en > now() - interval '30 days'
      ORDER BY business_id, (alcance = 'categoria') DESC, (datos->>'monto')::numeric DESC NULLS LAST
    `) as Record<string, unknown>[];
    const items = rows.map(aItem);
    const [cats, listas] = await Promise.all([
      sql`SELECT business_id, name FROM expense_categories WHERE is_active = true ORDER BY name` as unknown as Promise<{ business_id: number; name: string }[]>,
      sql`SELECT DISTINCT business_id FROM pe_categorias` as unknown as Promise<{ business_id: number }[]>,
    ]);
    const categorias: Record<number, string[]> = {};
    for (const c of cats) (categorias[c.business_id] ??= []).push(c.name);

    const paraKelly = SEDES.map((s) => ({
      businessId: s.id,
      sede: s.nombre,
      lineas: items
        .filter((i) => i.businessId === s.id && i.kellyPendiente && !i.kellyCorregidoEn && i.decision && !("automatica" in i.decision))
        .map((i) => lineaParaKelly({ alcance: i.alcance, datos: i.datos, decision: i.decision as DecisionCategoria | DecisionGasto })),
    })).filter((x) => x.lineas.length > 0);

    return {
      ok: true,
      data: {
        pendientes: items.filter((i) => i.estado === "pendiente"),
        paraKelly,
        resueltasRecientes: items.filter((i) => i.estado === "resuelta" && i.decididoPor !== "sistema").slice(0, 30),
        categorias,
        sedesConListaKelly: listas.map((l) => l.business_id),
      },
    };
  } catch (e) {
    console.error("[getPorDefinir] failed:", e);
    return { ok: false, error: "No se pudo cargar la bandeja (¿falta la migración de revisión de clasificación?)." };
  }
}

/** Número para el menú. Nunca rompe: sin tabla, 0. */
export async function contarPorDefinir(): Promise<number> {
  if (!(await quien())) return 0;
  try {
    const r = (await sql`SELECT COUNT(*)::int AS n FROM clasificacion_revisiones WHERE estado = 'pendiente'`) as { n: number }[];
    return r[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

async function leerItem(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = (await sql`
    SELECT id::text, business_id, alcance, motivo, clave, datos, estado, decision FROM clasificacion_revisiones WHERE id = ${id}
  `) as { id: string; business_id: number; alcance: AlcanceRevision; motivo: MotivoRevision; clave: string; datos: Record<string, unknown>; estado: string; decision: unknown }[];
  return rows[0] ?? null;
}

async function tipoKelly(bId: number, grupo: string): Promise<{ hayLista: boolean; tipo: TipoPE | null }> {
  const rows = (await sql`SELECT grupo_norm, tipo FROM pe_categorias WHERE business_id = ${bId}`) as { grupo_norm: string; tipo: TipoPE }[];
  return { hayLista: rows.length > 0, tipo: rows.find((r) => r.grupo_norm === normGrupoPE(grupo))?.tipo ?? null };
}

/** Crea la categoría en la sede si no existe, con su grupo. */
function asegurarCategoria(bId: number, nombre: string, grupo: GrupoCategoria) {
  const cols = grupoAColumnas(grupo);
  return sql`
    INSERT INTO expense_categories (business_id, name, is_active, cost_group, exclude_from_ebitda)
    VALUES (${bId}, ${nombre}, true, ${cols.costGroup}, ${cols.excludeFromEbitda})
    ON CONFLICT (business_id, name) DO NOTHING
  `;
}

const GRUPO_POR_TIPO: Record<TipoPE, GrupoCategoria> = { Fijo: "fijo", Variable: "variable", Excluido: "fuera" };

function refrescar() {
  revalidatePath("/grupo/por-definir");
  revalidatePath("/", "layout");
}

export async function resolverCategoria(id: string, decision: DecisionCategoria): Promise<Res> {
  const nombre = await quien();
  if (!nombre) return { ok: false, error: "Solo dirección." };
  if (!TIPOS.includes(decision.tipoPE) || !GRUPOS.includes(decision.grupoSistema)) return { ok: false, error: "Decisión incompleta." };
  const item = await leerItem(id);
  if (!item || item.alcance !== "categoria") return { ok: false, error: "No existe." };
  const bId = item.business_id;
  const grupo = String(item.datos.grupo ?? "");
  const categoria = String(item.datos.categoria ?? "");
  const destino = decision.categoriaDestino?.trim() || null;
  const objetivo = destino ?? categoria;
  const cols = grupoAColumnas(decision.grupoSistema);
  try {
    const k = await tipoKelly(bId, grupo);
    const kellyPendiente = kellyDebeCorregir(k.tipo, decision.tipoPE, k.hayLista);
    await sql.transaction([
      asegurarCategoria(bId, objetivo, decision.grupoSistema),
      // El grupo de la categoría en el sistema (EBITDA y reportes).
      sql`UPDATE expense_categories SET cost_group = ${cols.costGroup}, exclude_from_ebitda = ${cols.excludeFromEbitda}
          WHERE business_id = ${bId} AND name = ${objetivo}`,
      // Mover los gastos de este grupo a la categoría elegida.
      ...(destino ? [sql`
        UPDATE expenses SET category = ${destino}
         WHERE business_id = ${bId} AND category = ${categoria} AND archived = false
           AND norm_grupo(COALESCE(NULLIF(btrim(grupo_excel), ''), category)) = ${normGrupoPE(grupo)}
      `] : []),
      sql`
        UPDATE clasificacion_revisiones
           SET estado = 'resuelta', decision = ${JSON.stringify({ ...decision, categoriaDestino: destino })}::jsonb,
               decidido_por = ${nombre}, decidido_en = now(), kelly_pendiente = ${kellyPendiente}, kelly_corregido_en = NULL,
               actualizado_en = now()
         WHERE id = ${id}
      `,
    ]);
    await sincronizarRevisiones(bId);
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[resolverCategoria] failed:", e);
    return { ok: false, error: "No se pudo guardar la decisión." };
  }
}

export async function resolverGasto(id: string, decision: DecisionGasto): Promise<Res> {
  const nombre = await quien();
  if (!nombre) return { ok: false, error: "Solo dirección." };
  const item = await leerItem(id);
  if (!item || item.alcance !== "gasto") return { ok: false, error: "No existe." };
  const bId = item.business_id;
  try {
    if (decision.accion === "consultar") {
      const pregunta = decision.pregunta.trim();
      if (!pregunta) return { ok: false, error: "Escribe qué quieres preguntarle a Kelly." };
      await sql`
        UPDATE clasificacion_revisiones
           SET decision = ${JSON.stringify({ accion: "consultar", pregunta })}::jsonb, kelly_pendiente = true,
               decidido_por = ${nombre}, decidido_en = now(), actualizado_en = now()
         WHERE id = ${id}
      `;
      refrescar();
      return { ok: true };
    }
    if (decision.accion === "ok") {
      await sql`
        UPDATE clasificacion_revisiones
           SET estado = 'resuelta', decision = ${JSON.stringify(decision)}::jsonb, kelly_pendiente = false,
               decidido_por = ${nombre}, decidido_en = now(), actualizado_en = now()
         WHERE id = ${id}
      `;
      refrescar();
      return { ok: true };
    }
    if (!TIPOS.includes(decision.tipoPE)) return { ok: false, error: "Elige cómo cuenta el gasto." };
    const destino = decision.categoriaDestino?.trim() || null;
    const k = await tipoKelly(bId, String(item.datos.grupo ?? ""));
    // Sin lista de Kelly, el tipo del punto de equilibrio sale del catálogo:
    // reclasificar exige elegir la categoría.
    if (!k.hayLista && !destino) return { ok: false, error: "Elige a qué categoría pasa el gasto." };
    const kellyPendiente = kellyDebeCorregir(k.tipo, decision.tipoPE, k.hayLista);
    await sql.transaction([
      ...(destino ? [asegurarCategoria(bId, destino, GRUPO_POR_TIPO[decision.tipoPE])] : []),
      sql`
        UPDATE expenses SET tipo_pe = ${decision.tipoPE}, category = COALESCE(${destino}, category)
         WHERE business_id = ${bId} AND archived = false
           AND huella_gasto(business_id, date, amount, concept) = ${item.clave}
      `,
      sql`
        UPDATE clasificacion_revisiones
           SET estado = 'resuelta', decision = ${JSON.stringify({ ...decision, categoriaDestino: destino })}::jsonb,
               decidido_por = ${nombre}, decidido_en = now(), kelly_pendiente = ${kellyPendiente}, kelly_corregido_en = NULL,
               actualizado_en = now()
         WHERE id = ${id}
      `,
    ]);
    await sincronizarRevisiones(bId);
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[resolverGasto] failed:", e);
    return { ok: false, error: "No se pudo guardar la decisión." };
  }
}

/** Kelly avisó que ya lo corrigió (por si su Excel todavía no llegó). */
export async function marcarCorregidoPorKelly(id: string): Promise<Res> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "No existe." };
  await sql`UPDATE clasificacion_revisiones SET kelly_corregido_en = now(), actualizado_en = now() WHERE id = ${id}`;
  refrescar();
  return { ok: true };
}
