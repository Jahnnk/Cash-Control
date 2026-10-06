"use server";

/**
 * Tu sistema mensual de control financiero · acciones (pedido de Jahnn, 6-oct-2026).
 * Las reglas viven en lib/control-mensual.ts y lib/compromisos.ts; aquí solo se juntan los
 * números que ya calcula el sistema en otras pantallas, para que todas digan lo mismo:
 *   · Saldo: getLiquidezGrupo (la lectura del banco del Excel). Entradas: ingresos operativos
 *     (totalesMesSede). Compromisos: pagos fijos detectados + facturas a crédito de Control de
 *     Caja + los anotados a mano.
 *   · Ventas: el cargador único (loadVentaRowsBlended). Meta: venta esperada del presupuesto
 *     aprobado; si no hay, el punto de equilibrio.
 *   · Cobros: el libro de cuentas por cobrar de Atelier (getReceivables).
 *   · Gastos no previstos: los desvíos del presupuesto + lo registrado sobre el tope en Control de Caja.
 *   · Cierre: las seis cifras, el punto de equilibrio y el presupuesto del mes siguiente.
 * Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { loadVentaRowsBlended } from "@/lib/kpis/ventas-loader";
import { totalesMesSede } from "@/lib/totales-mes-sede";
import { getLiquidezGrupo } from "./liquidez";
import { getReceivables } from "./receivables";
import { getEquilibrioSede } from "./breakeven";
import { getSeisCifras } from "./seis-cifras";
import { getMatrizDecision } from "./decision";
import { planDe, gastoPorCategoria, presupuestoDeSede } from "@/lib/presupuesto-datos";
import { areaDe, montoDe, mayoresDesvios, type Desvio } from "@/lib/presupuesto";
import { analizarEquilibrio } from "@/lib/equilibrio";
import { matrizDeSede } from "@/lib/decisiones";
import {
  CATEGORIAS_COMPROMISO, detectarPatrones, liquidezContraCompromisos, mesMas, proyectarRecurrentes, sumarDias, ultimoDia,
  type Compromiso, type Liquidez, type Pago,
} from "@/lib/compromisos";
import {
  CHECKLIST, mayoresCambios, ritmoVentas, semaforoCobros, semanaEnRevision, variacion, lunesDe,
  type EstadoMes, type RitmoVentas, type Semaforo, type Variacion,
} from "@/lib/control-mensual";
import { controlCajaConfigurado, cuentasPorPagarCaja, sobreTopeCaja, type PorPagarCaja, type SobreTopeCaja } from "@/lib/control-caja";

const sql = neon(process.env.DATABASE_URL!);
const SEDES = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }, { id: 1, nombre: "Atelier" }];
const ATELIER = 1;
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** De lo que suele entrar por ventas, se cuenta solo esta parte (conservador). */
const FACTOR_ENTRADAS = 0.9;
const DIAS_ADELANTE = 14;
/** La rutina empezó la semana del lunes 5-oct-2026: antes no hay revisiones que reclamar. */
const INICIO_RUTINA = "2026-10-05";

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Pagos de las categorías fijas (parte propia de los compartidos, igual que el resto del sistema). */
async function pagosFijos(bId: number, desde: string, hasta: string): Promise<Pago[]> {
  const cats = [...CATEGORIAS_COMPROMISO];
  return (await sql`
    SELECT date::text AS fecha, category AS categoria,
           (CASE WHEN is_shared THEN COALESCE(atelier_amount, amount) ELSE amount END)::float AS monto
    FROM expenses
    WHERE business_id = ${bId} AND date BETWEEN ${desde} AND ${hasta} AND archived = false
      AND is_internal_transfer = false AND (is_special_loan = false OR loan_via_bank = true)
      AND payment_method NOT IN ('pendiente_atelier', 'socio') AND category = ANY(${cats})
  `) as Pago[];
}

/** El total aprobado de una categoría en un mes (null si el mes no tiene presupuesto aprobado). */
async function presupuestosAprobados(bId: number, meses: string[]) {
  const planes = await Promise.all(meses.map(async (m) => [m, await planDe(bId, m)] as const));
  return (categoria: string, mes: string) => {
    const p = planes.find(([m]) => m === mes)?.[1];
    if (!p?.cab?.aprobadoEl) return null;
    const l = p.lineas.find((x) => x.categoria === categoria);
    return l ? montoDe(l, p.cab.ventaEsperada) : null;
  };
}

// ─── Revisión semanal ───────────────────────────────────────────────────

export type SedeSemana = {
  businessId: number;
  sede: string;
  liquidez: (Liquidez & { saldoAl: string | null }) | null;
  compromisos: Compromiso[];
  ritmo: RitmoVentas;
  ventasHasta: string | null;
  /** Solo Atelier vende al crédito. */
  cobros: null | {
    porCobrar: number; atrasado: number; diasDesdeCarga: number | null; ultimaCarga: string | null;
    deudores: { cliente: string; deuda: number; atrasado: number; esSede: boolean }[];
    semaforo: Semaforo;
  };
  noPrevistos: { desvios: Desvio[]; sobreTope: SobreTopeCaja[]; total: number; semaforo: Semaforo };
};

export type DatosSemana = {
  hoy: string;
  semana: { desde: string; hasta: string };
  revisada: { el: string; por: string | null; nota: string | null } | null;
  /** La revisión de la semana anterior a esta quedó sin hacer. */
  semanaAnteriorSinRevisar: boolean;
  sedes: SedeSemana[];
  avisos: string[];
};

export async function getRevisionSemanal(): Promise<{ ok: true; data: DatosSemana } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const hoy = hoyLima();
    const semana = semanaEnRevision(hoy);
    const mes = hoy.slice(0, 7);
    const hasta = sumarDias(hoy, DIAS_ADELANTE);
    const avisos: string[] = [];

    const [liq, rev, cobrosAtelier, caja] = await Promise.all([
      getLiquidezGrupo(),
      sql`SELECT semana::text, revisado_el::text AS el, revisado_por AS por, nota FROM revision_semanal WHERE semana IN (${semana.desde}, ${sumarDias(semana.desde, -7)})` as unknown as Promise<{ semana: string; el: string; por: string | null; nota: string | null }[]>,
      getReceivables(),
      (async () => {
        if (!controlCajaConfigurado()) return { porPagar: [] as PorPagarCaja[], sobreTope: [] as SobreTopeCaja[] };
        try {
          const [porPagar, sobreTope] = await Promise.all([cuentasPorPagarCaja(), sobreTopeCaja(sumarDias(hoy, -7))]);
          return { porPagar, sobreTope };
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          avisos.push(/could not find the function/i.test(m)
            ? "Todavía no se ven las facturas a crédito ni los gastos sobre el tope de Control de Caja: falta correr su SQL en Supabase (control_semanal_caja.sql)."
            : `No se pudo leer Control de Caja (facturas a crédito y gastos sobre el tope): ${m}`);
          return { porPagar: [] as PorPagarCaja[], sobreTope: [] as SobreTopeCaja[] };
        }
      })(),
    ]);

    const sedes = await Promise.all(SEDES.map(async ({ id, nombre }): Promise<SedeSemana> => {
      const s = liq?.sedes.find((x) => x.businessId === id);
      const saldoAl = s?.fecha ?? null;
      const desdeCompromisos = saldoAl ?? hoy;
      const cerrados = [mesMas(mes, -3), mesMas(mes, -2), mesMas(mes, -1)];
      const [historial, pagadoReciente, presupuesto, ignorados, manuales, ventas, entradas, eq, presupuestoMes, planMes] = await Promise.all([
        pagosFijos(id, `${cerrados[0]}-01`, `${cerrados[2]}-${ultimoDia(cerrados[2])}`),
        pagosFijos(id, `${desdeCompromisos.slice(0, 7)}-01`, hasta),
        presupuestosAprobados(id, [...new Set([desdeCompromisos.slice(0, 7), mes, hasta.slice(0, 7)])]),
        sql`SELECT clave FROM compromisos_ignorados WHERE business_id = ${id}` as unknown as Promise<{ clave: string }[]>,
        sql`SELECT id::int AS id, fecha::text AS fecha, concepto, monto::float AS monto FROM compromisos_manuales
            WHERE business_id = ${id} AND fecha > ${desdeCompromisos} AND fecha <= ${hasta} ORDER BY fecha` as unknown as Promise<{ id: number; fecha: string; concepto: string; monto: number }[]>,
        loadVentaRowsBlended(sql, id, `${mes}-01`, hoy),
        // Lo que suele entrar: ingresos operativos de los últimos 28 días hasta el saldo.
        saldoAl ? totalesMesSede(id, sumarDias(saldoAl, -27), saldoAl) : Promise.resolve(null),
        getEquilibrioSede(mes, id),
        presupuestoDeSede(id, nombre, mes),
        planDe(id, mes),
      ]);

      // Compromisos: pagos fijos detectados + facturas a crédito de Control de Caja + anotados a mano.
      const patrones = detectarPatrones(historial, cerrados);
      const recurrentes = proyectarRecurrentes({
        patrones, desde: desdeCompromisos, hasta, presupuestoMes: presupuesto,
        pagado: pagadoReciente, ignorados: new Set(ignorados.map((x) => x.clave)),
      });
      const credito: Compromiso[] = caja.porPagar
        .filter((f) => f.sede.toLowerCase() === nombre.toLowerCase() && (f.vencimiento ?? f.fecha) <= hasta)
        .map((f) => ({ fecha: f.vencimiento ?? f.fecha, concepto: `Factura a crédito · ${f.proveedor}${(f.vencimiento ?? f.fecha) < hoy ? " (vencida)" : ""}`, monto: f.total, origen: "credito" as const }));
      const manual: Compromiso[] = manuales.map((m) => ({ fecha: m.fecha, concepto: m.concepto, monto: m.monto, origen: "manual" as const, id: m.id }));
      const compromisos = [...recurrentes, ...credito, ...manual].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const diasVentana = Math.max(0, diasEntre(desdeCompromisos, hasta));
      const entradasEsperadas = entradas ? (entradas.ingresos / 28) * diasVentana * FACTOR_ENTRADAS : 0;
      const liquidez = s ? { ...liquidezContraCompromisos(s.banco + s.caja, entradasEsperadas, compromisos, hoy), saldoAl } : null;

      // Ventas: lo que va del mes, la última semana completa y el ritmo contra la meta.
      const filas = ventas.rows.filter((r) => r.total > 0);
      const ventasMes = filas.reduce((t, r) => t + r.total, 0);
      const ventasSemana = ventas.rows.filter((r) => r.date >= semana.desde && r.date <= semana.hasta).reduce((t, r) => t + r.total, 0);
      // La semana en revisión puede empezar el mes anterior: se suma desde Byte lo que falte.
      let ventasSemanaTotal = ventasSemana;
      if (semana.desde < `${mes}-01`) {
        const previas = await loadVentaRowsBlended(sql, id, semana.desde, sumarDias(`${mes}-01`, -1));
        ventasSemanaTotal += previas.rows.reduce((t, r) => t + r.total, 0);
      }
      const ventasHasta = filas.length ? filas[filas.length - 1].date : null;
      const diasConDatos = ventasHasta ? Number(ventasHasta.slice(8, 10)) : 0;
      const base = eq.ok ? eq.data.base : null;
      const pe = eq.ok ? (eq.data.referencia?.pe ?? (base ? analizarEquilibrio(base).pe : null)) : null;
      const ritmo = ritmoVentas({
        ventasMes, ventasSemana: ventasSemanaTotal, diasConDatos, diasDelMes: ultimoDia(mes),
        ventaEsperada: planMes.cab?.aprobadoEl ? planMes.cab.ventaEsperada : null, pe,
      });

      // Cobros pendientes: solo Atelier.
      let cobros: SedeSemana["cobros"] = null;
      if (id === ATELIER) {
        const r = cobrosAtelier;
        const ultima = [r.ultimaCarga.ventas, r.ultimaCarga.facturas].filter(Boolean).sort().pop() ?? null;
        const diasDesdeCarga = ultima ? diasEntre(ultima.slice(0, 10), hoy) : null;
        cobros = {
          porCobrar: r.porCobrar, atrasado: r.atrasado, diasDesdeCarga, ultimaCarga: ultima,
          deudores: r.deudores.slice(0, 4).map((d) => ({ cliente: d.cliente, deuda: d.deuda, atrasado: d.atrasado, esSede: d.esSede })),
          semaforo: semaforoCobros({ porCobrar: r.porCobrar, atrasado: r.atrasado, diasDesdeCarga }),
        };
      }

      // Gastos no previstos: los desvíos del presupuesto del mes + lo registrado sobre el tope en Control de Caja.
      const desvios = presupuestoMes ? mayoresDesvios([presupuestoMes]) : [];
      const sobreTope = caja.sobreTope.filter((x) => x.sede.toLowerCase() === nombre.toLowerCase());
      const total = Math.round(desvios.reduce((t, d) => t + d.variacion, 0) * 100) / 100;
      const noPrevistos = {
        desvios, sobreTope, total,
        semaforo: (!presupuestoMes ? "gris" : desvios.some((d) => !d.sinPlan && (d.ejecucion ?? 0) > 110) ? "rojo" : desvios.length || sobreTope.length ? "ambar" : "verde") as Semaforo,
      };
      return { businessId: id, sede: nombre, liquidez, compromisos, ritmo, ventasHasta, cobros, noPrevistos };
    }));

    const esta = rev.find((r) => r.semana === semana.desde);
    const anterior = rev.find((r) => r.semana === sumarDias(semana.desde, -7));
    return {
      ok: true,
      data: {
        hoy, semana, sedes, avisos,
        revisada: esta ? { el: esta.el, por: esta.por, nota: esta.nota } : null,
        semanaAnteriorSinRevisar: !anterior && sumarDias(semana.desde, -7) >= INICIO_RUTINA,
      },
    };
  } catch (e) {
    console.error("[getRevisionSemanal] failed:", e);
    return { ok: false, error: "No se pudo armar la revisión semanal." };
  }
}

export async function marcarSemanaRevisada(input: { semana: string; nota?: string | null; revisada: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.semana ?? "") || lunesDe(input.semana) !== input.semana) return { ok: false, error: "Semana inválida." };
  try {
    if (input.revisada) {
      await sql`INSERT INTO revision_semanal (semana, revisado_por, nota) VALUES (${input.semana}, ${role.quien}, ${input.nota?.trim() || null})
                ON CONFLICT (semana) DO UPDATE SET revisado_el = NOW(), revisado_por = EXCLUDED.revisado_por, nota = EXCLUDED.nota`;
    } else {
      await sql`DELETE FROM revision_semanal WHERE semana = ${input.semana}`;
    }
    revalidatePath("/grupo/direccion");
    return { ok: true };
  } catch (e) {
    console.error("[marcarSemanaRevisada] failed:", e);
    return { ok: false, error: "No se pudo guardar la revisión." };
  }
}

export async function agregarCompromiso(input: { businessId: number; fecha: string; concepto: string; monto: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!SEDES.some((s) => s.id === input?.businessId)) return { ok: false, error: "Sede inválida." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input?.fecha ?? "")) return { ok: false, error: "Elige la fecha del pago." };
  if (!input.concepto?.trim()) return { ok: false, error: "Escribe qué se paga." };
  if (!Number.isFinite(Number(input.monto)) || Number(input.monto) <= 0) return { ok: false, error: "El monto debe ser mayor a cero." };
  try {
    await sql`INSERT INTO compromisos_manuales (business_id, fecha, concepto, monto, creado_por)
              VALUES (${input.businessId}, ${input.fecha}, ${input.concepto.trim().slice(0, 120)}, ${Math.round(Number(input.monto) * 100) / 100}, ${role.quien})`;
    revalidatePath("/grupo/direccion");
    return { ok: true };
  } catch (e) {
    console.error("[agregarCompromiso] failed:", e);
    return { ok: false, error: "No se pudo guardar el compromiso." };
  }
}

/** Quita un compromiso: si es uno anotado a mano se borra; si es uno detectado, se descarta ese mes. */
export async function quitarCompromiso(input: { businessId: number; id?: number; clave?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!SEDES.some((s) => s.id === input?.businessId)) return { ok: false, error: "Sede inválida." };
  try {
    if (input.id) await sql`DELETE FROM compromisos_manuales WHERE id = ${input.id} AND business_id = ${input.businessId}`;
    else if (input.clave && /^[^|]+\|[1-4]\|\d{4}-\d{2}$/.test(input.clave)) {
      await sql`INSERT INTO compromisos_ignorados (business_id, clave, creado_por) VALUES (${input.businessId}, ${input.clave}, ${role.quien}) ON CONFLICT DO NOTHING`;
    } else return { ok: false, error: "Compromiso inválido." };
    revalidatePath("/grupo/direccion");
    return { ok: true };
  } catch (e) {
    console.error("[quitarCompromiso] failed:", e);
    return { ok: false, error: "No se pudo quitar el compromiso." };
  }
}

// ─── Cierre de mes ─────────────────────────────────────────────────────

export type SedeCierre = {
  businessId: number;
  sede: string;
  ventas: Variacion;
  costos: Variacion;
  gastos: Variacion;
  impuestos: number;
  ganancia: Variacion;
  margenPct: Variacion;
  gananciaPct: number | null;
  sinResultadoPorque: string | null;
  mesCompleto: boolean;
  caja: { entro: number; salio: number; flujo: number };
  fuera: { deudas: number; inversion: number; ahorro: number; reparto: number; otrasSedes: number; noEsGasto: number; rescate: number };
  cambios: { categoria: string; actual: number; anterior: number; diferencia: number }[];
  equilibrio: { pe: number | null; ventas: number | null; superado: boolean | null };
  /** Plata libre hoy (Matriz de decisión). */
  libreHoy: number | null;
  siguiente: { aprobado: boolean; ventaEsperada: number | null; peReferencia: number | null; compromisosFijos: number; detalle: { concepto: string; monto: number }[] };
};

export type DatosCierre = {
  mes: string;
  siguiente: string;
  sedes: SedeCierre[];
  grupo: { ventas: Variacion; costos: Variacion; gastos: Variacion; ganancia: Variacion; flujo: Variacion; provisional: boolean };
  estado: EstadoMes;
  marcados: { item: string; el: string; por: string | null }[];
};

export async function getCierreMes(mes: string): Promise<{ ok: true; data: DatosCierre } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  if (!MES_RE.test(mes)) return { ok: false, error: "Mes inválido." };
  try {
    const anterior = mesMas(mes, -1), siguiente = mesMas(mes, 1);
    const [cifras, cifrasAnt, matriz, marcados, porAclarar] = await Promise.all([
      getSeisCifras(mes), getSeisCifras(anterior), getMatrizDecision(),
      sql`SELECT item, marcado_el::text AS el, marcado_por AS por FROM checklist_mensual WHERE mes = ${mes}` as unknown as Promise<{ item: string; el: string; por: string | null }[]>,
      sql`SELECT COALESCE(SUM(amount), 0)::float AS t FROM expenses WHERE category = 'POR ACLARAR' AND archived = false
          AND date BETWEEN ${`${mes}-01`} AND ${`${mes}-${ultimoDia(mes)}`}` as unknown as Promise<{ t: number }[]>,
    ]);
    if (!cifras.ok) return { ok: false, error: cifras.error };

    const sedes = await Promise.all(SEDES.map(async ({ id, nombre }): Promise<SedeCierre> => {
      const c = cifras.data.sedes.find((x) => x.businessId === id)!;
      const a = cifrasAnt.ok ? cifrasAnt.data.sedes.find((x) => x.businessId === id) ?? null : null;
      const [eq, gastoAct, gastoAnt, planSig, historial, presupuestoSig] = await Promise.all([
        getEquilibrioSede(mes, id),
        gastoPorCategoria(id, `${mes}-01`, `${mes}-${ultimoDia(mes)}`),
        gastoPorCategoria(id, `${anterior}-01`, `${anterior}-${ultimoDia(anterior)}`),
        planDe(id, siguiente),
        pagosFijos(id, `${mesMas(mes, -2)}-01`, `${mes}-${ultimoDia(mes)}`),
        presupuestosAprobados(id, [siguiente]),
      ]);
      // Para el «¿por qué?» solo cuentan costos y gastos de la operación (no préstamos entre sedes, ahorro ni devoluciones).
      const aMapa = (xs: { categoria: string; monto: number }[]) =>
        Object.fromEntries(xs.filter((x) => areaDe(x.categoria).bloque === "operacion").map((x) => [x.categoria, x.monto]));
      const base = eq.ok ? eq.data.base : null;
      const ae = base ? analizarEquilibrio(base) : null;
      const m = matriz.ok ? matriz.sedes.find((x) => x.businessId === id) : undefined;
      const retirar = m?.datos ? matrizDeSede(m.datos).retirar : null;
      const libreHoy = retirar && retirar.pasos.length ? retirar.pasos[retirar.pasos.length - 1].valor : null;
      // Compromisos fijos del mes siguiente (los mismos que la revisión semanal detecta).
      const patrones = detectarPatrones(historial, [mesMas(mes, -2), mesMas(mes, -1), mes]);
      const fijosSig = proyectarRecurrentes({
        patrones, desde: `${mes}-${ultimoDia(mes)}`, hasta: `${siguiente}-${ultimoDia(siguiente)}`,
        presupuestoMes: presupuestoSig, pagado: [], ignorados: new Set(),
      });
      const porCategoria = new Map<string, number>();
      for (const f of fijosSig) porCategoria.set(f.categoria!, (porCategoria.get(f.categoria!) ?? 0) + f.monto);
      return {
        businessId: id, sede: nombre,
        ventas: variacion(c.ventas, a?.ventas ?? null),
        costos: variacion(c.costos, a?.costos ?? null),
        gastos: variacion(c.gastos, a?.gastos ?? null),
        impuestos: c.impuestos,
        ganancia: variacion(c.ganancia, a?.ganancia ?? null),
        margenPct: variacion(c.margenPct, a?.margenPct ?? null),
        gananciaPct: c.gananciaPct,
        sinResultadoPorque: c.sinResultadoPorque,
        mesCompleto: c.mesCompleto,
        caja: c.caja,
        fuera: c.fuera,
        cambios: mayoresCambios(aMapa(gastoAct), aMapa(gastoAnt)),
        equilibrio: { pe: ae?.pe ?? null, ventas: c.ventas, superado: ae?.pe != null && c.ventas != null ? c.ventas >= ae.pe : null },
        libreHoy,
        siguiente: {
          aprobado: !!planSig.cab?.aprobadoEl, ventaEsperada: planSig.cab?.ventaEsperada ?? null,
          peReferencia: eq.ok ? (eq.data.referencia?.pe ?? ae?.pe ?? null) : null,
          compromisosFijos: Math.round([...porCategoria.values()].reduce((t, x) => t + x, 0)),
          detalle: [...porCategoria.entries()].map(([k, v]) => ({ concepto: k.charAt(0) + k.slice(1).toLowerCase(), monto: Math.round(v) })).sort((x, y) => y.monto - x.monto),
        },
      };
    }));

    const g = cifras.data.grupo, ga = cifrasAnt.ok ? cifrasAnt.data.grupo : null;
    const estado: EstadoMes = {
      totalSedes: SEDES.length,
      sedesConVentas: cifras.data.sedes.filter((s) => s.ventas !== null).length,
      sedesConExcelCompleto: cifras.data.sedes.filter((s) => s.mesCompleto).length,
      sedesConResultado: cifras.data.sedes.filter((s) => s.ganancia !== null).length,
      porAclarar: porAclarar[0]?.t ?? 0,
      sedesPresupuestoSiguienteAprobado: sedes.filter((s) => s.siguiente.aprobado).length,
      sedesMetaSiguiente: sedes.filter((s) => (s.siguiente.ventaEsperada ?? 0) > 0).length,
    };
    return {
      ok: true,
      data: {
        mes, siguiente, sedes, estado, marcados,
        grupo: {
          ventas: variacion(g.ventas, ga?.ventas ?? null), costos: variacion(g.costos, ga?.costos ?? null),
          gastos: variacion(g.gastos, ga?.gastos ?? null), ganancia: variacion(g.ganancia, ga?.ganancia ?? null),
          flujo: variacion(g.caja.flujo, ga?.caja.flujo ?? null), provisional: g.provisional,
        },
      },
    };
  } catch (e) {
    console.error("[getCierreMes] failed:", e);
    return { ok: false, error: "No se pudo armar el cierre del mes." };
  }
}

export async function marcarCheck(input: { mes: string; item: string; marcado: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (!MES_RE.test(input?.mes ?? "")) return { ok: false, error: "Mes inválido." };
  if (!CHECKLIST.some((i) => i.id === input.item)) return { ok: false, error: "Punto inválido." };
  try {
    if (input.marcado) {
      await sql`INSERT INTO checklist_mensual (mes, item, marcado_por) VALUES (${input.mes}, ${input.item}, ${role.quien}) ON CONFLICT DO NOTHING`;
    } else {
      await sql`DELETE FROM checklist_mensual WHERE mes = ${input.mes} AND item = ${input.item}`;
    }
    revalidatePath("/grupo/direccion");
    return { ok: true };
  } catch (e) {
    console.error("[marcarCheck] failed:", e);
    return { ok: false, error: "No se pudo guardar el punto." };
  }
}
