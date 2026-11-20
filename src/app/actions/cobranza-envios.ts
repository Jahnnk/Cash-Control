"use server";

/**
 * Lo que le deben a Atelier, leído de Finanzas de Yayi's Envíos (20-nov-2026). Ahí el administrador lleva al día
 * los créditos: Fonavi, Centro y los clientes B2B. Antes el Panel de Atelier lo sacaba de «Cuentas por cobrar»
 * (reportes de Byte) y la cifra no cuadraba con la real. Un solo cerebro: Envíos calcula, aquí se muestra.
 */

import { getSessionRole } from "@/lib/session-access";

export type Tramos = { "0-15": number; "16-30": number; "+30": number };
export type CobranzaEnvios = {
  total: number;
  masDe30: number;
  sedes: { sede: string; nombre: string; saldo: number; comprobantes: number; tramos: Tramos }[];
  b2b: { saldo: number; clientes: number; tramos: Tramos };
  /** Para el enlace «Ver en Finanzas». */
  urlFinanzas: string;
};

type Crudo = {
  sedes: { sede: string; nombre: string; saldo: string; comprobantes: number; tramos: Record<string, string> }[];
  b2b: { saldo: string; clientes: number; tramos: Record<string, string> };
};

const num = (s: string | undefined) => Math.round(Number(s ?? 0) * 100) / 100;
const tramos = (t: Record<string, string>): Tramos => ({ "0-15": num(t["0-15"]), "16-30": num(t["16-30"]), "+30": num(t["+30"]) });

export async function getCobranzaEnvios(): Promise<{ ok: true; datos: CobranzaEnvios } | { ok: false; error: string }> {
  const role = await getSessionRole();
  if (!(role?.kind === "full" || (role?.kind === "admin" && role.sede === 1))) return { ok: false, error: "Sin acceso." };
  const url = process.env.ENVIOS_URL;
  const token = process.env.ENVIOS_FINANZAS_TOKEN;
  if (!url || !token) return { ok: false, error: "Falta conectar con Yayi's Envíos." };
  try {
    const r = await fetch(`${url}/api/finanzas/resumen`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      console.error("[cobranza-envios] respuesta", r.status);
      return { ok: false, error: "Yayi's Envíos no respondió. Intenta de nuevo." };
    }
    const c = (await r.json()) as Crudo;
    const sedes = c.sedes.map((s) => ({ sede: s.sede, nombre: s.nombre, saldo: num(s.saldo), comprobantes: s.comprobantes, tramos: tramos(s.tramos) }));
    const b2b = { saldo: num(c.b2b.saldo), clientes: c.b2b.clientes, tramos: tramos(c.b2b.tramos) };
    const total = Math.round((sedes.reduce((t, s) => t + s.saldo * 100, 0) + b2b.saldo * 100)) / 100;
    const masDe30 = Math.round((sedes.reduce((t, s) => t + s.tramos["+30"] * 100, 0) + b2b.tramos["+30"] * 100)) / 100;
    return { ok: true, datos: { total, masDe30, sedes, b2b, urlFinanzas: `${url}/finanzas` } };
  } catch (e) {
    console.error("[cobranza-envios]", e);
    return { ok: false, error: "No pude conectar con Yayi's Envíos." };
  }
}
