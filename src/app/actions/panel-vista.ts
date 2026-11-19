"use server";

/**
 * ¿Esta sesión puede usar «Ver como administrador» en el Panel de Sede? Solo la dirección (llave maestra).
 * Es una vista: no da ni quita permisos (cada action sigue revisando la sesión real).
 */

import { getSessionRole } from "@/lib/session-access";

export async function puedeVerComoAdmin(): Promise<boolean> {
  const role = await getSessionRole();
  return role?.kind === "full";
}
