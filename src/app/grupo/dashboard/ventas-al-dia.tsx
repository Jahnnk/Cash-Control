"use client";

import { useEffect, useState } from "react";
import { getVentasAlDia } from "@/app/actions/ventas-al-dia";
import type { VentasAlDia } from "@/lib/kpis/ventas-al-dia";
import { VistaVentasAlDia } from "./ventas-al-dia-vista";

/** «Ventas al día»: pide lo anotado por los administradores y lo dibuja (la vista pura está en ventas-al-dia-vista.tsx). */
export function VentasAlDiaVista({ mes }: { mes: string }) {
  // El resultado se guarda con el mes que se pidió: si el mes cambia, el viejo deja de valer.
  const [res, setRes] = useState<{ mes: string; datos: VentasAlDia | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    getVentasAlDia(mes)
      .then((r) => { if (vivo) setRes({ mes, datos: r.ok ? r.data : null }); })
      .catch(() => { if (vivo) setRes({ mes, datos: null }); });
    return () => { vivo = false; };
  }, [mes]);
  if (res?.mes !== mes) return <div className="h-40 rounded-2xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Cargando las ventas anotadas" />;
  if (!res.datos) return null;
  return <VistaVentasAlDia datos={res.datos} />;
}
