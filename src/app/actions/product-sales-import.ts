"use server";

/**
 * PIC · Import de ventas por producto (fuente: Byte, reporte "Productos
 * con mayor rotación"). Fase 0b del Business Knowledge Engine.
 *
 * Convenciones BKE (docs/PIC-ARQUITECTURA.md):
 * - Escritura atómica e IDEMPOTENTE: re-importar un mes reemplaza ese
 *   mes+fuente+negocio completo (DELETE+INSERT en una transacción,
 *   mismo patrón exento de snapshot que executeExcelImport).
 * - Procedencia total: source='byte', import_batch_id (fila real en
 *   import_batches), imported_at.
 * - Ninguna venta se pierde: sin match de catálogo → product_id NULL
 *   con product_name_raw, y se reporta en calidad de datos.
 * - Check de integridad natural: Σ archivo vs ventas Byte del mes que
 *   el sistema ya conoce (byte_sales_daily / daily_records).
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { matchSalesToCatalog } from "@/lib/product-matching";
import type { ByteRotacionItem } from "@/lib/byte-rotacion-parser";
import {
  cruzaDeMes, describirPeriodo, coberturaDelMes, describirHuecos,
  type Periodo, type Cobertura,
} from "@/lib/productos/periodos";
import {
  evaluarCargas, evaluarCarga, ultimoSabado,
  type CargaSede, type ResumenCargas, type EstadoCarga,
} from "@/lib/productos/cargas";
import { getToday } from "@/lib/utils";
import { elegirFuenteVentas, type FuenteVenta } from "@/lib/ventas-mes-sql";
import {
  claveDesdeNota, evaluarReportesSemanales,
  type CargaRegistrada, type EstadoSemanal,
} from "@/lib/incentivos/reportes-semanales";

const sql = neon(process.env.DATABASE_URL!);

function currentMonthLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7);
}

export type ProductSalesImportResult =
  | {
      ok: true;
      imported: number;
      matchedCount: number;
      unmatched: string[];
      totalRevenue: number;
      /** Ventas Byte del mes según el sistema (null si no hay registro). */
      systemMonthTotal: number | null;
      deltaVsSystem: number | null;
    }
  | { ok: false; error: string };

type ImportInput = {
  month: string;
  fileName: string | null;
  items: ByteRotacionItem[];
  declaredTotal: number | null;
  parseWarnings: string[];
  /** Rango del título del reporte, para validar que sea acumulado. */
  periodStart?: string | null;
  periodEnd?: string | null;
};

/** Import completo desde la página Productos — solo dirección. */
export async function importProductSales(input: ImportInput): Promise<ProductSalesImportResult> {
  const bId = await activeBusinessId();
  if (!(await requireFullSession())) {
    return { ok: false, error: "El import de Productos es solo para la dirección." };
  }
  return runImport(bId, input, `PIC · ventas por producto (Byte rotación) · ${input.month}`);
}

/**
 * Import desde Grupo → Productos con sede EXPLÍCITA (solo dirección).
 * Lección /grupo: la cookie de sede ahí dice "grupo" — activeBusinessId()
 * no sirve y la sede viaja validada como parámetro.
 */
export async function importProductSalesForSede(
  sede: number,
  input: ImportInput,
): Promise<ProductSalesImportResult> {
  if (!(await requireFullSession())) {
    return { ok: false, error: "El import de Productos es solo para la dirección." };
  }
  if (sede !== 1 && sede !== 2 && sede !== 3) {
    return { ok: false, error: "Sede inválida." };
  }
  return runImport(sede, input, `PIC · ventas por producto (Byte rotación, desde Grupo) · ${input.month}`);
}

/**
 * Import semanal desde el Panel de Sede (admin o dirección). Alimenta la
 * MISMA tabla canónica, con dos candados que protegen la historia:
 * - SOLO el mes en curso (el admin no puede pisar un mes cerrado).
 * - Solo el formato Rotación canónico (el modal filtra Rentabilidad).
 * Con esto el foco del día usa ventas frescas y el PIC se alimenta solo.
 */
export async function importProductSalesFromPanel(input: ImportInput): Promise<ProductSalesImportResult> {
  const bId = await activeBusinessId();
  const role = await getSessionRole();
  const allowed = role?.kind === "full" || (role?.kind === "admin" && role.sede === bId);
  if (!allowed) return { ok: false, error: "Sin acceso." };
  const current = currentMonthLima();
  if (input.month !== current) {
    return {
      ok: false,
      error: `Desde el panel solo se sube el mes en curso (${current}). Exporta el reporte con el rango del 1 del mes hasta hoy.`,
    };
  }

  // Cualquier rango dentro del mes vale: se acumula por períodos y una
  // carga nueva reemplaza a las que pisa (ver runImport). Lo ideal es la
  // semana, pero si sube el mes entero también sale bien.
  return runImport(bId, input, `PIC · rotación semanal desde Panel de Sede · ${input.month}`);
}

async function runImport(bId: number, input: ImportInput, batchNote: string): Promise<ProductSalesImportResult> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) {
    return { ok: false, error: "Mes inválido (formato AAAA-MM)." };
  }

  // Un período NO puede cruzar de mes. El reporte trae una fila por
  // plato con el total del rango, sin fecha por fila: si abarca del 29
  // de agosto al 4 de setiembre, no hay forma de saber cuánto fue de
  // cada mes. La única salida honesta es pedir los dos archivos.
  if (input.periodStart && input.periodEnd) {
    const cruce = cruzaDeMes({ inicio: input.periodStart, fin: input.periodEnd });
    if (cruce.cruza) {
      const [a, b] = cruce.corte;
      return {
        ok: false,
        error:
          `Ese reporte va ${describirPeriodo({ inicio: input.periodStart, fin: input.periodEnd })}, ` +
          `y cruza de un mes al otro. El reporte de Byte no trae el detalle por día, así que no se ` +
          `puede repartir. Súbelo en DOS archivos: uno ${describirPeriodo(a)} y otro ${describirPeriodo(b)}.`,
      };
    }
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "No hay productos para importar." };
  }
  for (const it of input.items) {
    if (!it.name?.trim() || !Number.isFinite(it.units) || !Number.isFinite(it.revenue) || it.units < 0 || it.revenue < 0) {
      return { ok: false, error: `Fila inválida en el archivo: "${it.name ?? "(sin nombre)"}".` };
    }
  }

  try {
    // 1) Matching contra el catálogo canónico + alias manuales del dueño.
    const catalog = (await sql`
      SELECT id::text, name FROM products WHERE business_id = ${bId}
    `) as { id: string; name: string }[];
    let aliasRows: { alias_normalized: string; product_id: string }[] = [];
    try {
      aliasRows = (await sql`
        SELECT alias_normalized, product_id::text FROM product_aliases WHERE business_id = ${bId}
      `) as typeof aliasRows;
    } catch {
      // migración de alias pendiente: se matchea solo por nombre
    }
    const match = matchSalesToCatalog(
      input.items,
      catalog,
      new Map(aliasRows.map((a) => [a.alias_normalized, a.product_id])),
    );

    // 2) Escritura atómica e idempotente + lote de procedencia.
    const batchId = crypto.randomUUID();
    const [y, m] = input.month.split("-").map(Number);
    const monthStart = `${input.month}-01`;
    const monthEnd = `${input.month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
    const totalRevenue = Math.round(input.items.reduce((s, it) => s + it.revenue, 0) * 100) / 100;
    const warnings = [
      ...input.parseWarnings,
      ...(match.ambiguous.length > 0
        ? [`Nombres ambiguos en catálogo (no se matchean): ${match.ambiguous.join(", ")}`]
        : []),
    ];

    const rows = [
      ...match.matched.map((it) => ({ ...it, productId: it.productId as string | null })),
      ...match.unmatched.map((it) => ({ ...it, productId: null as string | null })),
    ];

    // El período que cubre este archivo. Sin rango declarado (cargas
    // viejas desde Grupo) se asume el mes entero, que es lo que esas
    // cargas siempre fueron.
    const pIni = input.periodStart ?? monthStart;
    const pFin = input.periodEnd ?? monthEnd;

    await sql.transaction([
      sql`INSERT INTO import_batches (id, business_id, file_name, date_range_start, date_range_end,
            movements_count, status, rollback_available, notes, warnings_json)
          VALUES (${batchId}, ${bId}, ${input.fileName}, ${pIni}, ${pFin},
            ${rows.length}, 'completed', false,
            ${batchNote},
            ${JSON.stringify(warnings)}::jsonb)`,

      // 1) Fuera los períodos que este archivo PISA. Es la regla que
      //    evita el doble conteo: el mes entero reemplaza a las semanas
      //    de adentro, y re-subir una semana la actualiza.
      sql`DELETE FROM product_period_sales
          WHERE business_id = ${bId} AND source = 'byte'
            AND period_start <= ${pFin}::date AND ${pIni}::date <= period_end`,

      // 2) Entra el período nuevo.
      ...rows.map(
        (it) => sql`
          INSERT INTO product_period_sales
            (business_id, period_start, period_end, month, product_id, product_name_raw,
             units, revenue, source, import_batch_id, file_name)
          VALUES (${bId}, ${pIni}, ${pFin}, ${input.month}, ${it.productId}, ${it.name},
                  ${it.units}, ${it.revenue}, 'byte', ${batchId}, ${input.fileName})`,
      ),

      // 3) El mes se RECALCULA como la suma de sus períodos. Todo lo que
      //    ya lee product_month_sales (portfolio, alias, incentivos)
      //    sigue igual sin enterarse de este cambio.
      sql`DELETE FROM product_month_sales
          WHERE business_id = ${bId} AND month = ${input.month} AND source = 'byte'`,
      sql`INSERT INTO product_month_sales
            (business_id, product_id, product_name_raw, month, units, revenue, source, import_batch_id)
          SELECT business_id, product_id, MIN(product_name_raw), month,
                 SUM(units), SUM(revenue), 'byte', ${batchId}
          FROM product_period_sales
          WHERE business_id = ${bId} AND month = ${input.month} AND source = 'byte'
          GROUP BY business_id, month, product_id,
                   CASE WHEN product_id IS NULL THEN lower(product_name_raw) ELSE NULL END`,
    ]);

    // 3) Check de integridad natural contra las ventas Byte del sistema
    //    (tercera fuente: el registro diario del admin en upselling_daily,
    //    clave para el mes en curso subido desde el Panel de Sede).
    // La elección de fuente vive en lib/ventas-mes-sql.ts: una fuente
    // rota (filas en cero de un import a medias) ya no puede ganarle a
    // una completa. Antes esta cadena estaba copiada acá y en
    // breakeven.ts — dos copias de la misma regla es como empieza a
    // divergir un número.
    const sys = (await sql`
      SELECT 'byte' AS fuente,
             COALESCE(SUM(total), 0)::float AS total,
             COUNT(*) FILTER (WHERE total > 0)::int AS dias
      FROM byte_sales_daily
      WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
      UNION ALL
      SELECT 'cierre',
             COALESCE(SUM(byte_total), 0)::float,
             COUNT(*) FILTER (WHERE byte_total > 0)::int
      FROM daily_records
      WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd} AND archived = false
      UNION ALL
      SELECT 'registro',
             COALESCE(SUM(revenue), 0)::float,
             COUNT(*) FILTER (WHERE revenue > 0)::int
      FROM upselling_daily
      WHERE business_id = ${bId} AND date BETWEEN ${monthStart} AND ${monthEnd}
    `) as { fuente: FuenteVenta["fuente"]; total: number; dias: number }[];
    const ordenFuentes: FuenteVenta["fuente"][] = ["byte", "cierre", "registro"];
    const elegida = elegirFuenteVentas(
      ordenFuentes.map((f) => sys.find((r) => r.fuente === f) ?? { fuente: f, total: 0, dias: 0 }),
    );
    // null (y no 0) cuando no hay ninguna fuente: el check de integridad
    // distingue "no hay con qué comparar" de "comparó y dio cero".
    const systemMonthTotal = elegida.fuente === null ? null : elegida.total;

    revalidatePath("/[negocio]/productos", "page");
    revalidatePath("/[negocio]/panel", "page");
    return {
      ok: true,
      imported: rows.length,
      matchedCount: match.matched.length,
      unmatched: match.unmatched.map((u) => u.name),
      totalRevenue,
      systemMonthTotal,
      deltaVsSystem: systemMonthTotal !== null ? Math.round((totalRevenue - systemMonthTotal) * 100) / 100 : null,
    };
  } catch (err) {
    console.error("[importProductSales] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al importar las ventas" };
  }
}

/**
 * Elimina las ventas por producto de UN mes (sede activa). Pensado para
 * retirar meses incompletos (ej. marzo cargado desde un reporte parcial).
 * Reversible: re-subir el archivo del mes lo recupera. Los lotes en
 * import_batches quedan marcados 'rolled_back' (auditoría, no se borran).
 * NO toca saldos ni movimientos financieros — solo la tabla canónica PIC.
 */
export async function deleteProductSalesMonth(
  month: string,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return { ok: false, error: "Mes inválido." };
  }
  try {
    const batches = (await sql`
      SELECT DISTINCT import_batch_id::text AS id FROM product_month_sales
      WHERE business_id = ${bId} AND month = ${month} AND source = 'byte' AND import_batch_id IS NOT NULL
    `) as { id: string }[];
    const deleted = (await sql`
      DELETE FROM product_month_sales
      WHERE business_id = ${bId} AND month = ${month} AND source = 'byte'
      RETURNING id
    `) as { id: string }[];
    if (batches.length > 0) {
      await sql`
        UPDATE import_batches SET status = 'rolled_back', rollback_available = false
        WHERE id = ANY(${batches.map((b) => b.id)}::uuid[]) AND business_id = ${bId}
      `;
    }
    revalidatePath("/[negocio]/productos", "page");
    return { ok: true, deleted: deleted.length };
  } catch (err) {
    console.error("[deleteProductSalesMonth] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al eliminar el mes" };
  }
}

export type ProductDataStatus = {
  catalog: { total: number; active: number; latestSnapshotMonth: string | null };
  months: {
    month: string;
    products: number;
    matched: number;
    totalRevenue: number;
    importedAt: string;
  }[];
};

/** Estado del cimiento de datos PIC para el negocio activo (solo lectura). */
export async function getProductDataStatus(): Promise<ProductDataStatus> {
  const bId = await activeBusinessId();
  const cat = (await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE active)::int AS active,
           (SELECT MAX(month) FROM product_cost_snapshots s
             JOIN products p ON p.id = s.product_id WHERE p.business_id = ${bId}) AS latest
    FROM products WHERE business_id = ${bId}
  `) as { total: number; active: number; latest: string | null }[];
  const months = (await sql`
    SELECT month,
           COUNT(*)::int AS products,
           COUNT(product_id)::int AS matched,
           SUM(revenue)::float AS total_revenue,
           MAX(imported_at)::text AS imported_at
    FROM product_month_sales
    WHERE business_id = ${bId}
    GROUP BY month ORDER BY month DESC
  `) as { month: string; products: number; matched: number; total_revenue: number; imported_at: string }[];
  return {
    catalog: {
      total: cat[0]?.total ?? 0,
      active: cat[0]?.active ?? 0,
      latestSnapshotMonth: cat[0]?.latest ?? null,
    },
    months: months.map((m) => ({
      month: m.month,
      products: m.products,
      matched: m.matched,
      totalRevenue: Math.round((m.total_revenue ?? 0) * 100) / 100,
      importedAt: m.imported_at,
    })),
  };
}

/* ─────────────────────────────────────────────────────────────────────
 * Control de cargas del reporte de productos (pedido de Jahnn, 18-ago-2026)
 *
 * "El sistema deberá reportarme los días de subida de este informe, que
 *  idealmente son todos los sábados."
 *
 * OJO con la zona horaria: `imported_at` se guarda en UTC y las cargas
 * suelen hacerse de noche. La del 15-ago 22:45 de Lima quedó grabada
 * como 16-ago 03:45 UTC — leerla en UTC la corre al día siguiente y
 * convierte un sábado en domingo. Se convierte a Lima en el SELECT.
 * ───────────────────────────────────────────────────────────────────── */

export type EstadoCargasProductos = {
  esDireccion: boolean;
  hoy: string;
  resumen: ResumenCargas | null;
};

export async function getEstadoCargasProductos(): Promise<EstadoCargasProductos> {
  const hoy = getToday();
  const role = await getSessionRole();
  // Es una vista de control de las 3 sedes: solo dirección.
  if (role?.kind !== "full") return { esDireccion: false, hoy, resumen: null };

  try {
    const filas = (await sql`
      WITH por_mes AS (
        SELECT business_id, month,
               COUNT(*)::int AS productos,
               MAX(imported_at) AS cargado_en
        FROM product_month_sales
        GROUP BY business_id, month
      ),
      ultima AS (
        SELECT DISTINCT ON (business_id)
               business_id, month, productos, cargado_en
        FROM por_mes
        ORDER BY business_id, cargado_en DESC
      ),
      habitual AS (
        -- Mediana de las cargas ANTERIORES: si la última viene truncada,
        -- no debe arrastrar hacia abajo su propia referencia.
        SELECT p.business_id,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.productos)::int AS mediana
        FROM por_mes p
        JOIN ultima u ON u.business_id = p.business_id
        WHERE p.month <> u.month
        GROUP BY p.business_id
      )
      SELECT b.id AS business_id, b.name,
             (u.cargado_en AT TIME ZONE 'America/Lima')::date::text AS ultima_carga,
             u.month AS ultimo_mes,
             COALESCE(u.productos, 0) AS productos,
             h.mediana
      FROM businesses b
      LEFT JOIN ultima u ON u.business_id = b.id
      LEFT JOIN habitual h ON h.business_id = b.id
      ORDER BY b.id
    `) as {
      business_id: number; name: string; ultima_carga: string | null;
      ultimo_mes: string | null; productos: number; mediana: number | null;
    }[];

    const cargas: CargaSede[] = filas.map((f) => ({
      businessId: f.business_id,
      sede: f.name.replace(/^Yayi'?s\s+/i, ""),
      ultimaCarga: f.ultima_carga,
      ultimoMes: f.ultimo_mes,
      productosUltimaCarga: f.productos,
      productosHabitual: f.mediana,
    }));

    return { esDireccion: true, hoy, resumen: evaluarCargas(cargas, hoy) };
  } catch (e) {
    console.error("[getEstadoCargasProductos] failed:", e);
    return { esDireccion: true, hoy, resumen: null };
  }
}

/* ─────────────────────────────────────────────────────────────────────
 * El mismo control, pero visto desde el panel de UNA sede.
 *
 * Pedido de Jahnn (18-ago-2026): que el administrador vea, como en el
 * Highlight, si ya subió lo que le toca. Corre sobre la MISMA función
 * que el control de Grupo: si cada pantalla contara por su cuenta,
 * Jahnn vería "falta" y el administrador "listo".
 * ───────────────────────────────────────────────────────────────────── */

export type CargaSedePropia = {
  /** Los reportes del sábado y cuáles faltan esta semana. */
  semanal: EstadoSemanal | null;
  visible: boolean;
  hoy: string;
  estado: EstadoCarga | null;
  /** Sábado de esta semana: el día en que toca subirlo. */
  sabado: string;
  /**
   * El rango que hay que exportar de Byte: del 1 del mes hasta hoy.
   *
   * Es acumulado y NO semanal a propósito. La rutina del sábado son
   * TRES reportes (rotación, cortesías, ventas por
   * trabajador) y los otros tres son el candado de los bonos de ticket
   * promedio: si se suben por semanas sueltas, un cambio de precio o
   * una cortesía registrada tarde se queda fuera del control. Un solo
   * rango para los tres es una sola instrucción y una sola forma de
   * equivocarse.
   */
  rangoQueToca: Periodo;
  /** Qué parte del mes en curso ya está cubierta. */
  cobertura: Cobertura | null;
  /** Los tramos que faltan, en palabras. */
  huecos: string;
};

export async function getCargaProductosSede(): Promise<CargaSedePropia> {
  const hoy = getToday();
  const sabado = ultimoSabado(hoy);
  const rango: Periodo = { inicio: `${hoy.slice(0, 7)}-01`, fin: hoy };
  const vacio: CargaSedePropia = {
    semanal: null,
    visible: false, hoy, estado: null, sabado,
    rangoQueToca: rango, cobertura: null, huecos: "",
  };

  const role = await getSessionRole();
  if (!role) return vacio;

  let bId: number;
  try {
    bId = await activeBusinessId();
  } catch (e) {
    console.error("[getCargaProductosSede] activeBusinessId:", e);
    return vacio;
  }
  const puedeVer = role.kind === "full" || (role.kind === "admin" && role.sede === bId);
  if (!puedeVer) return vacio;

  try {
    const filas = (await sql`
      WITH por_mes AS (
        SELECT month, COUNT(*)::int AS productos, MAX(imported_at) AS cargado_en
        FROM product_month_sales WHERE business_id = ${bId} GROUP BY month
      ),
      ultima AS (
        SELECT month, productos, cargado_en FROM por_mes ORDER BY cargado_en DESC LIMIT 1
      )
      SELECT b.name,
             (u.cargado_en AT TIME ZONE 'America/Lima')::date::text AS ultima_carga,
             u.month AS ultimo_mes,
             COALESCE(u.productos, 0) AS productos,
             (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY p.productos)::int
                FROM por_mes p WHERE p.month <> (SELECT month FROM ultima)) AS mediana
      FROM businesses b
      LEFT JOIN ultima u ON true
      WHERE b.id = ${bId}
    `) as {
      name: string; ultima_carga: string | null; ultimo_mes: string | null;
      productos: number; mediana: number | null;
    }[];
    if (filas.length === 0) return vacio;

    const f = filas[0];
    const carga: CargaSede = {
      businessId: bId,
      sede: f.name.replace(/^Yayi'?s\s+/i, ""),
      ultimaCarga: f.ultima_carga,
      ultimoMes: f.ultimo_mes,
      productosUltimaCarga: f.productos,
      productosHabitual: f.mediana,
    };
    // Cobertura del mes en curso: qué días ya tienen datos y cuáles no.
    // Es lo que hace esto auditable — se ve el hueco, no solo un total.
    const mes = hoy.slice(0, 7);
    const periodos = (await sql`
      SELECT DISTINCT period_start::text AS inicio, period_end::text AS fin
      FROM product_period_sales
      WHERE business_id = ${bId} AND month = ${mes} AND source = 'byte'
    `) as { inicio: string; fin: string }[];
    const cobertura = coberturaDelMes(periodos, mes, hoy);

    // Los reportes del sábado. Se leen de import_batches y no de los
    // datos: Cortesías y Cambios de Precio pueden venir legítimamente
    // vacíos, y "no hubo" no es lo mismo que "no lo subiste".
    let semanal: EstadoSemanal | null = null;
    try {
      const subidas = (await sql`
        SELECT notes, (imported_at AT TIME ZONE 'America/Lima')::date::text AS fecha
        FROM import_batches
        WHERE business_id = ${bId} AND notes IS NOT NULL
        ORDER BY imported_at DESC
        LIMIT 200
      `) as { notes: string | null; fecha: string }[];
      const cargas: CargaRegistrada[] = [];
      for (const x of subidas) {
        const clave = claveDesdeNota(x.notes);
        if (clave) cargas.push({ clave, fecha: x.fecha });
      }
      semanal = evaluarReportesSemanales(cargas, hoy, bId);
    } catch (e) {
      console.error("[getCargaProductosSede] semanal:", e);
    }

    return {
      semanal,
      visible: true, hoy, estado: evaluarCarga(carga, hoy), sabado,
      rangoQueToca: rango,
      cobertura,
      huecos: describirHuecos(cobertura.huecos),
    };
  } catch (e) {
    console.error("[getCargaProductosSede] failed:", e);
    return vacio;
  }
}
