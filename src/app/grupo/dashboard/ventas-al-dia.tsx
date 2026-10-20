"use client";

import { useEffect, useState } from "react";
import { getVentasAlDia } from "@/app/actions/ventas-al-dia";
import type { VentasAlDia } from "@/lib/kpis/ventas-al-dia";
import { VistaVentasAlDia } from "./ventas-al-dia-vista";

/**
 * Pide lo anotado por los administradores del mes. El resultado se guarda con el mes que se pidió: si el mes cambia, el
 * viejo deja de valer. Lo usa el Resumen (para dibujar la vista y para el aviso «no coincide con Byte»).
 * `undefined` = cargando; `null` = no se pudo leer (sin sesión de dirección o sin conexión).
 */
export function useVentasAlDia(mes: string): VentasAlDia | null | undefined {
  const [res, setRes] = useState<{ mes: string; datos: VentasAlDia | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    getVentasAlDia(mes)
      .then((r) => { if (vivo) setRes({ mes, datos: r.ok ? r.data : null }); })
      .catch(() => { if (vivo) setRes({ mes, datos: null }); });
    return () => { vivo = false; };
  }, [mes]);
  return res?.mes === mes ? res.datos : undefined;
}

export function VentasAlDiaVista({ datos }: { datos: VentasAlDia | null | undefined }) {
  if (datos === undefined) return <div className="h-40 rounded-2xl border border-gray-200 bg-white motion-safe:animate-pulse" aria-label="Cargando las ventas anotadas" />;
  if (!datos) return null;
  return <VistaVentasAlDia datos={datos} />;
}
