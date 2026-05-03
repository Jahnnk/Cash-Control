"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_COOKIE, type Role } from "@/lib/role";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/active-business";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Server action: setea cookie del rol y redirige a /select-business.
 * Limpia la cookie del negocio activo para que el usuario elija explícitamente.
 */
export async function selectRole(role: Role) {
  const c = await cookies();
  c.set(ROLE_COOKIE, role, {
    path: "/",
    maxAge: THIRTY_DAYS,
    sameSite: "lax",
  });
  // Limpiar el negocio activo previo (forzar selección explícita post-rol)
  c.delete(ACTIVE_BUSINESS_COOKIE);
  redirect("/select-business");
}

/** Limpia el rol y vuelve al selector raíz. */
export async function clearRole() {
  const c = await cookies();
  c.delete(ROLE_COOKIE);
  c.delete(ACTIVE_BUSINESS_COOKIE);
  redirect("/");
}
