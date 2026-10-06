"use server";

/**
 * Matriz de decisión del Sistema de Dirección · acciones (pedido de Jahnn, 6-oct-2026).
 *
 * Junta, por sede, los números que responden las preguntas del dueño (lib/decisiones.ts):
 *   · Lectura REAL del banco: la de getLiquidezGrupo (celda del banco del Excel de Kelly).
 *     No el saldo que el sistema reconstruye sumando movimientos: a Centro le daba −S/2,389.
 *   · Fondos mutuos: el saldo que anota Jahnn (fondos_mutuos_saldo).
 *   · Costos fijos, % de variables, venta de un mes y ticket: el mismo cálculo del punto de
 *     equilibrio (getEquilibrioSede), para que las dos pantallas digan lo mismo.
 *   · Cuotas de préstamos y tendencias: el historial mensual del punto de equilibrio.
 *   · Reserva mínima: reserva_minima (por defecto 4 semanas de costos fijos).
 * Solo dirección.
 */

import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { getSessionRole, requireFullSession } from "@/lib/session-access";
import { getEquilibrioSede, getResumenEquilibrio } from "./breakeven";
import { getLiquidezGrupo } from "./liquidez";
import type { LiquidezGrupo } from "@/lib/liquidez";
import { reservaDe, type DatosDecision } from "@/lib/decisiones";

const sql = neon(process.env.DATABASE_URL!);
const SEDES = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }, { id: 1, nombre: "Atelier" }];
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

export type SedeDecision = {
  businessId: number;
  sede: string;
  datos: DatosDecision | null;
  /** Por qué no se puede responder, o qué hay que tener en cuenta. */
  avisos: string[];
  /** La reserva tal como está configurada (null = la de por defecto). */
  reservaConfig: { semanas: number | null; monto: number | null } | null;
};

/**
 * La lectura REAL del banco de la sede: la de getLiquidezGrupo (única fuente, la misma del
 * dashboard), que es la celda del banco que Kelly copia del BCP en su Excel (o la que registra
 * dirección). Solo vale si es declarada: un estimado arrastrando movimientos no sirve para
 * decidir. OJO: import_batches.excel_saldo_banco NO es esa lectura, es el saldo que el parser
 * calcula con el libro (a Centro le daba S/349 con el banco en S/2,853).
 */
async function lecturaBanco(liq: LiquidezGrupo | null, bId: number): Promise<{ banco: number; efectivo: number; al: string } | null> {
  const s = liq?.sedes.find((x) => x.businessId === bId);
  if (!s || s.origen !== "declarado" || !s.fecha) return null;
  return { banco: s.banco, efectivo: s.caja, al: s.fecha };
}

async function ultimoFondo(bId: number): Promise<{ saldo: number; fecha: string } | null> {
  try {
    const r = (await sql`
      SELECT saldo::float AS saldo, fecha::text AS fecha FROM fondos_mutuos_saldo
      WHERE business_id = ${bId} ORDER BY fecha DESC LIMIT 1
    `) as { saldo: number; fecha: string }[];
    return r[0] ?? null;
  } catch {
    return null;
  }
}

async function configReserva(bId: number): Promise<{ semanas: number | null; monto: number | null } | null> {
  try {
    const r = (await sql`SELECT semanas::float AS semanas, monto::float AS monto FROM reserva_minima WHERE business_id = ${bId}`) as { semanas: number | null; monto: number | null }[];
    return r[0] ?? null;
  } catch {
    return null;
  }
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const promedio = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);

async function datosDeSede(bId: number, nombre: string, mes: string, liq: LiquidezGrupo | null): Promise<SedeDecision> {
  const [eq, resumen, banco, fondo, cfg] = await Promise.all([
    getEquilibrioSede(mes, bId), getResumenEquilibrio(mes, 7, bId), lecturaBanco(liq, bId), ultimoFondo(bId), configReserva(bId),
  ]);
  const avisos: string[] = [];
  if (!eq.ok || !eq.data.base) {
    avisos.push(eq.ok ? eq.data.avisos[0] ?? "Faltan datos para calcular." : eq.error);
    return { businessId: bId, sede: nombre, datos: null, avisos, reservaConfig: cfg };
  }
  const b = eq.data.base;
  const cerrados = (resumen.ok ? resumen.filas : []).filter((f) => !f.enCurso && f.ventas > 0);
  const ultimos3 = cerrados.slice(-3), anteriores = cerrados.slice(-6, -3);
  const ratio = (fs: typeof cerrados) => promedio(fs.map((f) => f.variables / f.ventas));
  const fijos = (fs: typeof cerrados) => promedio(fs.map((f) => f.fijos));
  const hoy = hoyLima();

  if (!banco) avisos.push("No hay lectura del banco en el Excel de esta sede: sin ella no se puede decir cuánta plata hay.");
  else if (diasEntre(banco.al, hoy) > 10) avisos.push(`La lectura del banco es del ${banco.al} (hace ${diasEntre(banco.al, hoy)} días): sube el Excel actualizado para que la respuesta esté al día.`);
  if (!fondo && bId !== 1) avisos.push("No hay saldo de fondos mutuos anotado: si la sede guarda ahorro allí, anótalo para que cuente como reserva.");
  else if (fondo && diasEntre(fondo.fecha, hoy) > 40) avisos.push(`El saldo de fondos mutuos es del ${fondo.fecha}: actualízalo con el último estado de cuenta.`);
  if (eq.data.ventasBase === "promedio") avisos.push("Mes recién empezado: se usa la venta promedio de los meses cerrados como «un mes».");

  return {
    businessId: bId, sede: nombre, reservaConfig: cfg, avisos,
    datos: {
      businessId: bId, sede: nombre,
      banco: banco?.banco ?? null, efectivo: banco?.efectivo ?? 0, bancoAl: banco?.al ?? null,
      fondos: fondo?.saldo ?? null, fondosAl: fondo?.fecha ?? null,
      fijosMes: b.fijos, varRatio: b.varRatio, ventasMes: b.ventas, ticket: b.ticket, diasDelMes: b.diasDelMes,
      cuotasMes: Math.round((promedio(ultimos3.map((f) => f.financiamiento)) ?? 0) * 100) / 100,
      reserva: reservaDe(b.fijos, cfg),
      tendencias: { varAntes: ratio(anteriores), varAhora: ratio(ultimos3), fijosAntes: fijos(anteriores), fijosAhora: fijos(ultimos3) },
    },
  };
}

/** Los números de las tres sedes para la matriz de decisión. Solo dirección. */
export async function getMatrizDecision(): Promise<{ ok: true; mes: string; sedes: SedeDecision[] } | { ok: false; error: string }> {
  if (!(await requireFullSession())) return { ok: false, error: "Solo dirección." };
  try {
    const mes = hoyLima().slice(0, 7);
    const liq = await getLiquidezGrupo();
    const sedes = await Promise.all(SEDES.map((s) => datosDeSede(s.id, s.nombre, mes, liq)));
    return { ok: true, mes, sedes };
  } catch (e) {
    console.error("[getMatrizDecision] failed:", e);
    return { ok: false, error: "No se pudo armar la matriz de decisión." };
  }
}

/** Anota el saldo de los fondos mutuos de una sede (del estado de cuenta). Solo dirección. */
export async function guardarFondosMutuos(input: { businessId: number; fecha: string; saldo: number; nota?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (![1, 2, 3].includes(input?.businessId)) return { ok: false, error: "Sede inválida." };
  const fecha = input?.fecha ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) return { ok: false, error: "Elige la fecha del estado de cuenta." };
  if (fecha > hoyLima()) return { ok: false, error: "La fecha no puede ser futura." };
  if (!Number.isFinite(input.saldo) || input.saldo < 0) return { ok: false, error: "El saldo debe ser un monto de cero o más." };
  try {
    await sql`
      INSERT INTO fondos_mutuos_saldo (business_id, fecha, saldo, nota, registrado_por)
      VALUES (${input.businessId}, ${fecha}, ${Math.round(input.saldo * 100) / 100}, ${input.nota?.trim() || null}, ${role.quien})
      ON CONFLICT (business_id, fecha) DO UPDATE SET saldo = EXCLUDED.saldo, nota = EXCLUDED.nota, registrado_por = EXCLUDED.registrado_por, registrado_el = NOW()`;
    revalidatePath("/grupo/direccion");
    return { ok: true };
  } catch (e) {
    console.error("[guardarFondosMutuos] failed:", e);
    return { ok: false, error: "No se pudo guardar el saldo." };
  }
}

/**
 * La reserva mínima de una sede: en semanas de costos fijos o como monto fijo (si hay monto,
 * manda el monto). Las dos vacías = la de por defecto (4 semanas). Solo dirección.
 */
export async function guardarReservaMinima(input: { businessId: number; semanas: number | null; monto: number | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (role?.kind !== "full") return { ok: false, error: "Solo dirección." };
  if (![1, 2, 3].includes(input?.businessId)) return { ok: false, error: "Sede inválida." };
  const semanas = input.semanas === null || input.semanas === undefined ? null : Number(input.semanas);
  const monto = input.monto === null || input.monto === undefined ? null : Number(input.monto);
  if (semanas !== null && (!Number.isFinite(semanas) || semanas < 0 || semanas > 52)) return { ok: false, error: "Las semanas deben estar entre 0 y 52." };
  if (monto !== null && (!Number.isFinite(monto) || monto < 0)) return { ok: false, error: "El monto debe ser de cero o más." };
  try {
    await sql`
      INSERT INTO reserva_minima (business_id, semanas, monto, actualizado_por)
      VALUES (${input.businessId}, ${semanas}, ${monto}, ${role.quien})
      ON CONFLICT (business_id) DO UPDATE SET semanas = EXCLUDED.semanas, monto = EXCLUDED.monto, actualizado_por = EXCLUDED.actualizado_por, actualizado_el = NOW()`;
    revalidatePath("/grupo/direccion");
    revalidatePath("/grupo/configuracion");
    return { ok: true };
  } catch (e) {
    console.error("[guardarReservaMinima] failed:", e);
    return { ok: false, error: "No se pudo guardar la reserva." };
  }
}
