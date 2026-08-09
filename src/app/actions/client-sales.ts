"use server";

/**
 * Ventas por Cliente (Byte) — seguimiento de los mejores clientes B2B.
 *
 * Luis (admin de Atelier) sube cada semana el reporte de Byte. Cada
 * archivo es un SNAPSHOT con su rango de fechas; reimportar el mismo
 * rango lo reemplaza (idempotente, sin duplicar).
 *
 * REGLA DE ORO (decisión de Jahnn, 09-ago-2026): las ventas a Fonavi y
 * Centro NO son ventas a clientes — son traslados dentro del grupo. En
 * el archivo de muestra eran el 66% del total y tapaban por completo a
 * los clientes reales. Van marcadas (`es_sede`) y separadas en su
 * propio bloque; el ranking que importa es el de EXTERNOS.
 *
 * La comparación entre semanas se hace por DOCUMENTO (RUC/DNI), no por
 * nombre: la razón social puede venir escrita distinto entre exports.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { getSessionRole } from "@/lib/session-access";
import type { ClientSalesRow } from "@/lib/client-sales-parser";

const sql = neon(process.env.DATABASE_URL!);

/** Atelier es la única sede que vende B2B por cliente. */
const ATELIER = 1;

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

async function requireSedeAccess(bId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind === "full") return { ok: true };
  if (role?.kind === "admin" && role.sede === bId) return { ok: true };
  return { ok: false, error: "Sin acceso a esta sede." };
}

/** La tabla puede no existir si aún no se corrió la migración. */
function faltaMigracion(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .*client_sales.* does not exist/i.test(msg);
}

// ─────────────────────────────────────────────────────────────────
// Importar
// ─────────────────────────────────────────────────────────────────

export async function importClientSales(input: {
  filas: ClientSalesRow[];
  periodo: { inicio: string; fin: string };
  archivo: string | null;
}): Promise<
  | { ok: true; clientes: number; reemplazo: boolean; periodo: { inicio: string; fin: string } }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  if (bId !== ATELIER) {
    return { ok: false, error: "Este reporte es solo de Atelier." };
  }
  const access = await requireSedeAccess(bId);
  if (!access.ok) return access;

  const { filas, periodo } = input;
  if (!Array.isArray(filas) || filas.length === 0) {
    return { ok: false, error: "El archivo no trae clientes." };
  }
  if (filas.length > 5000) return { ok: false, error: "Demasiados clientes en un solo archivo." };
  const esFecha = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!esFecha(periodo.inicio) || !esFecha(periodo.fin)) {
    return { ok: false, error: "El período del archivo no es válido." };
  }
  if (periodo.inicio > periodo.fin) {
    return { ok: false, error: "El período del archivo está invertido." };
  }
  for (const f of filas) {
    if (!f.cliente?.trim()) return { ok: false, error: "Hay un cliente sin nombre en el archivo." };
    if (!Number.isFinite(f.totalVentas) || f.totalVentas < 0) {
      return { ok: false, error: `Venta inválida en «${f.cliente}».` };
    }
  }

  const ventas = r2(filas.reduce((s, f) => s + f.totalVentas, 0));
  const ventasSedes = r2(filas.filter((f) => f.esSede).reduce((s, f) => s + f.totalVentas, 0));

  try {
    const previo = await sql`
      SELECT id FROM client_sales_snapshots
      WHERE business_id = ${bId} AND periodo_inicio = ${periodo.inicio} AND periodo_fin = ${periodo.fin}
    `;
    const reemplazo = previo.length > 0;

    console.log(
      `[importClientSales] bId=${bId} periodo=${periodo.inicio}..${periodo.fin} filas=${filas.length} reemplazo=${reemplazo}`,
    );

    // Reimportar el mismo rango reemplaza: se borra el snapshot anterior
    // (las filas caen por ON DELETE CASCADE) y se vuelve a insertar.
    if (reemplazo) {
      await sql`DELETE FROM client_sales_snapshots WHERE id = ${previo[0].id}`;
    }

    const [snap] = await sql`
      INSERT INTO client_sales_snapshots
        (business_id, periodo_inicio, periodo_fin, archivo,
         total_ventas, total_pedidos, total_clientes, ventas_externas, ventas_sedes)
      VALUES (${bId}, ${periodo.inicio}, ${periodo.fin}, ${input.archivo},
              ${ventas}, ${filas.reduce((s, f) => s + f.totalPedidos, 0)}, ${filas.length},
              ${r2(ventas - ventasSedes)}, ${ventasSedes})
      RETURNING id
    `;

    for (const f of filas) {
      await sql`
        INSERT INTO client_sales_rows
          (snapshot_id, documento, tipo_doc, cliente, es_sede, sede_id,
           total_pedidos, con_comprobante, sin_comprobante,
           total_ventas, ticket_promedio, primera_compra, ultima_compra)
        VALUES (${snap.id}, ${f.documento}, ${f.tipoDoc}, ${f.cliente.trim()},
                ${f.esSede}, ${f.sedeId},
                ${f.totalPedidos}, ${f.conComprobante}, ${f.sinComprobante},
                ${f.totalVentas}, ${f.ticketPromedio}, ${f.primeraCompra}, ${f.ultimaCompra})
      `;
    }

    revalidatePath("/", "layout");
    return { ok: true, clientes: filas.length, reemplazo, periodo };
  } catch (e) {
    console.error("[importClientSales] failed:", e);
    if (faltaMigracion(e)) {
      return { ok: false, error: "Falta correr la migración de la base de datos. Avísale a Jahnn." };
    }
    return { ok: false, error: "No pude guardar el reporte. Intenta de nuevo." };
  }
}

// ─────────────────────────────────────────────────────────────────
// Leer y analizar
// ─────────────────────────────────────────────────────────────────

export type ClienteAnalisis = {
  documento: string | null;
  cliente: string;
  ventas: number;
  pedidos: number;
  ticket: number;
  ultimaCompra: string | null;
  /** Participación sobre el total de ventas externas del período. */
  peso: number;
  /** vs. el período anterior. null = no estaba antes (cliente nuevo). */
  ventasAnteriores: number | null;
  variacionPct: number | null;
  estado: "nuevo" | "creció" | "cayó" | "estable";
};

export type SedeVenta = { sedeId: number; sede: string; ventas: number; pedidos: number };

export type ClientSalesAnalisis = {
  hayDatos: boolean;
  faltaMigracion?: boolean;
  periodo: { inicio: string; fin: string } | null;
  periodoAnterior: { inicio: string; fin: string } | null;
  archivo: string | null;
  /** Ventas a clientes externos (lo que de verdad es venta nueva). */
  ventasExternas: number;
  ventasExternasAnterior: number | null;
  ventasSedes: number;
  totalPedidos: number;
  clientesExternos: number;
  ticketPromedio: number;
  /** Ranking de externos, de mayor a menor. */
  ranking: ClienteAnalisis[];
  /** Cuánto le vendió Atelier a cada sede del grupo. */
  sedes: SedeVenta[];
  /** Clientes que compraron antes y NO en este período. */
  dejaronDeComprar: { documento: string | null; cliente: string; ventasAnteriores: number }[];
  /** Cuántos clientes hacen el 80% de la venta (concentración). */
  concentracion: { clientesPara80: number; pesoTop3: number };
  /** Pedidos sin comprobante — control operativo. */
  sinComprobante: number;
  /** Historial para el gráfico de evolución. */
  historial: { periodo: string; fin: string; externas: number; sedes: number }[];
};

const VACIO: ClientSalesAnalisis = {
  hayDatos: false, periodo: null, periodoAnterior: null, archivo: null,
  ventasExternas: 0, ventasExternasAnterior: null, ventasSedes: 0, totalPedidos: 0,
  clientesExternos: 0, ticketPromedio: 0, ranking: [], sedes: [],
  dejaronDeComprar: [], concentracion: { clientesPara80: 0, pesoTop3: 0 },
  sinComprobante: 0, historial: [],
};

const SEDE_NOMBRE: Record<number, string> = { 2: "Fonavi", 3: "Centro" };

/** Análisis del último período importado (o del que se pida). */
export async function getClientSalesAnalisis(
  snapshotId?: string,
): Promise<ClientSalesAnalisis> {
  const bId = ATELIER;
  const role = await getSessionRole();
  const puede = role?.kind === "full" || (role?.kind === "admin" && role.sede === bId);
  if (!puede) return VACIO;

  try {
    const snaps = (await sql`
      SELECT id, periodo_inicio::text AS inicio, periodo_fin::text AS fin, archivo,
             total_ventas::float AS ventas, total_pedidos, total_clientes,
             ventas_externas::float AS externas, ventas_sedes::float AS sedes
      FROM client_sales_snapshots
      WHERE business_id = ${bId}
      ORDER BY periodo_fin DESC
      LIMIT 12
    `) as {
      id: string; inicio: string; fin: string; archivo: string | null;
      ventas: number; total_pedidos: number; total_clientes: number;
      externas: number; sedes: number;
    }[];

    if (snaps.length === 0) return { ...VACIO, hayDatos: false };

    const actualIdx = snapshotId ? Math.max(0, snaps.findIndex((s) => s.id === snapshotId)) : 0;
    const actual = snaps[actualIdx];
    const anterior = snaps[actualIdx + 1] ?? null;

    const filasActual = (await sql`
      SELECT documento, cliente, es_sede, sede_id, total_pedidos,
             sin_comprobante, total_ventas::float AS ventas,
             ticket_promedio::float AS ticket, ultima_compra::text AS ultima
      FROM client_sales_rows WHERE snapshot_id = ${actual.id}
      ORDER BY total_ventas DESC
    `) as {
      documento: string | null; cliente: string; es_sede: boolean; sede_id: number | null;
      total_pedidos: number; sin_comprobante: number; ventas: number;
      ticket: number; ultima: string | null;
    }[];

    const filasAnterior = anterior
      ? ((await sql`
          SELECT documento, cliente, es_sede, total_ventas::float AS ventas
          FROM client_sales_rows WHERE snapshot_id = ${anterior.id}
        `) as { documento: string | null; cliente: string; es_sede: boolean; ventas: number }[])
      : [];

    // Índice del período anterior por documento (o nombre si no hay doc).
    const clave = (d: string | null, c: string) => (d && d.trim()) || c.trim().toUpperCase();
    const antes = new Map<string, { cliente: string; ventas: number }>();
    for (const f of filasAnterior) {
      if (f.es_sede) continue;
      antes.set(clave(f.documento, f.cliente), { cliente: f.cliente, ventas: Number(f.ventas) });
    }

    const externos = filasActual.filter((f) => !f.es_sede);
    const totalExternas = r2(externos.reduce((s, f) => s + Number(f.ventas), 0));

    const ranking: ClienteAnalisis[] = externos.map((f) => {
      const k = clave(f.documento, f.cliente);
      const prev = antes.get(k);
      const ventas = r2(f.ventas);
      const ventasAnteriores = prev ? r2(prev.ventas) : null;
      let variacionPct: number | null = null;
      let estado: ClienteAnalisis["estado"] = "nuevo";
      if (ventasAnteriores !== null) {
        variacionPct = ventasAnteriores > 0
          ? r2(((ventas - ventasAnteriores) / ventasAnteriores) * 100)
          : null;
        // Umbral del 5%: debajo de eso es ruido, no una tendencia.
        estado = variacionPct === null ? "estable"
          : variacionPct > 5 ? "creció"
          : variacionPct < -5 ? "cayó"
          : "estable";
      }
      antes.delete(k); // lo que quede en `antes` = dejó de comprar
      return {
        documento: f.documento, cliente: f.cliente, ventas,
        pedidos: f.total_pedidos, ticket: r2(f.ticket), ultimaCompra: f.ultima,
        peso: totalExternas > 0 ? r2((ventas / totalExternas) * 100) : 0,
        ventasAnteriores, variacionPct, estado,
      };
    });

    const dejaronDeComprar = [...antes.entries()]
      .map(([doc, v]) => ({
        documento: doc.match(/^\d+$/) ? doc : null,
        cliente: v.cliente,
        ventasAnteriores: r2(v.ventas),
      }))
      .filter((c) => c.ventasAnteriores > 0)
      .sort((a, b) => b.ventasAnteriores - a.ventasAnteriores);

    // Concentración: cuántos clientes hacen el 80% de la venta.
    let acum = 0, clientesPara80 = 0;
    for (const c of ranking) {
      if (acum >= totalExternas * 0.8) break;
      acum += c.ventas;
      clientesPara80++;
    }
    const pesoTop3 = totalExternas > 0
      ? r2((ranking.slice(0, 3).reduce((s, c) => s + c.ventas, 0) / totalExternas) * 100)
      : 0;

    const sedes: SedeVenta[] = filasActual
      .filter((f) => f.es_sede)
      .map((f) => ({
        sedeId: f.sede_id ?? 0,
        sede: SEDE_NOMBRE[f.sede_id ?? 0] ?? f.cliente,
        ventas: r2(f.ventas),
        pedidos: f.total_pedidos,
      }))
      .sort((a, b) => b.ventas - a.ventas);

    const pedidosExternos = externos.reduce((s, f) => s + f.total_pedidos, 0);

    return {
      hayDatos: true,
      periodo: { inicio: actual.inicio, fin: actual.fin },
      periodoAnterior: anterior ? { inicio: anterior.inicio, fin: anterior.fin } : null,
      archivo: actual.archivo,
      ventasExternas: totalExternas,
      ventasExternasAnterior: anterior ? r2(anterior.externas) : null,
      ventasSedes: r2(actual.sedes),
      totalPedidos: actual.total_pedidos,
      clientesExternos: externos.length,
      ticketPromedio: pedidosExternos > 0 ? r2(totalExternas / pedidosExternos) : 0,
      ranking,
      sedes,
      dejaronDeComprar,
      concentracion: { clientesPara80, pesoTop3 },
      sinComprobante: filasActual.reduce((s, f) => s + (f.sin_comprobante || 0), 0),
      historial: snaps
        .slice()
        .reverse()
        .map((s) => ({
          periodo: s.inicio,
          fin: s.fin,
          externas: r2(s.externas),
          sedes: r2(s.sedes),
        })),
    };
  } catch (e) {
    console.error("[getClientSalesAnalisis] failed:", e);
    if (faltaMigracion(e)) return { ...VACIO, faltaMigracion: true };
    return VACIO;
  }
}

/** Lista de períodos importados, para el selector. */
export async function listClientSalesSnapshots(): Promise<
  { id: string; inicio: string; fin: string; externas: number }[]
> {
  const role = await getSessionRole();
  const puede = role?.kind === "full" || (role?.kind === "admin" && role.sede === ATELIER);
  if (!puede) return [];
  try {
    return (await sql`
      SELECT id, periodo_inicio::text AS inicio, periodo_fin::text AS fin,
             ventas_externas::float AS externas
      FROM client_sales_snapshots WHERE business_id = ${ATELIER}
      ORDER BY periodo_fin DESC LIMIT 24
    `) as { id: string; inicio: string; fin: string; externas: number }[];
  } catch {
    return [];
  }
}
