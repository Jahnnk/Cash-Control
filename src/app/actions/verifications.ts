"use server";

/**
 * Segunda firma del conteo diario · Actions.
 *
 * El número de personas atendidas determina el ticket — y el ticket
 * determina el bono del propio administrador que lo registra. La
 * segunda firma cierra ese conflicto de interés: el VERIFICADOR de
 * mando medio confirma u observa el registro de cada día.
 *
 * Reglas de acceso:
 * - Verificador de la sede (token verif-*): ve el registro del día y
 *   firma. NADA más.
 * - Sesión completa (Jahnn/Kelly): puede ver y firmar (respaldo).
 * - ADMINISTRADOR: puede VER el estado, pero NO firmar — nadie firma
 *   su propio número.
 * - Resiliente pre-migración: sin la tabla, lecturas vacías y
 *   escrituras con aviso claro.
 */

import { neon } from "@neondatabase/serverless";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { activeBusinessId } from "@/lib/active-business";
import { verifyAuthToken, verifyScopedToken } from "@/lib/auth-token";

const sql = neon(process.env.DATABASE_URL!);

const SEDE_BY_SCOPE: Record<string, number> = {
  "admin-fonavi": 2, "admin-centro": 3,
  "verif-fonavi": 2, "verif-centro": 3,
};

async function sessionRole(bId: number): Promise<"full" | "admin" | "verif" | null> {
  const c = await cookies();
  const token = c.get("yayis_auth")?.value;
  const now = Math.floor(Date.now() / 1000);
  if (await verifyAuthToken(token, process.env.APP_PASSWORD, now)) return "full";
  const scope = await verifyScopedToken(
    token,
    (s) =>
      s === "admin-fonavi" ? process.env.ADMIN_PASSWORD_FONAVI
      : s === "admin-centro" ? process.env.ADMIN_PASSWORD_CENTRO
      : s === "verif-fonavi" ? process.env.VERIF_PASSWORD_FONAVI
      : s === "verif-centro" ? process.env.VERIF_PASSWORD_CENTRO
      : undefined,
    now,
  );
  if (!scope || SEDE_BY_SCOPE[scope] !== bId) return null;
  return scope.startsWith("admin-") ? "admin" : "verif";
}

export type VerificationStatus = {
  date: string;
  status: "confirmado" | "observado";
  nota: string | null;
  verifiedAt: string;
};

export type VerificationDay = {
  date: string;
  personas: number | null;
  revenue: number | null;
  ticket: number | null;
  verification: VerificationStatus | null;
};

/** Los últimos días registrados + su estado de firma (verificador/full/admin). */
export async function getVerificationView(): Promise<
  | { ok: true; days: VerificationDay[]; canSign: boolean; tableReady: boolean }
  | { ok: false; error: string }
> {
  const bId = await activeBusinessId();
  const role = await sessionRole(bId);
  if (!role) return { ok: false, error: "Sin acceso." };
  if (bId !== 2 && bId !== 3) return { ok: false, error: "La verificación aplica a las cafeterías." };
  try {
    const rows = (await sql`
      SELECT date::text, personas, revenue::float AS revenue
      FROM upselling_daily
      WHERE business_id = ${bId} AND revenue IS NOT NULL
      ORDER BY date DESC LIMIT 10
    `) as { date: string; personas: number | null; revenue: number | null }[];

    let verifs: Record<string, VerificationStatus> = {};
    let tableReady = true;
    try {
      const v = (await sql`
        SELECT date::text, status, nota, verified_at::text AS verified_at
        FROM daily_verifications
        WHERE business_id = ${bId}
        ORDER BY date DESC LIMIT 30
      `) as { date: string; status: "confirmado" | "observado"; nota: string | null; verified_at: string }[];
      verifs = Object.fromEntries(v.map((x) => [x.date, { date: x.date, status: x.status, nota: x.nota, verifiedAt: x.verified_at }]));
    } catch {
      tableReady = false; // migración pendiente
    }

    return {
      ok: true,
      canSign: role !== "admin", // nadie firma su propio número
      tableReady,
      days: rows.map((r) => ({
        date: r.date,
        personas: r.personas,
        revenue: r.revenue,
        ticket: r.personas && r.revenue ? Math.round((r.revenue / r.personas) * 100) / 100 : null,
        verification: verifs[r.date] ?? null,
      })),
    };
  } catch (err) {
    console.error("[getVerificationView] failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Error al cargar" };
  }
}

/** Firma del día: confirma u observa el conteo. Prohibido para el admin. */
export async function signDay(input: {
  date: string;
  status: "confirmado" | "observado";
  nota: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bId = await activeBusinessId();
  const role = await sessionRole(bId);
  if (!role) return { ok: false, error: "Sin acceso." };
  if (role === "admin") {
    return { ok: false, error: "El administrador no puede firmar su propio conteo — esa firma es del verificador." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Fecha inválida." };
  if (input.status === "observado" && !input.nota?.trim()) {
    return { ok: false, error: "Una observación necesita la nota: ¿qué no cuadró?" };
  }
  try {
    await sql`
      INSERT INTO daily_verifications (business_id, date, status, nota, verified_at)
      VALUES (${bId}, ${input.date}, ${input.status}, ${input.nota?.trim() || null}, NOW())
      ON CONFLICT (business_id, date) DO UPDATE
        SET status = EXCLUDED.status, nota = EXCLUDED.nota, verified_at = NOW()
    `;
    revalidatePath("/[negocio]/verificacion", "page");
    revalidatePath("/[negocio]/panel", "page");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/daily_verifications/.test(msg)) {
      return { ok: false, error: "Falta la migración de verificaciones (tabla daily_verifications)." };
    }
    console.error("[signDay] failed:", err);
    return { ok: false, error: msg || "Error al firmar" };
  }
}
