"use server";

/**
 * Cuentas por cobrar de Atelier — a partir de dos reportes de Byte.
 *
 * Luis sube el "Reporte de Ventas" y el "Consolidado de Facturas". Cada
 * documento (factura, boleta o ticket) es UNA fila que se actualiza en
 * cada importación: una deuda de la semana pasada cobrada esta semana
 * cambia de estado, no se duplica.
 *
 * Los dos archivos se complementan y ninguno pisa lo del otro:
 *   · el reporte de VENTAS manda sobre el estado de cobro y los montos
 *     (es el único que sabe qué se cobró y cuándo vence);
 *   · el CONSOLIDADO manda sobre la identidad tributaria: RUC del
 *     cliente, IGV, y si la factura fue anulada.
 *
 * Ver `scripts/migrations/2026-08-09-cuentas-por-cobrar.sql` para el
 * porqué del modelo y el hallazgo del cuadre a tres bandas.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import { getToday } from "@/lib/utils";
import type { DocumentoParseado, TipoReporte } from "@/lib/receivables-parser";

const sql = neon(process.env.DATABASE_URL!);

/** Atelier es la única sede que factura B2B a crédito. */
const ATELIER = 1;

/**
 * A partir de cuántos días sin cobrar el sistema marca la deuda como
 * atrasada. Decisión de Jahnn (09-ago-2026): 8 días. Byte le pone
 * vencimiento a 1 día a TODO por defecto, así que su fecha no sirve
 * como alerta — marcaría 36 de 49 ventas en rojo el mismo día.
 *
 * NO se exporta: un archivo "use server" solo puede exportar funciones
 * async. La pantalla lo recibe dentro de los datos (`diasParaAtraso`).
 */
const DIAS_PARA_ATRASO = 8;

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/** Días transcurridos entre dos fechas ISO (sin líos de zona horaria). */
function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.UTC(...(hasta.split("-").map(Number) as [number, number, number])) -
      Date.UTC(...(desde.split("-").map(Number) as [number, number, number]))) /
      86_400_000,
  );
}

async function requireAtelier(): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind === "full") return { ok: true };
  if (role?.kind === "admin" && role.sede === ATELIER) return { ok: true };
  return { ok: false, error: "Sin acceso a esta sección." };
}

function faltaMigracion(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .*invoice_(documents|imports).* does not exist/i.test(msg);
}

// ─────────────────────────────────────────────────────────────────
// Importar
// ─────────────────────────────────────────────────────────────────

export async function importReceivablesReport(input: {
  tipoReporte: TipoReporte;
  docs: DocumentoParseado[];
  periodo: { inicio: string; fin: string };
  archivo: string | null;
}): Promise<
  | { ok: true; nuevos: number; actualizados: number; tipoReporte: TipoReporte }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (bId !== ATELIER) return { ok: false, error: "Este reporte es solo de Atelier." };
  const acceso = await requireAtelier();
  if (!acceso.ok) return acceso;

  const { docs, periodo, tipoReporte } = input;
  if (!Array.isArray(docs) || docs.length === 0) {
    return { ok: false, error: "El archivo no trae documentos." };
  }
  if (docs.length > 20000) return { ok: false, error: "Demasiados documentos en un solo archivo." };
  const esFecha = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!esFecha(periodo.inicio) || !esFecha(periodo.fin) || periodo.inicio > periodo.fin) {
    return { ok: false, error: "El período del archivo no es válido." };
  }
  for (const d of docs) {
    if (!d.docKey?.trim() || !d.cliente?.trim()) {
      return { ok: false, error: "Hay un documento sin identificador o sin cliente." };
    }
    if (!Number.isFinite(d.total)) return { ok: false, error: `Monto inválido en ${d.docKey}.` };
  }

  try {
    const previos = (await sql`
      SELECT doc_key FROM invoice_documents WHERE business_id = ${bId}
    `) as { doc_key: string }[];
    const yaEstaban = new Set(previos.map((p) => p.doc_key));

    console.log(
      `[importReceivables] bId=${bId} tipo=${tipoReporte} docs=${docs.length} ` +
        `periodo=${periodo.inicio}..${periodo.fin}`,
    );

    for (const d of docs) {
      if (tipoReporte === "ventas") {
        // El reporte de ventas manda sobre montos y estado de cobro.
        // NO toca `documento`/`igv`/`estado_factura` (no los conoce), y
        // limpia la marca manual solo cuando Byte confirma el pago.
        await sql`
          INSERT INTO invoice_documents
            (business_id, doc_key, tipo, serie, fecha, cliente, es_sede, sede_id,
             total, credito, cobrado_pos, estado_cuota, vencimiento, origen_ventas)
          VALUES (${bId}, ${d.docKey}, ${d.tipo}, ${d.serie}, ${d.fecha}, ${d.cliente},
                  ${d.esSede}, ${d.sedeId}, ${d.total}, ${d.credito}, ${d.cobradoPos},
                  ${d.estadoCuota}, ${d.vencimiento}, true)
          ON CONFLICT (business_id, doc_key) DO UPDATE SET
            tipo = EXCLUDED.tipo,
            serie = COALESCE(EXCLUDED.serie, invoice_documents.serie),
            fecha = EXCLUDED.fecha,
            cliente = EXCLUDED.cliente,
            es_sede = invoice_documents.es_sede OR EXCLUDED.es_sede,
            sede_id = COALESCE(invoice_documents.sede_id, EXCLUDED.sede_id),
            total = EXCLUDED.total,
            credito = EXCLUDED.credito,
            cobrado_pos = EXCLUDED.cobrado_pos,
            estado_cuota = EXCLUDED.estado_cuota,
            vencimiento = EXCLUDED.vencimiento,
            cobrado_manual = CASE WHEN EXCLUDED.estado_cuota = 'PAGADA'
                                  THEN false ELSE invoice_documents.cobrado_manual END,
            cobrado_manual_fecha = CASE WHEN EXCLUDED.estado_cuota = 'PAGADA'
                                        THEN NULL ELSE invoice_documents.cobrado_manual_fecha END,
            origen_ventas = true,
            actualizado_en = now()
        `;
      } else {
        // El consolidado manda sobre la identidad tributaria. NO toca
        // estado_cuota ni montos de cobro: no los conoce, y pisarlos
        // borraría lo que sí sabe el reporte de ventas.
        await sql`
          INSERT INTO invoice_documents
            (business_id, doc_key, tipo, serie, fecha, cliente, documento, tipo_doc,
             es_sede, sede_id, total, igv, gravado, estado_factura, origen_facturas)
          VALUES (${bId}, ${d.docKey}, ${d.tipo}, ${d.serie}, ${d.fecha}, ${d.cliente},
                  ${d.documento}, ${d.tipoDoc}, ${d.esSede}, ${d.sedeId}, ${d.total},
                  ${d.igv}, ${d.gravado}, ${d.estadoFactura}, true)
          ON CONFLICT (business_id, doc_key) DO UPDATE SET
            serie = COALESCE(EXCLUDED.serie, invoice_documents.serie),
            cliente = EXCLUDED.cliente,
            documento = EXCLUDED.documento,
            tipo_doc = EXCLUDED.tipo_doc,
            es_sede = invoice_documents.es_sede OR EXCLUDED.es_sede,
            sede_id = COALESCE(EXCLUDED.sede_id, invoice_documents.sede_id),
            igv = EXCLUDED.igv,
            gravado = EXCLUDED.gravado,
            estado_factura = EXCLUDED.estado_factura,
            origen_facturas = true,
            actualizado_en = now()
        `;
      }
    }

    await sql`
      INSERT INTO invoice_imports
        (business_id, tipo_reporte, periodo_inicio, periodo_fin, archivo, documentos, total)
      VALUES (${bId}, ${tipoReporte}, ${periodo.inicio}, ${periodo.fin}, ${input.archivo},
              ${docs.length},
              ${r2(docs.filter((d) => d.estadoFactura !== "ANULADO").reduce((s, d) => s + d.total, 0))})
    `;

    const nuevos = docs.filter((d) => !yaEstaban.has(d.docKey)).length;
    revalidatePath("/", "layout");
    return { ok: true, nuevos, actualizados: docs.length - nuevos, tipoReporte };
  } catch (e) {
    console.error("[importReceivables] failed:", e);
    if (faltaMigracion(e)) {
      return { ok: false, error: "Falta correr la migración de la base de datos. Avísale a Jahnn." };
    }
    return { ok: false, error: "No pude guardar el reporte. Intenta de nuevo." };
  }
}

// ─────────────────────────────────────────────────────────────────
// Marcar un cobro a mano
// ─────────────────────────────────────────────────────────────────

/**
 * Luis cobró después de generar el archivo de Byte. Esto NO cambia el
 * total oficial (Byte manda) — queda como aviso de que falta registrarlo
 * en Byte, y se limpia solo cuando el archivo siguiente lo confirma.
 */
export async function marcarCobrado(
  docKey: string,
  nota?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const acceso = await requireAtelier();
  if (!acceso.ok) return acceso;
  if (!docKey?.trim()) return { ok: false, error: "Falta el documento." };
  try {
    await sql`
      UPDATE invoice_documents
      SET cobrado_manual = true, cobrado_manual_fecha = now(),
          cobrado_manual_nota = ${nota?.slice(0, 300) ?? null}, actualizado_en = now()
      WHERE business_id = ${ATELIER} AND doc_key = ${docKey}
    `;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[marcarCobrado] failed:", e);
    return { ok: false, error: "No pude guardar la marca." };
  }
}

export async function desmarcarCobrado(
  docKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const acceso = await requireAtelier();
  if (!acceso.ok) return acceso;
  try {
    await sql`
      UPDATE invoice_documents
      SET cobrado_manual = false, cobrado_manual_fecha = NULL,
          cobrado_manual_nota = NULL, actualizado_en = now()
      WHERE business_id = ${ATELIER} AND doc_key = ${docKey}
    `;
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    console.error("[desmarcarCobrado] failed:", e);
    return { ok: false, error: "No pude quitar la marca." };
  }
}

// ─────────────────────────────────────────────────────────────────
// Leer y analizar
// ─────────────────────────────────────────────────────────────────

export type DocPorCobrar = {
  docKey: string;
  tipo: string;
  serie: string | null;
  fecha: string;
  cliente: string;
  documento: string | null;
  esSede: boolean;
  total: number;
  dias: number;
  atrasado: boolean;
  cobradoManual: boolean;
};

export type DeudorResumen = {
  clave: string;
  cliente: string;
  documento: string | null;
  esSede: boolean;
  deuda: number;
  documentos: number;
  diasMasViejo: number;
  atrasado: number;
};

export type TramoAntiguedad = { tramo: string; monto: number; documentos: number };

export type CuadreReportes = {
  hayAmbos: boolean;
  periodo: { inicio: string; fin: string } | null;
  facturas: number;
  boletas: number;
  tickets: number;
  totalVentas: number;
  facturasConsolidado: number;
  /** Facturas del reporte de ventas − consolidado emitido. Debe ser 0. */
  diferencia: number;
  anuladas: { docKey: string; cliente: string; total: number }[];
  /** Facturas que están en un archivo y no en el otro. */
  soloEnVentas: { docKey: string; cliente: string; total: number }[];
  soloEnConsolidado: { docKey: string; cliente: string; total: number }[];
  montosDistintos: { docKey: string; cliente: string; enVentas: number; enConsolidado: number }[];
};

export type ReceivablesData = {
  hayDatos: boolean;
  faltaMigracion?: boolean;
  hoy: string;
  diasParaAtraso: number;
  ultimaCarga: { ventas: string | null; facturas: string | null };
  porCobrar: number;
  porCobrarDocs: number;
  atrasado: number;
  atrasadoDocs: number;
  cobrado: number;
  /** Ya cobrado por Luis pero aún pendiente en Byte. */
  cobradoManual: number;
  cobradoManualDocs: number;
  deudores: DeudorResumen[];
  antiguedad: TramoAntiguedad[];
  documentos: DocPorCobrar[];
  /** Ventas a crédito que Byte dejó SIN cuota: nadie las está cobrando. */
  huerfanos: { docKey: string; cliente: string; fecha: string; total: number }[];
  cuadre: CuadreReportes;
};

const VACIO: ReceivablesData = {
  hayDatos: false,
  hoy: "",
  diasParaAtraso: DIAS_PARA_ATRASO,
  ultimaCarga: { ventas: null, facturas: null },
  porCobrar: 0, porCobrarDocs: 0, atrasado: 0, atrasadoDocs: 0, cobrado: 0,
  cobradoManual: 0, cobradoManualDocs: 0,
  deudores: [], antiguedad: [], documentos: [], huerfanos: [],
  cuadre: {
    hayAmbos: false, periodo: null, facturas: 0, boletas: 0, tickets: 0,
    totalVentas: 0, facturasConsolidado: 0, diferencia: 0,
    anuladas: [], soloEnVentas: [], soloEnConsolidado: [], montosDistintos: [],
  },
};

type FilaDB = {
  doc_key: string; tipo: string; serie: string | null; fecha: string;
  cliente: string; documento: string | null; es_sede: boolean;
  total: number; credito: number; cobrado_pos: number;
  estado_cuota: string; estado_factura: string | null;
  cobrado_manual: boolean; origen_ventas: boolean; origen_facturas: boolean;
};

export async function getReceivables(): Promise<ReceivablesData> {
  const role = await getSessionRole();
  const puede = role?.kind === "full" || (role?.kind === "admin" && role.sede === ATELIER);
  if (!puede) return VACIO;

  const hoy = getToday();

  try {
    const filas = (await sql`
      SELECT doc_key, tipo, serie, fecha::text AS fecha, cliente, documento, es_sede,
             total::float AS total, credito::float AS credito, cobrado_pos::float AS cobrado_pos,
             estado_cuota, estado_factura, cobrado_manual, origen_ventas, origen_facturas
      FROM invoice_documents
      WHERE business_id = ${ATELIER}
      ORDER BY fecha DESC, doc_key DESC
    `) as FilaDB[];

    if (filas.length === 0) return { ...VACIO, hoy, hayDatos: false };

    const cargas = (await sql`
      SELECT tipo_reporte, MAX(periodo_fin)::text AS hasta
      FROM invoice_imports WHERE business_id = ${ATELIER}
      GROUP BY tipo_reporte
    `) as { tipo_reporte: string; hasta: string }[];

    // Una factura anulada no es venta ni deuda: sale de todo el análisis.
    const vivos = filas.filter((f) => f.estado_factura !== "ANULADO");

    const pendientes = vivos.filter((f) => f.estado_cuota === "PENDIENTE");

    const documentos: DocPorCobrar[] = pendientes.map((f) => {
      const dias = diasEntre(f.fecha, hoy);
      return {
        docKey: f.doc_key,
        tipo: f.tipo,
        serie: f.serie,
        fecha: f.fecha,
        cliente: f.cliente,
        documento: f.documento,
        esSede: f.es_sede,
        total: r2(f.total),
        dias,
        atrasado: dias >= DIAS_PARA_ATRASO,
        cobradoManual: f.cobrado_manual,
      };
    });
    documentos.sort((a, b) => b.dias - a.dias || b.total - a.total);

    // Deudores: por RUC cuando lo hay (identidad estable), si no por nombre.
    const porDeudor = new Map<string, DeudorResumen>();
    for (const d of documentos) {
      const clave = d.documento?.trim() || d.cliente.trim().toUpperCase();
      const prev = porDeudor.get(clave);
      if (prev) {
        prev.deuda = r2(prev.deuda + d.total);
        prev.documentos += 1;
        prev.diasMasViejo = Math.max(prev.diasMasViejo, d.dias);
        prev.atrasado = r2(prev.atrasado + (d.atrasado ? d.total : 0));
      } else {
        porDeudor.set(clave, {
          clave,
          cliente: d.cliente,
          documento: d.documento,
          esSede: d.esSede,
          deuda: d.total,
          documentos: 1,
          diasMasViejo: d.dias,
          atrasado: d.atrasado ? d.total : 0,
        });
      }
    }
    const deudores = [...porDeudor.values()].sort((a, b) => b.deuda - a.deuda);

    // Antigüedad: el tramo "al día" usa el umbral que eligió Jahnn.
    const tramos: { tramo: string; test: (d: number) => boolean }[] = [
      { tramo: `Al día (0–${DIAS_PARA_ATRASO - 1} días)`, test: (d) => d < DIAS_PARA_ATRASO },
      { tramo: `${DIAS_PARA_ATRASO}–15 días`, test: (d) => d >= DIAS_PARA_ATRASO && d <= 15 },
      { tramo: "16–30 días", test: (d) => d > 15 && d <= 30 },
      { tramo: "Más de 30 días", test: (d) => d > 30 },
    ];
    const antiguedad: TramoAntiguedad[] = tramos.map((t) => {
      const docs = documentos.filter((d) => t.test(d.dias));
      return {
        tramo: t.tramo,
        monto: r2(docs.reduce((s, d) => s + d.total, 0)),
        documentos: docs.length,
      };
    });

    const huerfanos = vivos
      .filter((f) => f.estado_cuota === "SIN_CUOTA" && f.cobrado_pos === 0 && f.origen_ventas)
      .map((f) => ({
        docKey: f.doc_key, cliente: f.cliente, fecha: f.fecha, total: r2(f.total),
      }))
      .sort((a, b) => b.total - a.total);

    const marcados = documentos.filter((d) => d.cobradoManual);

    return {
      hayDatos: true,
      hoy,
      diasParaAtraso: DIAS_PARA_ATRASO,
      ultimaCarga: {
        ventas: cargas.find((c) => c.tipo_reporte === "ventas")?.hasta ?? null,
        facturas: cargas.find((c) => c.tipo_reporte === "facturas")?.hasta ?? null,
      },
      porCobrar: r2(documentos.reduce((s, d) => s + d.total, 0)),
      porCobrarDocs: documentos.length,
      atrasado: r2(documentos.filter((d) => d.atrasado).reduce((s, d) => s + d.total, 0)),
      atrasadoDocs: documentos.filter((d) => d.atrasado).length,
      cobrado: r2(
        vivos
          .filter((f) => f.estado_cuota === "PAGADA")
          .reduce((s, f) => s + Number(f.total), 0),
      ),
      cobradoManual: r2(marcados.reduce((s, d) => s + d.total, 0)),
      cobradoManualDocs: marcados.length,
      deudores,
      antiguedad,
      documentos,
      huerfanos,
      cuadre: construirCuadre(filas),
    };
  } catch (e) {
    console.error("[getReceivables] failed:", e);
    if (faltaMigracion(e)) return { ...VACIO, hoy, faltaMigracion: true };
    return { ...VACIO, hoy };
  }
}

/**
 * El cuadre que pidió Jahnn, con la corrección que salió de los datos:
 * "facturas emitidas" NO es igual al reporte de ventas. El cuadre real
 * es a tres bandas (facturas + boletas + tickets = ventas), y el control
 * entre archivos es que las FACTURAS coincidan documento por documento.
 */
function construirCuadre(filas: FilaDB[]): CuadreReportes {
  const deVentas = filas.filter((f) => f.origen_ventas);
  const delConsolidado = filas.filter((f) => f.origen_facturas);

  if (deVentas.length === 0 || delConsolidado.length === 0) {
    const suma = (t: string) =>
      r2(deVentas.filter((f) => f.tipo === t).reduce((s, f) => s + Number(f.total), 0));
    return {
      ...VACIO.cuadre,
      hayAmbos: false,
      facturas: suma("FACTURA"),
      boletas: suma("BOLETA"),
      tickets: suma("TICKET"),
      totalVentas: r2(deVentas.reduce((s, f) => s + Number(f.total), 0)),
    };
  }

  // El período del cuadre es el que cubren ambos archivos.
  const fechasV = deVentas.map((f) => f.fecha).sort();
  const inicio = fechasV[0];
  const fin = fechasV[fechasV.length - 1];
  const enRango = (f: FilaDB) => f.fecha >= inicio && f.fecha <= fin;

  const ventasRango = deVentas.filter(enRango);
  const suma = (t: string) =>
    r2(ventasRango.filter((f) => f.tipo === t).reduce((s, f) => s + Number(f.total), 0));

  const facturas = suma("FACTURA");
  const boletas = suma("BOLETA");
  const tickets = suma("TICKET");

  const consolidadoVivo = delConsolidado.filter(
    (f) => enRango(f) && f.estado_factura === "EMITIDO",
  );
  const facturasConsolidado = r2(consolidadoVivo.reduce((s, f) => s + Number(f.total), 0));

  const enVentas = new Map(ventasRango.filter((f) => f.tipo === "FACTURA").map((f) => [f.doc_key, f]));
  const enConsolidado = new Map(consolidadoVivo.map((f) => [f.doc_key, f]));

  const breve = (f: FilaDB) => ({ docKey: f.doc_key, cliente: f.cliente, total: r2(f.total) });

  return {
    hayAmbos: true,
    periodo: { inicio, fin },
    facturas,
    boletas,
    tickets,
    totalVentas: r2(facturas + boletas + tickets),
    facturasConsolidado,
    diferencia: r2(facturas - facturasConsolidado),
    anuladas: delConsolidado
      .filter((f) => enRango(f) && f.estado_factura === "ANULADO")
      .map(breve),
    soloEnVentas: [...enVentas.values()].filter((f) => !enConsolidado.has(f.doc_key)).map(breve),
    soloEnConsolidado: [...enConsolidado.values()].filter((f) => !enVentas.has(f.doc_key)).map(breve),
    montosDistintos: [...enConsolidado.values()]
      .filter((f) => {
        const v = enVentas.get(f.doc_key);
        return v && Math.abs(Number(v.total) - Number(f.total)) > 0.005;
      })
      .map((f) => ({
        docKey: f.doc_key,
        cliente: f.cliente,
        enVentas: r2(enVentas.get(f.doc_key)!.total),
        enConsolidado: r2(f.total),
      })),
  };
}
