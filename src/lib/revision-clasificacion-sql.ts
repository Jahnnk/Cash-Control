/**
 * Revisión de la clasificación · lectura y escritura en la base.
 *
 * No es un archivo "use server" a propósito: `sincronizarRevisiones` la
 * llaman la importación del Excel y las acciones de la bandeja, y no debe
 * quedar publicada como endpoint (no verifica sesión: la verifica quien la
 * llama). La lógica de qué preguntar vive en revision-clasificacion.ts.
 */

import { neon } from "@neondatabase/serverless";
import { normGrupoPE, type CategoriaPE, type TipoPE } from "./pe-kelly";
import {
  detectarRevisiones, type CategoriaSistema, type FilaGastoRevision,
  type DecisionCategoria, type DecisionGasto,
} from "./revision-clasificacion";

const sql = neon(process.env.DATABASE_URL!);

/** Cuántos meses hacia atrás se revisan: los que alimentan la meta del bono. */
export const MESES_REVISADOS = 6;

/** Primer día de la ventana que se revisa (la misma para la bandeja y para listar los gastos de un grupo). */
export function inicioRevision(): string {
  return desde(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }));
}

function desde(hoy: string): string {
  const [y, m] = hoy.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - MESES_REVISADOS, 1));
  return d.toISOString().slice(0, 10);
}

async function categoriasKelly(bId: number): Promise<CategoriaPE[] | null> {
  try {
    const rows = (await sql`SELECT grupo, grupo_norm AS "grupoNorm", tipo, nota FROM pe_categorias WHERE business_id = ${bId}`) as CategoriaPE[];
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/**
 * Recalcula qué hay que preguntar en una sede. Devuelve cuántas preguntas
 * NUEVAS aparecieron (para el aviso de la importación).
 *
 *   · Lo nuevo entra como pendiente; lo pendiente actualiza su contexto.
 *   · Lo que estaba pendiente y ya no se detecta (Kelly corrigió su lista,
 *     se reclasificó la categoría) se cierra solo.
 *   · Las decisiones que Kelly tenía que pasar a su Excel se marcan
 *     corregidas cuando su Excel ya dice lo mismo.
 */
export async function sincronizarRevisiones(bId: number): Promise<{ nuevas: number; pendientes: number }> {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const [gastosRaw, catsRaw, kelly] = await Promise.all([
    sql`
      SELECT huella_gasto(business_id, date, amount, concept) AS huella, date::text AS date, amount::float AS amount,
             concept, category, COALESCE(NULLIF(btrim(grupo_excel), ''), category) AS grupo, tipo_pe AS "tipoPE"
      FROM expenses
      WHERE business_id = ${bId} AND archived = false AND payment_method <> 'pendiente_atelier'
        AND date >= ${desde(hoy)}
    `,
    sql`SELECT name, cost_group AS "costGroup", exclude_from_ebitda AS "excludeFromEbitda" FROM expense_categories WHERE business_id = ${bId}`,
    categoriasKelly(bId),
  ]);
  const gastos = gastosRaw as FilaGastoRevision[];
  const cats = catsRaw as CategoriaSistema[];

  const antes = (await sql`
    SELECT id::text, alcance, clave, estado, decision, kelly_pendiente, kelly_corregido_en, datos
    FROM clasificacion_revisiones WHERE business_id = ${bId}
  `) as { id: string; alcance: string; clave: string; estado: string; decision: DecisionCategoria | DecisionGasto | null; kelly_pendiente: boolean; kelly_corregido_en: string | null; datos: Record<string, unknown> }[];
  // Un grupo que ya se decidió mover a otra categoría reaparece con otra
  // clave (grupo|categoría nueva): es la MISMA decisión, no se vuelve a preguntar.
  const yaDecididas = new Set(
    antes
      .filter((r) => r.alcance === "categoria" && r.estado === "resuelta" && (r.decision as DecisionCategoria | null)?.categoriaDestino)
      .map((r) => `${r.clave.split("|")[0]}|${(r.decision as DecisionCategoria).categoriaDestino}`),
  );
  const candidatos = detectarRevisiones({ gastos, categoriasSistema: cats, categoriasKelly: kelly })
    .filter((c) => !(c.alcance === "categoria" && yaDecididas.has(c.clave)));
  const existentes = new Map(antes.map((r) => [`${r.alcance}|${r.clave}`, r]));
  const detectadas = new Set(candidatos.map((c) => `${c.alcance}|${c.clave}`));

  const q = [];
  let nuevas = 0;
  for (const c of candidatos) {
    const previo = existentes.get(`${c.alcance}|${c.clave}`);
    if (!previo) nuevas++;
    q.push(sql`
      INSERT INTO clasificacion_revisiones (business_id, alcance, motivo, clave, datos)
      VALUES (${bId}, ${c.alcance}, ${c.motivo}, ${c.clave}, ${JSON.stringify(c.datos)}::jsonb)
      ON CONFLICT (business_id, alcance, clave) DO UPDATE
        SET datos = EXCLUDED.datos, motivo = EXCLUDED.motivo, actualizado_en = now()
        WHERE clasificacion_revisiones.estado = 'pendiente'
    `);
  }
  // Pendientes que ya no aparecen: el problema se resolvió por otro lado.
  // Una consulta a Kelly sin respuesta se deja: la pregunta sigue en pie.
  for (const r of antes) {
    if (r.estado !== "pendiente" || r.alcance === "concepto" || detectadas.has(`${r.alcance}|${r.clave}`)) continue;
    if ((r.decision as DecisionGasto | null)?.accion === "consultar") continue;
    q.push(sql`
      UPDATE clasificacion_revisiones
         SET estado = 'resuelta', decision = ${JSON.stringify({ automatica: "Ya no hay diferencia: se corrigió en el Excel o en el catálogo." })}::jsonb,
             decidido_por = 'sistema', decidido_en = now(), actualizado_en = now()
       WHERE id = ${r.id}
    `);
  }
  // Correcciones que Kelly ya pasó a su Excel.
  if (kelly) {
    const tipoDe = new Map(kelly.map((k) => [k.grupoNorm, k.tipo as TipoPE]));
    const grupoPorHuella = new Map(gastos.map((g) => [g.huella, g.grupo]));
    for (const r of antes) {
      if (!r.kelly_pendiente || r.kelly_corregido_en || r.estado !== "resuelta" || !r.decision) continue;
      const dec = r.decision as DecisionCategoria & DecisionGasto;
      if (!dec.tipoPE) continue;
      const grupo = r.alcance === "gasto" ? grupoPorHuella.get(r.clave) : String(r.datos.grupo ?? "");
      if (grupo === undefined) continue;
      if (tipoDe.get(normGrupoPE(grupo)) === dec.tipoPE) {
        q.push(sql`UPDATE clasificacion_revisiones SET kelly_corregido_en = now(), actualizado_en = now() WHERE id = ${r.id}`);
      }
    }
  }
  if (q.length > 0) await sql.transaction(q);

  const pend = (await sql`SELECT COUNT(*)::int AS n FROM clasificacion_revisiones WHERE business_id = ${bId} AND estado = 'pendiente'`) as { n: number }[];
  return { nuevas, pendientes: pend[0]?.n ?? 0 };
}

/**
 * Las decisiones que cambian gastos, para re-aplicarlas después de una
 * importación (el Excel borra y vuelve a insertar las filas). Van en la
 * misma transacción que los INSERT del mes.
 */
export function reaplicarDecisionesSQL<Q>(txSql: (strings: TemplateStringsArray, ...values: unknown[]) => Q, bId: number, inicio: string, fin: string): Q[] {
  return [
    // Reglas por concepto ("todos los que dicen PRESTAMO VEHICULAR"): van
    // primero, para que el grupo entero no se las lleve a otra categoría.
    txSql`
      UPDATE expenses e
         SET tipo_pe = r.decision->>'tipoPE',
             category = COALESCE(NULLIF(r.decision->>'categoriaDestino', ''), e.category)
        FROM clasificacion_revisiones r
       WHERE e.business_id = ${bId} AND e.date BETWEEN ${inicio} AND ${fin} AND e.archived = false
         AND r.business_id = ${bId} AND r.alcance = 'concepto' AND r.estado = 'resuelta'
         AND r.decision->>'accion' = 'reclasificar'
         AND e.category = r.datos->>'categoria'
         AND position(r.datos->>'texto' in norm_grupo(concepto_norm(e.concept))) > 0
    `,
    // Gastos puntuales reclasificados.
    txSql`
      UPDATE expenses e
         SET tipo_pe = r.decision->>'tipoPE',
             category = COALESCE(NULLIF(r.decision->>'categoriaDestino', ''), e.category)
        FROM clasificacion_revisiones r
       WHERE e.business_id = ${bId} AND e.date BETWEEN ${inicio} AND ${fin} AND e.archived = false
         AND r.business_id = ${bId} AND r.alcance = 'gasto' AND r.estado = 'resuelta'
         AND r.decision->>'accion' = 'reclasificar'
         AND r.clave = huella_gasto(e.business_id, e.date, e.amount, e.concept)
    `,
    // Grupos que se decidió mover a otra categoría del sistema.
    txSql`
      UPDATE expenses e
         SET category = r.decision->>'categoriaDestino'
        FROM clasificacion_revisiones r
       WHERE e.business_id = ${bId} AND e.date BETWEEN ${inicio} AND ${fin} AND e.archived = false
         AND r.business_id = ${bId} AND r.alcance = 'categoria' AND r.estado = 'resuelta'
         AND COALESCE(r.decision->>'categoriaDestino', '') <> ''
         AND r.clave = norm_grupo(COALESCE(NULLIF(btrim(e.grupo_excel), ''), e.category)) || '|' || e.category
    `,
  ];
}

/**
 * Tipos del punto de equilibrio decididos por grupo que difieren de la lista
 * de Kelly: `${grupoNorm}|${categoría}` → tipo. El cálculo del punto de
 * equilibrio los aplica encima de la lista.
 */
export async function tiposDecididosPorGrupo(bId: number): Promise<Map<string, TipoPE>> {
  try {
    const rows = (await sql`
      SELECT clave, decision->>'tipoPE' AS tipo, NULLIF(decision->>'categoriaDestino', '') AS destino
      FROM clasificacion_revisiones
      WHERE business_id = ${bId} AND alcance = 'categoria' AND estado = 'resuelta' AND decision ? 'tipoPE'
    `) as { clave: string; tipo: TipoPE; destino: string | null }[];
    const out = new Map<string, TipoPE>();
    for (const r of rows) {
      out.set(r.clave, r.tipo);
      // Si los gastos se movieron a otra categoría, la decisión los sigue.
      if (r.destino) out.set(`${r.clave.split("|")[0]}|${r.destino}`, r.tipo);
    }
    return out;
  } catch {
    return new Map();
  }
}
