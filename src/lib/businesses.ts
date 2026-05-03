import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Códigos canónicos de los 3 negocios. Persistido como VARCHAR(20)
 * UNIQUE en BD, así que cualquier cambio aquí debe coordinarse con
 * un UPDATE en la tabla businesses.
 */
export type BusinessCode = "atelier" | "fonavi" | "centro";

export const BUSINESS_CODES: BusinessCode[] = ["atelier", "fonavi", "centro"];

/**
 * Negocio por defecto cuando no hay selección activa (URL limpia,
 * cookie ausente, primera visita). Atelier mantiene retrocompatibilidad
 * 100% con el comportamiento previo a Ola 5.
 */
export const DEFAULT_BUSINESS_CODE: BusinessCode = "atelier";

export type Business = {
  id: number;
  code: BusinessCode;
  name: string;
  description: string | null;
  active: boolean;
};

/**
 * Convierte una fila de la tabla businesses al tipo público.
 * Solo trabajamos con negocios activos hacia afuera.
 */
function toBusiness(row: typeof businesses.$inferSelect): Business {
  return {
    id: row.id,
    code: row.code as BusinessCode,
    name: row.name,
    description: row.description,
    active: row.active,
  };
}

/**
 * Lista los 3 negocios activos ordenados por id (Atelier primero por
 * convención del seed). Para usar en selectores de UI en Ola 6.
 */
export async function getBusinesses(): Promise<Business[]> {
  const rows = await db
    .select()
    .from(businesses)
    .where(eq(businesses.active, true))
    .orderBy(businesses.id);
  return rows.map(toBusiness);
}

/**
 * Devuelve un negocio por su code, o null si no existe / está inactivo.
 * Usado por el resolver de URL/cookie en Ola 6.
 */
export async function getBusinessByCode(code: string): Promise<Business | null> {
  if (!isValidBusinessCode(code)) return null;
  const [row] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.code, code))
    .limit(1);
  if (!row || !row.active) return null;
  return toBusiness(row);
}

/**
 * Type guard. Útil al parsear params de URL o cookies.
 */
export function isValidBusinessCode(value: string): value is BusinessCode {
  return (BUSINESS_CODES as string[]).includes(value);
}
