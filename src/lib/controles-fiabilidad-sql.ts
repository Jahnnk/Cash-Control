/**
 * Los controles de fiabilidad · LECTURA y GUARDADO. El cálculo vive en lib/controles-fiabilidad.ts.
 *
 * Corren al importar cada Excel (app/actions/excel-import.ts) y al abrir el mes (app/actions/controles-fiabilidad.ts).
 * El resultado se guarda en `controles_mes` (scripts/migrations/2026-10-24_controles_fiabilidad.sql). Si la tabla
 * todavía no existe, se calcula igual y no se guarda: nunca tumba un import ni una pantalla.
 */

import { leerFuentesVenta } from "./kpis/ventas-loader";
import { leerConfigProfitFirst } from "./profit-first-config-sql";
import { bloquesDeNotas } from "./bloques-pie-excel";
import { controlEfectivoDeNotas } from "./control-efectivo-parser";
import { leerDatosMesSede, hoyLima } from "./seis-cifras-sql";
import { cifrasDelGrupo } from "./seis-cifras";
import { c7Grupo, controlesDeSede, controlesDelGrupo, type ControlesMes, type DatosControles, type LoteMes } from "./controles-fiabilidad";

/** Firma mínima del template tag de @neondatabase/serverless. */
type SqlTag = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<unknown>;

export const SEDES_CONTROLES: [number, string][] = [[2, "Fonavi"], [3, "Centro"], [1, "Atelier"]];
const nombreSede = (bId: number) => SEDES_CONTROLES.find(([id]) => id === bId)?.[1] ?? `Sede ${bId}`;

export async function leerDatosControles(sql: SqlTag, bId: number, mes: string, hoy = hoyLima()): Promise<DatosControles> {
  const datos = await leerDatosMesSede(sql, bId, nombreSede(bId), mes, hoy);
  const inicio = `${mes}-01`;
  const [lotes, saldoIni, saldosMes, fuentes, cfg] = await Promise.all([
    sql`
      SELECT b.id::text, to_char(b.imported_at AT TIME ZONE 'America/Lima', 'YYYY-MM-DD') AS "cargadoEl", b.file_name AS archivo, b.notes,
             (EXISTS (SELECT 1 FROM expenses x WHERE x.import_batch_id = b.id AND x.archived = false)
               OR EXISTS (SELECT 1 FROM bank_income_items x WHERE x.import_batch_id = b.id AND x.archived = false)) AS vigente
      FROM import_batches b
      WHERE b.business_id = ${bId} AND b.sheet_name ILIKE '%Ing&Gtos%' AND b.status = 'completed'
        AND b.date_range_start <= ${datos.finDeMes} AND b.date_range_end >= ${inicio}
      ORDER BY b.imported_at
    ` as unknown as Promise<(LoteMes & { notes: string | null })[]>,
    sql`SELECT fecha::text, banco::float AS banco, caja::float AS caja FROM sede_balances WHERE business_id = ${bId} AND fecha < ${inicio} ORDER BY fecha DESC LIMIT 1` as unknown as Promise<{ fecha: string; banco: number | null; caja: number }[]>,
    sql`SELECT fecha::text, banco::float AS banco, caja::float AS caja FROM sede_balances WHERE business_id = ${bId} AND fecha BETWEEN ${inicio} AND ${datos.finDeMes} ORDER BY fecha` as unknown as Promise<{ fecha: string; banco: number | null; caja: number }[]>,
    leerFuentesVenta(sql, bId, inicio, datos.hastaHoy),
    leerConfigProfitFirst(sql as never),
  ]);
  const vigente = lotes.filter((l) => l.vigente).at(-1);
  return {
    datos,
    hoja: vigente ? bloquesDeNotas(vigente.notes).hoja : null,
    lotes: lotes.map(({ id, cargadoEl, archivo, vigente: v }) => ({ id, cargadoEl, archivo, vigente: v })),
    saldoInicial: saldoIni[0] ?? null,
    saldosDelMes: saldosMes,
    ventasDia: { byte: fuentes.byte, excel: fuentes.kelly },
    efectivo: vigente ? controlEfectivoDeNotas(vigente.notes) : null,
    config: cfg.config,
  };
}

/** Los controles de una sede en un mes (sin guardar). */
export async function controlesDelMes(sql: SqlTag, bId: number, mes: string, hoy?: string) {
  return controlesDeSede(await leerDatosControles(sql, bId, mes, hoy));
}

/** Las tres sedes y el grupo (el grupo de la app: las tres sedes, con la venta interna de Atelier contada una vez). */
export async function controlesDelMesTodas(sql: SqlTag, mes: string, hoy?: string): Promise<{ sedes: ControlesMes[]; grupo: ControlesMes }> {
  const sedes = await Promise.all(SEDES_CONTROLES.map(([bId]) => controlesDelMes(sql, bId, mes, hoy)));
  const cifras = sedes.map((s) => s.cifras);
  const { config } = await leerConfigProfitFirst(sql as never);
  const grupo = controlesDelGrupo(mes, sedes, c7Grupo(cifrasDelGrupo(cifras), cifras, config));
  return { sedes: sedes.map(({ cifras: _c, ...r }) => { void _c; return r; }), grupo };
}

/** Guarda el resultado (el último de cada sede y mes). false = no se pudo (p. ej. falta la tabla). */
export async function guardarControles(sql: SqlTag, r: ControlesMes, origen: "import" | "apertura"): Promise<boolean> {
  try {
    await sql`
      INSERT INTO controles_mes (business_id, mes, estado, controles, origen, calculado_en)
      VALUES (${r.businessId}, ${r.mes}, ${r.estado}, ${JSON.stringify(r.controles)}::jsonb, ${origen}, now())
      ON CONFLICT (business_id, mes) DO UPDATE
        SET estado = EXCLUDED.estado, controles = EXCLUDED.controles, origen = EXCLUDED.origen, calculado_en = now()
    `;
    return true;
  } catch (err) {
    console.error("[guardarControles] no se guardó (¿falta la tabla controles_mes?):", err);
    return false;
  }
}
