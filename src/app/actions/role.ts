"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_COOKIE, type Role } from "@/lib/role";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/active-business";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Server action: setea cookie del rol y redirige al punto de partida
 * de cada quien:
 * - Jahnn (CEO) → directo al panel del GRUPO: la salud de Yayi's
 *   completa de un vistazo; de ahí baja a cualquier sede con el switcher.
 * - Kelly → selector de negocio (su trabajo es por sede).
 * Limpia la cookie del negocio activo para no arrastrar el anterior.
 */
export async function selectRole(role: Role) {
  const c = await cookies();
  c.set(ROLE_COOKIE, role, {
    path: "/",
    maxAge: THIRTY_DAYS,
    sameSite: "lax",
  });
  c.delete(ACTIVE_BUSINESS_COOKIE);
  redirect(role === "admin" ? "/grupo/dashboard" : "/select-business");
}

/** Limpia el rol y vuelve al selector raíz. */
export async function clearRole() {
  const c = await cookies();
  c.delete(ROLE_COOKIE);
  c.delete(ACTIVE_BUSINESS_COOKIE);
  redirect("/");
}
