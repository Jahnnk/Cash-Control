"use server";

/**
 * Canje de un vale EN CAJA, sin cuenta en Cash Control · Action pública.
 *
 * Los cajeros no usan la app. Esta es la ÚNICA acción que se puede llamar sin
 * sesión (la página /vale/... es pública), así que su seguridad es el PIN de
 * 6 dígitos de la sede, con tres candados:
 *   1. Cada intento se CUENTA antes de comparar, en un solo UPDATE atómico:
 *      ni 100 peticiones en paralelo pasan de 5 comparaciones por ventana.
 *   2. Al 5.º fallo seguido la caja de esa sede se bloquea 10 minutos; el
 *      encargado o el administrador pueden canjear con su cuenta mientras tanto.
 *   3. Un PIN correcto solo permite lo único que ya podía hacer cualquier
 *      cajero: gastar un vale. No ve ni cambia nada más.
 * Un vale inexistente o ya usado NO gasta intentos (no se revisa el PIN).
 * Esta acción es la única de este archivo a propósito: tests/vale-publico lo vigila.
 */

import { neon } from "@neondatabase/serverless";
import { verifyPassword } from "@/lib/password-hash";
import { normalizarCodigo, estadoEfectivo, type EstadoVale, type ItemVale } from "@/lib/vales";
import { buscarVale, ejecutarCanje, hoyLima, motivoNoCanjeable } from "@/lib/vales-sql";
import {
  normalizarPin, formatoPinValido, mensajePinIncorrecto, MAX_INTENTOS_PIN, MINUTOS_BLOQUEO_PIN,
} from "@/lib/vales-pin";

export type CanjeCaja = {
  codigo: string;
  sede: string;
  items: ItemVale[];
  para: string | null;
  estado: EstadoVale;
  canjeadoEn: string | null;
};

export async function canjearEnCaja(input: {
  codigo: string;
  pin: string;
}): Promise<{ ok: true; vale: CanjeCaja } | { ok: false; error: string }> {
  const codigo = normalizarCodigo(input.codigo);
  if (!codigo) return { ok: false, error: "Ese no parece un código de vale (8 letras y números, ej. 7K3Q-M2PA)." };
  const pin = normalizarPin(input.pin);
  if (!formatoPinValido(pin)) return { ok: false, error: "El PIN de caja son 6 números." };

  const sql = neon(process.env.DATABASE_URL!);
  try {
    const vale = await buscarVale(codigo);
    if (vale === "sin-tabla") return { ok: false, error: "Los vales aún no están activos. Avísale a Jahnn." };
    if (!vale) return { ok: false, error: "No encuentro ese vale. Revisa el código." };

    // Si ya no sirve, se dice por qué SIN tocar el PIN: no gasta intentos de la caja.
    const motivo = motivoNoCanjeable(vale, hoyLima());
    if (motivo) return { ok: false, error: motivo };

    // 1) Contar el intento ANTES de comparar. Si la caja está bloqueada, el WHERE no deja pasar ninguna fila.
    const intento = (await sql`
      UPDATE vales_caja_pin
      SET intentos = CASE WHEN bloqueado_hasta IS NOT NULL AND bloqueado_hasta <= now() THEN 1 ELSE intentos + 1 END,
          bloqueado_hasta = CASE
            WHEN (CASE WHEN bloqueado_hasta IS NOT NULL AND bloqueado_hasta <= now() THEN 1 ELSE intentos + 1 END) >= ${MAX_INTENTOS_PIN}::int
            THEN now() + (${MINUTOS_BLOQUEO_PIN}::int * interval '1 minute')
            ELSE NULL END
      WHERE business_id = ${vale.businessId}
        AND (bloqueado_hasta IS NULL OR bloqueado_hasta <= now())
      RETURNING intentos, pin_hash
    `) as { intentos: number; pin_hash: string }[];

    if (intento.length === 0) {
      const fila = (await sql`
        SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (bloqueado_hasta - now())) / 60))::int AS minutos
        FROM vales_caja_pin WHERE business_id = ${vale.businessId}
      `) as { minutos: number }[];
      if (fila.length === 0) {
        return { ok: false, error: "Esta sede aún no tiene PIN de caja. Que lo canjee el encargado o el administrador." };
      }
      return { ok: false, error: `La caja está bloqueada por intentos fallidos. Prueba en ${fila[0].minutos} min, o que lo canjee el encargado o el administrador.` };
    }

    // 2) Comparar el PIN.
    if (!verifyPassword(pin, intento[0].pin_hash)) {
      return { ok: false, error: mensajePinIncorrecto(intento[0].intentos) };
    }
    await sql`UPDATE vales_caja_pin SET intentos = 0, bloqueado_hasta = NULL WHERE business_id = ${vale.businessId}`;

    // 3) Canjear con el mismo candado atómico que usa el encargado.
    const r = await ejecutarCanje(codigo, vale.businessId, `Caja ${vale.sede}`);
    if (!r.ok) return r;
    const v = r.vale;
    return {
      ok: true,
      vale: { codigo: v.codigo, sede: v.sede, items: v.items, para: v.para, estado: estadoEfectivo(v, hoyLima()), canjeadoEn: v.canjeadoEn },
    };
  } catch (e) {
    // Migración pendiente (falta la tabla del PIN): mensaje claro en vez de «reintenta».
    if (String(e).includes("vales_caja_pin")) return { ok: false, error: "Los vales aún no están activos. Avísale a Jahnn." };
    return { ok: false, error: "No pude canjear el vale. Reintenta en un momento." };
  }
}
