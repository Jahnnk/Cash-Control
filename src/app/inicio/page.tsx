import { redirect } from "next/navigation";
import { getSessionRole, type SessionRole } from "@/lib/session-access";
import { getNombreSaludo } from "@/app/actions/panel-vista";
import { botonesPara, type PerfilPuerta, type Sede } from "@/lib/puerta";
import { PuertaVista } from "./puerta-vista";

export const dynamic = "force-dynamic";

const SEDE_POR_ID: Record<number, Sede> = { 1: "atelier", 2: "fonavi", 3: "centro" };

/** La sesión → qué botones ve. Sin sesión, el middleware ya lo mandó al login. */
function perfilDe(role: SessionRole): PerfilPuerta | null {
  if (!role) return null;
  switch (role.kind) {
    case "full": return { tipo: "direccion" };
    case "admin": return SEDE_POR_ID[role.sede] ? { tipo: "admin", sede: SEDE_POR_ID[role.sede] } : null;
    case "verif": return SEDE_POR_ID[role.sede] ? { tipo: "verif", sede: SEDE_POR_ID[role.sede] } : null;
    case "highlight": return { tipo: "highlight" };
    case "equipo": return { tipo: "equipo" };
    case "lector": return { tipo: "lector" };
  }
}

/**
 * /inicio · Puerta única (Etapa 2 del mapa de sistemas, 21-nov-2026). La primera pantalla al entrar: el saludo y los
 * botones de cada persona, para todas las apps de Yayi's. La lista de quién ve qué vive en lib/puerta.ts.
 */
export default async function InicioPage() {
  const perfil = perfilDe(await getSessionRole());
  if (!perfil) redirect("/login");
  const nombre = await getNombreSaludo();
  return <PuertaVista nombre={nombre} botones={botonesPara(perfil)} esDireccion={perfil.tipo === "direccion"} />;
}
