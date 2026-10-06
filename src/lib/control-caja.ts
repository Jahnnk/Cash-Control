/**
 * Conexión con Control de Caja (la otra app de Yayi's, en Supabase) · servidor.
 *
 * Pedido de Jahnn (6-oct-2026): cada administrador ve en Control de Caja una barra por categoría
 * con SU PARTE del presupuesto del mes. Esa parte se marca aquí, en el presupuesto, y al aprobarlo
 * se manda allá. Y al revés: para proponer esa parte se lee lo que de verdad pasó por Control de
 * Caja (gastos del administrador + compras de Fabio) en los últimos meses.
 *
 * Las dos llamadas son funciones de la base de Control de Caja protegidas con una clave propia
 * (CAJA_SYNC_TOKEN; allá solo se guarda su huella). La clave nunca llega al navegador.
 */

const URL = process.env.CAJA_SUPABASE_URL;
const ANON = process.env.CAJA_SUPABASE_ANON_KEY;
const TOKEN = process.env.CAJA_SYNC_TOKEN;

export const controlCajaConfigurado = () => !!(URL && ANON && TOKEN);

async function rpc<T>(funcion: string, args: Record<string, unknown>): Promise<T> {
  if (!controlCajaConfigurado()) throw new Error("La conexión con Control de Caja no está configurada.");
  const r = await fetch(`${URL}/rest/v1/rpc/${funcion}`, {
    method: "POST",
    headers: { apikey: ANON!, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...args, p_token: TOKEN }),
    cache: "no-store",
  });
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => "");
    let mensaje = cuerpo;
    try { mensaje = (JSON.parse(cuerpo) as { message?: string }).message ?? cuerpo; } catch { /* texto plano */ }
    throw new Error(mensaje || `Control de Caja respondió ${r.status}`);
  }
  return (await r.json()) as T;
}

export type TopeCaja = { categoria: string; tope: number; total: number | null };

/** Reemplaza los topes de una sede para un mes en Control de Caja. Devuelve cuántas categorías quedaron. */
export async function enviarTopes(sede: string, mes: string, topes: TopeCaja[]): Promise<number> {
  return rpc<number>("sincronizar_presupuesto_caja", { p_sede: sede, p_mes: mes, p_topes: topes });
}

export type GastoCaja = { sede: string; mes: string; categoria: string; monto: number };

/** Lo gastado en Control de Caja por sede, mes y categoría de la lista única (desde..hasta, YYYY-MM). */
export async function gastoCajaMensual(desde: string, hasta: string): Promise<GastoCaja[]> {
  const filas = await rpc<{ sede: string; mes: string; categoria: string; monto: number | string }[]>("gasto_caja_mensual", { p_desde: desde, p_hasta: hasta });
  return filas.map((f) => ({ ...f, monto: Number(f.monto) }));
}
