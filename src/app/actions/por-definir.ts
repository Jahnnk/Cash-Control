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
import { grupoAColumnas, grupoDelCatalogo, type GrupoCategoria } from "@/lib/catalogo-categorias";
import { enListaUnica, type Opinion } from "@/lib/clasificador-gasto";
import { tipoDeCategoria } from "@/lib/reglas-gasto";
import { normGrupoPE, type TipoPE } from "@/lib/pe-kelly";
import { sincronizarRevisiones, inicioRevision } from "@/lib/revision-clasificacion-sql";
import {
  kellyDebeCorregir, lineaParaKelly, textoDeRegla, claveConcepto,
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

/** Nombre de categoría como lo guarda el catálogo: MAYÚSCULAS y espacios simples. */
function nombreCategoria(t: string | null | undefined): string | null {
  const n = String(t ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return n.length > 0 ? n.slice(0, 60) : null;
}

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
  /** Lo que Kelly tiene que pasar a su Excel, por sede (correcciones y reglas nuevas para su pestaña REGLAS). */
  paraKelly: { businessId: number; sede: string; lineas: string[]; reglas: string[] }[];
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

    // Reglas que enseñó Jahnn y Kelly todavía no pasó a la pestaña REGLAS de su Excel.
    let reglasNuevas: { business_id: number; texto: string; categoria: string }[] = [];
    try {
      reglasNuevas = (await sql`
        SELECT business_id, texto, categoria FROM reglas_aprendidas WHERE activo AND en_excel_en IS NULL ORDER BY creado_en
      `) as typeof reglasNuevas;
    } catch { /* migración pendiente */ }

    const paraKelly = SEDES.map((s) => ({
      businessId: s.id,
      sede: s.nombre,
      lineas: items
        .filter((i) => i.businessId === s.id && i.kellyPendiente && !i.kellyCorregidoEn && i.decision && !("automatica" in i.decision))
        .map((i) => lineaParaKelly({ alcance: i.alcance, datos: i.datos, decision: i.decision as DecisionCategoria | DecisionGasto })),
      reglas: reglasNuevas
        .filter((r) => r.business_id === s.id)
        .map((r) => `• Agregar a la pestaña REGLAS: los conceptos que dicen «${r.texto}» → ${r.categoria}.`),
    })).filter((x) => x.lineas.length > 0 || x.reglas.length > 0);

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
  const destino = nombreCategoria(decision.categoriaDestino);
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
    const destino = nombreCategoria(decision.categoriaDestino);
    const grupoNueva = decision.grupoSistema && GRUPOS.includes(decision.grupoSistema) ? decision.grupoSistema : GRUPO_POR_TIPO[decision.tipoPE];
    const k = await tipoKelly(bId, String(item.datos.grupo ?? ""));
    // Sin lista de Kelly, el tipo del punto de equilibrio sale del catálogo:
    // reclasificar exige elegir la categoría.
    if (!k.hayLista && !destino) return { ok: false, error: "Elige a qué categoría pasa el gasto." };
    const kellyPendiente = kellyDebeCorregir(k.tipo, decision.tipoPE, k.hayLista);
    await sql.transaction([
      ...(destino ? [asegurarCategoria(bId, destino, grupoNueva)] : []),
      sql`
        UPDATE expenses SET tipo_pe = ${decision.tipoPE}, category = COALESCE(${destino}, category)
         WHERE business_id = ${bId} AND archived = false
           AND huella_gasto(business_id, date, amount, concept) = ${item.clave}
      `,
      sql`
        UPDATE clasificacion_revisiones
           SET estado = 'resuelta', decision = ${JSON.stringify({ accion: "reclasificar", tipoPE: decision.tipoPE, categoriaDestino: destino })}::jsonb,
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

/* ─────────────────────────── Clasificador experto ─────────────────────────── */

export type DecisionConflicto = {
  /** Una categoría de la lista única. */
  categoria: string;
  /** Enseñar la regla: todos los gastos de la sede cuyo concepto dice este texto van en `categoria`. */
  regla?: string | null;
};

/**
 * Decide un gasto en el que el clasificador experto dudaba. Se aplica YA
 * (categoría del gasto; el punto de equilibrio sale de ella) y, si Jahnn
 * enseña la regla, también a los gastos parecidos de la sede y a los que
 * lleguen en cada Excel (reaplicarDecisionesSQL).
 */
export async function resolverConflicto(id: string, d: DecisionConflicto): Promise<Res<{ afectados: number }>> {
  const nombre = await quien();
  if (!nombre) return { ok: false, error: "Solo dirección." };
  const categoria = nombreCategoria(d.categoria);
  if (!categoria || !enListaUnica(categoria)) return { ok: false, error: "Elige una categoría de la lista." };
  // "No se sabe" (POR ACLARAR, tipo Desconocido) es una decisión válida pero no se enseña como regla.
  if (categoria === "POR ACLARAR" && d.regla) return { ok: false, error: "Lo desconocido no se enseña como regla." };
  const item = await leerItem(id);
  if (!item || item.alcance !== "gasto") return { ok: false, error: "No existe." };
  const bId = item.business_id;
  const texto = d.regla ? textoDeRegla(d.regla) : null;
  if (texto !== null && texto.length < 4) return { ok: false, error: "El texto de la regla es muy corto: tomaría gastos que no son." };
  const tipo = tipoDeCategoria(categoria);
  // Lo desconocido cuenta como fijo en el punto de equilibrio (lib/fixed-variable.ts).
  const tipoPE: TipoPE = tipo === "Fijo" || tipo === "Desconocido" ? "Fijo" : tipo === "Variable" ? "Variable" : "Excluido";
  const grupo = grupoDelCatalogo(categoria) ?? GRUPO_POR_TIPO[tipoPE];
  // Si el Excel decía otra cosa, Kelly tiene que corregirlo allá.
  const excel = ((item.datos.opiniones as Opinion[] | undefined) ?? []).find((o) => o.fuente === "excel");
  const kellyPendiente = !!excel && excel.categoria !== categoria;
  const decision = { accion: "reclasificar", tipoPE, categoriaDestino: categoria, regla: texto };
  try {
    const afectados = texto
      ? ((await sql`
          SELECT COUNT(*)::int AS n FROM expenses
          WHERE business_id = ${bId} AND archived = false AND tipo_pe IS NULL AND category <> ${categoria}
            AND position(${texto} in norm_grupo(concepto_norm(concept))) > 0
        `) as { n: number }[])[0]?.n ?? 0
      : 0;
    await sql.transaction([
      asegurarCategoria(bId, categoria, grupo),
      sql`
        UPDATE expenses SET category = ${categoria}, tipo_pe = ${tipoPE}
         WHERE business_id = ${bId} AND archived = false
           AND huella_gasto(business_id, date, amount, concept) = ${item.clave}
      `,
      ...(texto ? [
        sql`
          INSERT INTO reglas_aprendidas (business_id, texto, categoria, creado_por, origen)
          VALUES (${bId}, ${texto}, ${categoria}, ${nombre}, ${JSON.stringify({ fecha: item.datos.fecha, monto: item.datos.monto, concepto: item.datos.concepto })}::jsonb)
          ON CONFLICT (business_id, texto) DO UPDATE
            SET categoria = EXCLUDED.categoria, activo = true, creado_por = EXCLUDED.creado_por, creado_en = now(), en_excel_en = NULL
        `,
        // Los gastos parecidos de la sede (salvo los que Jahnn decidió uno por uno).
        sql`
          UPDATE expenses SET category = ${categoria}
           WHERE business_id = ${bId} AND archived = false AND tipo_pe IS NULL
             AND position(${texto} in norm_grupo(concepto_norm(concept))) > 0
        `,
      ] : []),
      sql`
        UPDATE clasificacion_revisiones
           SET estado = 'resuelta', decision = ${JSON.stringify(decision)}::jsonb,
               decidido_por = ${nombre}, decidido_en = now(), kelly_pendiente = ${kellyPendiente}, kelly_corregido_en = NULL,
               actualizado_en = now()
         WHERE id = ${id}
      `,
    ]);
    await sincronizarRevisiones(bId);
    refrescar();
    return { ok: true, afectados };
  } catch (e) {
    console.error("[resolverConflicto] failed:", e);
    return { ok: false, error: "No se pudo guardar la decisión." };
  }
}

/** Kelly ya pasó las reglas nuevas de una sede a la pestaña REGLAS de su Excel. */
export async function marcarReglasEnExcel(businessId: number): Promise<Res> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  if (![1, 2, 3].includes(businessId)) return { ok: false, error: "Sede inválida." };
  await sql`UPDATE reglas_aprendidas SET en_excel_en = now() WHERE business_id = ${businessId} AND en_excel_en IS NULL`;
  refrescar();
  return { ok: true };
}

/** Kelly avisó que ya lo corrigió (por si su Excel todavía no llegó). */
export async function marcarCorregidoPorKelly(id: string): Promise<Res> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "No existe." };
  await sql`UPDATE clasificacion_revisiones SET kelly_corregido_en = now(), actualizado_en = now() WHERE id = ${id}`;
  refrescar();
  return { ok: true };
}

/* ─────────────────────────── Separar gastos de un grupo ─────────────────────────── */

export type GastoDelGrupo = {
  huella: string;
  fecha: string;
  monto: number;
  concepto: string | null;
};

export type SeparacionDelGrupo = {
  id: string;
  /** null = un solo pago. */
  texto: string | null;
  concepto: string | null;
  tipoPE: TipoPE;
  categoriaDestino: string | null;
  pagos: number;
  monto: number;
};

/**
 * Todos los gastos de la tarjeta de un grupo (no solo los 3 ejemplos), y lo
 * que ya se separó de él. Misma ventana que la bandeja.
 */
export async function getGastosDeGrupo(id: string): Promise<Res<{ gastos: GastoDelGrupo[]; separados: SeparacionDelGrupo[] }>> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  const item = await leerItem(id);
  if (!item || item.alcance !== "categoria") return { ok: false, error: "No existe." };
  const bId = item.business_id;
  const grupo = String(item.datos.grupo ?? "");
  const categoria = String(item.datos.categoria ?? "");
  try {
    const [gastos, separados] = await Promise.all([
      sql`
        SELECT huella_gasto(business_id, date, amount, concept) AS huella, date::text AS fecha, amount::float AS monto, concept AS concepto
        FROM expenses
        WHERE business_id = ${bId} AND archived = false AND payment_method <> 'pendiente_atelier'
          AND date >= ${inicioRevision()} AND category = ${categoria} AND tipo_pe IS NULL
          AND norm_grupo(COALESCE(NULLIF(btrim(grupo_excel), ''), category)) = ${normGrupoPE(grupo)}
        ORDER BY date DESC, amount DESC
      ` as unknown as Promise<GastoDelGrupo[]>,
      sql`
        SELECT r.id::text, r.alcance, r.datos, r.decision,
               (SELECT COUNT(*)::int FROM expenses e WHERE e.business_id = r.business_id AND e.archived = false AND (
                  (r.alcance = 'gasto' AND huella_gasto(e.business_id, e.date, e.amount, e.concept) = r.clave)
                  OR (r.alcance = 'concepto' AND e.tipo_pe IS NOT NULL AND position(r.datos->>'texto' in norm_grupo(concepto_norm(e.concept))) > 0
                      AND e.category = COALESCE(NULLIF(r.decision->>'categoriaDestino', ''), r.datos->>'categoria')))) AS pagos,
               (SELECT COALESCE(SUM(e.amount), 0)::float FROM expenses e WHERE e.business_id = r.business_id AND e.archived = false AND (
                  (r.alcance = 'gasto' AND huella_gasto(e.business_id, e.date, e.amount, e.concept) = r.clave)
                  OR (r.alcance = 'concepto' AND e.tipo_pe IS NOT NULL AND position(r.datos->>'texto' in norm_grupo(concepto_norm(e.concept))) > 0
                      AND e.category = COALESCE(NULLIF(r.decision->>'categoriaDestino', ''), r.datos->>'categoria')))) AS monto
        FROM clasificacion_revisiones r
        WHERE r.business_id = ${bId} AND r.motivo = 'separado' AND r.datos->>'origen' = ${item.clave}
        ORDER BY r.decidido_en DESC
      ` as unknown as Promise<{ id: string; alcance: string; datos: Record<string, unknown>; decision: { tipoPE: TipoPE; categoriaDestino: string | null }; pagos: number; monto: number }[]>,
    ]);
    return {
      ok: true,
      gastos,
      separados: separados.map((s) => ({
        id: s.id,
        texto: s.alcance === "concepto" ? String(s.datos.texto ?? "") : null,
        concepto: (s.datos.concepto as string | null) ?? null,
        tipoPE: s.decision.tipoPE,
        categoriaDestino: s.decision.categoriaDestino ?? null,
        pagos: s.pagos,
        monto: s.monto,
      })),
    };
  } catch (e) {
    console.error("[getGastosDeGrupo] failed:", e);
    return { ok: false, error: "No se pudieron leer los gastos del grupo." };
  }
}

export type SepararGastos = {
  /** Un solo pago (su huella)… */
  huella?: string | null;
  /** …o todos los de la categoría cuyo concepto dice este texto (vale también para los meses que vengan). */
  texto?: string | null;
  tipoPE: TipoPE;
  categoriaDestino: string | null;
  /** Solo si la categoría destino es nueva. */
  grupoSistema?: GrupoCategoria | null;
};

/**
 * Saca gastos de un grupo y los clasifica aparte. Queda guardado como una
 * decisión más ("separado"): cada importación la vuelve a aplicar
 * (reaplicarDecisionesSQL) y esos gastos ya no aparecen en ninguna pregunta.
 */
export async function separarGastos(id: string, s: SepararGastos): Promise<Res<{ pagos: number }>> {
  const nombre = await quien();
  if (!nombre) return { ok: false, error: "Solo dirección." };
  if (!TIPOS.includes(s.tipoPE)) return { ok: false, error: "Elige cómo cuenta en el punto de equilibrio." };
  const item = await leerItem(id);
  if (!item || item.alcance !== "categoria") return { ok: false, error: "No existe." };
  const bId = item.business_id;
  const grupo = String(item.datos.grupo ?? "");
  const categoria = String(item.datos.categoria ?? "");
  const destino = nombreCategoria(s.categoriaDestino);
  const texto = s.texto ? textoDeRegla(s.texto) : null;
  const huella = !texto && s.huella && /^[0-9a-f]{32}$/.test(s.huella) ? s.huella : null;
  if (!texto && !huella) return { ok: false, error: "Elige qué pagos separar." };
  if (texto && texto.length < 4) return { ok: false, error: "El texto es muy corto: separaría pagos que no son." };
  if (!destino) return { ok: false, error: "Elige a qué categoría van." };
  if (destino === categoria) return { ok: false, error: "Ya están en esa categoría." };
  const grupoNueva = s.grupoSistema && GRUPOS.includes(s.grupoSistema) ? s.grupoSistema : GRUPO_POR_TIPO[s.tipoPE];

  try {
    // Qué pagos toca (todas las fechas, no solo la ventana de la bandeja).
    const afectados = (texto
      ? await sql`
          SELECT date::text AS fecha, amount::float AS monto, concept AS concepto FROM expenses
          WHERE business_id = ${bId} AND archived = false AND category = ${categoria}
            AND position(${texto} in norm_grupo(concepto_norm(concept))) > 0
        `
      : await sql`
          SELECT date::text AS fecha, amount::float AS monto, concept AS concepto FROM expenses
          WHERE business_id = ${bId} AND archived = false AND huella_gasto(business_id, date, amount, concept) = ${huella}
        `) as { fecha: string; monto: number; concepto: string | null }[];
    if (afectados.length === 0) return { ok: false, error: "No encontré pagos con ese texto en esta categoría." };

    const k = await tipoKelly(bId, grupo);
    const kellyPendiente = kellyDebeCorregir(k.tipo, s.tipoPE, k.hayLista);
    const alcance = texto ? "concepto" : "gasto";
    const clave = texto ? claveConcepto(categoria, texto) : huella!;
    const primero = afectados[0];
    const datos = {
      origen: item.clave, grupo, categoria, texto,
      fecha: primero.fecha, monto: Math.round(afectados.reduce((t, a) => t + a.monto, 0) * 100) / 100,
      concepto: primero.concepto, pagos: afectados.length, tipoKelly: k.tipo,
    };
    const decision = { accion: "reclasificar", tipoPE: s.tipoPE, categoriaDestino: destino };
    await sql.transaction([
      asegurarCategoria(bId, destino, grupoNueva),
      texto
        ? sql`
            UPDATE expenses SET tipo_pe = ${s.tipoPE}, category = ${destino}
             WHERE business_id = ${bId} AND archived = false AND category = ${categoria}
               AND position(${texto} in norm_grupo(concepto_norm(concept))) > 0
          `
        : sql`
            UPDATE expenses SET tipo_pe = ${s.tipoPE}, category = ${destino}
             WHERE business_id = ${bId} AND archived = false AND huella_gasto(business_id, date, amount, concept) = ${huella}
          `,
      sql`
        INSERT INTO clasificacion_revisiones (business_id, alcance, motivo, clave, datos, estado, decision, decidido_por, decidido_en, kelly_pendiente)
        VALUES (${bId}, ${alcance}, 'separado', ${clave}, ${JSON.stringify(datos)}::jsonb, 'resuelta', ${JSON.stringify(decision)}::jsonb, ${nombre}, now(), ${kellyPendiente})
        ON CONFLICT (business_id, alcance, clave) DO UPDATE
          SET motivo = 'separado', datos = EXCLUDED.datos, estado = 'resuelta', decision = EXCLUDED.decision,
              decidido_por = EXCLUDED.decidido_por, decidido_en = now(), kelly_pendiente = EXCLUDED.kelly_pendiente,
              kelly_corregido_en = NULL, actualizado_en = now()
      `,
    ]);
    await sincronizarRevisiones(bId);
    refrescar();
    return { ok: true, pagos: afectados.length };
  } catch (e) {
    console.error("[separarGastos] failed:", e);
    return { ok: false, error: "No se pudo separar." };
  }
}

/**
 * Deshace una separación: los pagos vuelven a su categoría y a su grupo,
 * y la regla deja de aplicarse en las próximas importaciones.
 */
export async function deshacerSeparacion(id: string): Promise<Res> {
  if (!(await quien())) return { ok: false, error: "Solo dirección." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "No existe." };
  const r = (await sql`
    SELECT business_id, alcance, clave, datos, decision FROM clasificacion_revisiones WHERE id = ${id} AND motivo = 'separado'
  `) as { business_id: number; alcance: string; clave: string; datos: Record<string, unknown>; decision: { categoriaDestino: string | null } }[];
  if (r.length === 0) return { ok: false, error: "No existe." };
  const { business_id: bId, alcance, clave, datos, decision } = r[0];
  const origen = String(datos.categoria ?? "");
  const destino = decision.categoriaDestino ?? origen;
  try {
    await sql.transaction([
      alcance === "concepto"
        ? sql`
            UPDATE expenses SET tipo_pe = NULL, category = ${origen}
             WHERE business_id = ${bId} AND archived = false AND category = ${destino} AND tipo_pe IS NOT NULL
               AND position(${String(datos.texto ?? "")} in norm_grupo(concepto_norm(concept))) > 0
          `
        : sql`
            UPDATE expenses SET tipo_pe = NULL, category = ${origen}
             WHERE business_id = ${bId} AND archived = false AND huella_gasto(business_id, date, amount, concept) = ${clave}
          `,
      sql`DELETE FROM clasificacion_revisiones WHERE id = ${id}`,
    ]);
    await sincronizarRevisiones(bId);
    refrescar();
    return { ok: true };
  } catch (e) {
    console.error("[deshacerSeparacion] failed:", e);
    return { ok: false, error: "No se pudo deshacer." };
  }
}

