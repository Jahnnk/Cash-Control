import { cookies, headers } from "next/headers";
import {
  type BusinessCode,
  type Business,
  isValidBusinessCode,
  getBusinessByCode,
  getBusinesses,
} from "./businesses";

export const ACTIVE_BUSINESS_COOKIE = "yayis_business";
const ACTIVE_BUSINESS_HEADER = "x-active-business";

/** Scope adicional para vistas consolidadas (no es un negocio real). */
export type GroupScope = "grupo";
export type ScopeCode = BusinessCode | GroupScope;

export function isValidScopeCode(value: string): value is ScopeCode {
  return value === "grupo" || isValidBusinessCode(value);
}

/**
 * Resuelve el negocio activo. Prioridad:
 *   1. Param explícito `code` (ej: ruta dinámica /[negocio]/...).
 *   2. Header x-active-business inyectado por el middleware (esta request).
 *   3. Cookie persistente (sesiones previas).
 *   4. null  →  caller decide redirect a la pantalla raíz.
 *
 * El scope `grupo` es válido como input pero NO devuelve un Business
 * (no hay fila en la tabla businesses); el caller debe tratarlo aparte.
 */
export async function getActiveBusiness(code?: string): Promise<Business | null> {
  if (code && isValidBusinessCode(code)) {
    return getBusinessByCode(code);
  }

  const h = await headers();
  const headerVal = h.get(ACTIVE_BUSINESS_HEADER);
  if (headerVal && isValidBusinessCode(headerVal)) {
    return getBusinessByCode(headerVal);
  }

  const c = await cookies();
  const cookieVal = c.get(ACTIVE_BUSINESS_COOKIE)?.value;
  if (cookieVal && isValidBusinessCode(cookieVal)) {
    return getBusinessByCode(cookieVal);
  }

  return null;
}

/** Versión que tira excepción si no hay negocio. Útil en server actions
 * que NUNCA deben ejecutarse sin negocio activo. */
export async function requireActiveBusiness(code?: string): Promise<Business> {
  const b = await getActiveBusiness(code);
  if (!b) {
    throw new Error(
      "Sin negocio activo. La request debe venir con header x-active-business o cookie yayis_business."
    );
  }
  return b;
}

/** Re-exporta para conveniencia. */
export { getBusinesses };

/** Atajo de requireActiveBusiness().id para server actions multi-tenant. */
export async function activeBusinessId(code?: string): Promise<number> {
  const b = await requireActiveBusiness(code);
  return b.id;
}
