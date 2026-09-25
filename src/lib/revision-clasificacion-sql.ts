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
  detectarRevisiones, type CategoriaSistema, type FilaGastoRevision, type CandidatoRevision,
  type DecisionCategoria, type DecisionGasto,
} from "./revision-clasificacion";
import { clasificarEgreso, calidadClasificacion, type ReglaAprendida, type CalidadClasificacion } from "./clasificador-gasto";

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

/**
 * Desde la lista única (19-sep-2026) el Excel de Kelly y el sistema usan las
 * mismas categorías: ya no hay una lista de Kelly contra la cual comparar.
 * La bandeja pregunta solo lo que el sistema no puede decidir: categorías
 * sin grupo, gastos POR ACLARAR / en bolsones y montos fuera de lo normal.
 */
async function categoriasKelly(): Promise<CategoriaPE[] | null> {
  return null;
}

/** Las reglas que Jahnn enseñó en una sede. Sin la tabla (migración pendiente), ninguna. */
export async function leerReglasAprendidas(bId: number): Promise<ReglaAprendida[]> {
  try {
    return (await sql`
      SELECT texto, categoria FROM reglas_aprendidas WHERE business_id = ${bId} AND activo = true
    `) as ReglaAprendida[];
  } catch {
    return [];
  }
}

type FilaClasificable = FilaGastoRevision & { grupoExcel: string | null; deExcel: boolean; propio: number; transferencia: boolean };

/**
 * Los gastos en los que el clasificador experto tiene confianza BAJA (las
 * opiniones se contradicen en el tipo, nadie sabe qué es, o la categoría ya
 * no existe): pasan a la bandeja con las categorías entre las que elegir.
 * Ver lib/clasificador-gasto.ts.
 */
function detectarConflictos(gastos: FilaClasificable[], aprendidas: ReglaAprendida[], gruposMovidos: Set<string>, gastosRevisados: Set<string>): CandidatoRevision[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const out: CandidatoRevision[] = [];
  const vistos = new Set<string>();
  for (const g of gastos) {
    // Una transferencia entre cuentas propias no es gasto: no hay nada que clasificar.
    if (!(g.propio > 0) || g.transferencia || vistos.has(g.huella)) continue;
    const decidido = g.tipoPE != null || gastosRevisados.has(g.huella) || gruposMovidos.has(`${normGrupoPE(g.grupo)}|${g.category}`);
    const c = clasificarEgreso({ concepto: g.concept, categoria: g.category, grupoExcel: g.grupoExcel, deExcel: g.deExcel, decidido }, aprendidas);
    if (c.confianza !== "baja") continue;
    vistos.add(g.huella);
    out.push({
      alcance: "gasto", motivo: "conflicto", clave: g.huella,
      datos: {
        fecha: g.date, monto: r2(g.propio), concepto: g.concept, grupo: g.grupo, categoria: g.category, deExcel: g.deExcel,
        tipoActual: c.tipo, opiniones: c.opiniones, sugerencias: c.sugerencias, explicacion: c.motivo,
      },
    });
  }
  return out;
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
             concept, category, COALESCE(NULLIF(btrim(grupo_excel), ''), category) AS grupo, tipo_pe AS "tipoPE",
             NULLIF(btrim(grupo_excel), '') AS "grupoExcel", imported_from_excel AS "deExcel",
             (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS propio,
             is_internal_transfer AS "transferencia"
      FROM expenses
      WHERE business_id = ${bId} AND archived = false AND payment_method <> 'pendiente_atelier'
        AND date >= ${desde(hoy)}
    `,
    sql`SELECT name, cost_group AS "costGroup", exclude_from_ebitda AS "excludeFromEbitda" FROM expense_categories WHERE business_id = ${bId}`,
    categoriasKelly(),
  ]);
  const gastos = gastosRaw as FilaClasificable[];
  const aprendidas = await leerReglasAprendidas(bId);
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
  // El clasificador experto primero: si un gasto además es atípico o está en
  // un bolsón, la pregunta del clasificador ya trae con qué opciones decidir.
  // Gastos que Jahnn ya miró uno por uno ("está bien así" también cuenta).
  const revisados = new Set(antes.filter((r) => r.alcance === "gasto" && r.estado === "resuelta" && (r.decision as { accion?: string } | null)?.accion).map((r) => r.clave));
  const conflictos = detectarConflictos(gastos, aprendidas, yaDecididas, revisados);
  const enConflicto = new Set(conflictos.map((c) => c.clave));
  const candidatos = [
    ...conflictos,
    ...detectarRevisiones({ gastos, categoriasSistema: cats, categoriasKelly: kelly })
      .filter((c) => !(c.alcance === "categoria" && yaDecididas.has(c.clave)))
      .filter((c) => !(c.alcance === "gasto" && enConflicto.has(c.clave))),
  ];
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
    // Reglas que enseñó Jahnn ("todos los que dicen TAPA DE LOMO son
    // INSUMOS"): primero, para que las decisiones puntuales de abajo ganen.
    // Si varias coinciden, manda la más específica (el texto más largo).
    txSql`
      UPDATE expenses e
         SET category = m.categoria
        FROM (
          SELECT DISTINCT ON (e2.id) e2.id, ra.categoria
            FROM expenses e2
            JOIN reglas_aprendidas ra
              ON ra.business_id = e2.business_id AND ra.activo
             AND position(ra.texto in norm_grupo(concepto_norm(e2.concept))) > 0
           WHERE e2.business_id = ${bId} AND e2.date BETWEEN ${inicio} AND ${fin} AND e2.archived = false
           ORDER BY e2.id, length(ra.texto) DESC
        ) m
       WHERE e.id = m.id AND e.tipo_pe IS NULL
    `,
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

/**
 * Qué tan confiable es la clasificación de los egresos de una sede en un
 * periodo: cuánta plata está con confianza alta, media o baja según el
 * clasificador experto. Es el sello del punto de equilibrio y del reporte de
 * gastos por categoría (pedido de Jahnn, 25-sep-2026).
 */
export async function calidadClasificacionSede(bId: number, desdeFecha: string, hastaFecha: string): Promise<CalidadClasificacion> {
  const [filas, decisiones, aprendidas] = await Promise.all([
    sql`
      SELECT huella_gasto(business_id, date, amount, concept) AS huella,
             concept, category, tipo_pe AS "tipoPE", NULLIF(btrim(grupo_excel), '') AS "grupoExcel", imported_from_excel AS "deExcel",
             COALESCE(NULLIF(btrim(grupo_excel), ''), category) AS grupo,
             (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS propio
      FROM expenses
      WHERE business_id = ${bId} AND archived = false AND payment_method <> 'pendiente_atelier'
        AND is_internal_transfer = false AND date BETWEEN ${desdeFecha} AND ${hastaFecha}
    ` as unknown as Promise<{ huella: string; concept: string | null; category: string; tipoPE: string | null; grupoExcel: string | null; deExcel: boolean; grupo: string; propio: number }[]>,
    sql`
      SELECT alcance, clave, decision->>'categoriaDestino' AS destino FROM clasificacion_revisiones
      WHERE business_id = ${bId} AND estado = 'resuelta' AND decision ? 'accion' OR (business_id = ${bId} AND alcance = 'categoria' AND estado = 'resuelta' AND COALESCE(decision->>'categoriaDestino', '') <> '')
    ` as unknown as Promise<{ alcance: string; clave: string; destino: string | null }[]>,
    leerReglasAprendidas(bId),
  ]);
  const movidos = new Set(decisiones.filter((d) => d.alcance === "categoria" && d.destino).map((d) => `${d.clave.split("|")[0]}|${d.destino}`));
  const revisados = new Set(decisiones.filter((d) => d.alcance === "gasto").map((d) => d.clave));
  return calidadClasificacion(
    filas.filter((f) => f.propio > 0).map((f) => ({
      monto: f.propio,
      confianza: clasificarEgreso({
        concepto: f.concept, categoria: f.category, grupoExcel: f.grupoExcel, deExcel: f.deExcel,
        decidido: f.tipoPE != null || revisados.has(f.huella) || movidos.has(`${normGrupoPE(f.grupo)}|${f.category}`),
      }, aprendidas).confianza,
    })),
  );
}
