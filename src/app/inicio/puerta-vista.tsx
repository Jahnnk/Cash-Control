"use client";

/** La pantalla de la puerta única: saludo + un botón grande por cada cosa que usa la persona. */

import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowUpRight, BarChart3, ChefHat, ClipboardCheck, ClipboardList, LayoutDashboard, LogOut, Receipt, Tags, Target, Timer, Trophy, Truck, Users,
} from "lucide-react";
import { BannerSaludo } from "@/app/[negocio]/panel/inicio-ui";
import { logout } from "@/app/actions/auth";
import { NOMBRE_APP, type BotonPuerta } from "@/lib/puerta";

const ICONO: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard, acuerdos: ClipboardList, precios: Tags, panel: Trophy, verificacion: Timer,
  supervisiones: ClipboardCheck, highlight: Target, reportes: BarChart3,
  caja: Receipt, envios: Truck, planilla: Users, produccion: ChefHat,
};
const COLOR: Record<BotonPuerta["app"], string> = {
  cash: "bg-primary-50 text-primary-light",
  caja: "bg-amber-50 text-amber-600",
  envios: "bg-orange-50 text-orange-600",
  planilla: "bg-sky-50 text-sky-600",
  produccion: "bg-violet-50 text-violet-600",
};

export function PuertaVista({ nombre, botones, esDireccion }: { nombre: string | null; botones: BotonPuerta[]; esDireccion: boolean }) {
  const otras = botones.some((b) => b.externa);
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <p className="text-lg font-extrabold tracking-tight text-primary">Yayi&apos;s</p>
        <form action={logout}>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            <LogOut className="h-3.5 w-3.5" aria-hidden />Cerrar sesión
          </button>
        </form>
      </header>

      <BannerSaludo nombre={nombre} bajada={esDireccion ? "Todo Yayi's desde una sola puerta." : "Todo lo que usas, en un solo lugar."} />

      <nav aria-label="Tus aplicaciones" className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {botones.map((b) => {
          const Icono = ICONO[b.clave] ?? LayoutDashboard;
          const contenido = (
            <>
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${COLOR[b.app]}`}><Icono className="h-6 w-6" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-base font-bold text-gray-900">
                  {b.titulo}
                  {b.externa && <ArrowUpRight className="h-4 w-4 text-gray-400" aria-label="Abre otra app" />}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-gray-600">{b.detalle}</span>
                <span className="mt-2 inline-block rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{NOMBRE_APP[b.app]}</span>
              </span>
            </>
          );
          const clase = "group flex items-start gap-4 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-light/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary sm:p-5";
          return b.externa
            ? <a key={b.clave} href={b.href} className={clase}>{contenido}</a>
            : <Link key={b.clave} href={b.href} className={clase}>{contenido}</Link>;
        })}
      </nav>

      {otras && (
        <p className="mt-5 text-center text-xs text-gray-500">
          Las apps con <ArrowUpRight className="inline h-3 w-3" aria-hidden /> todavía te piden su propia clave. Muy pronto entrarás a todas con un clic desde aquí.
        </p>
      )}
    </div>
  );
}
