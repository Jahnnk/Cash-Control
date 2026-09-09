"use server";

/**
 * La frescura de datos del grupo, para la banda de "¿hasta cuándo
 * tenemos datos?".
 *
 * Reutiliza `getDataFreshness` (última fecha con movimiento financiero
 * por sede) y le aplica el motor puro. Acá no se decide nada.
 */

import { getDataFreshness } from "./grupo";
import { resumirFrescura, type FrescuraGrupo } from "@/lib/frescura-datos";

export async function getFrescuraGrupo(): Promise<FrescuraGrupo | null> {
  try {
    const sedes = await getDataFreshness();
    return resumirFrescura({
      todayISO: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
      sedes: sedes.map((s) => ({ businessId: s.businessId, name: s.name, lastDate: s.lastDate })),
    });
  } catch (err) {
    // La banda nunca puede tumbar la página que la contiene.
    console.error("[getFrescuraGrupo] failed:", err);
    return null;
  }
}
