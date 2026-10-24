/**
 * Reportes · Ventas por mes (Fase 2, 23-oct-2026): lo vendido por sede y del grupo, de las seis cifras de cada mes. Lógica pura.
 */

import type { DatosEstadoResultados } from "@/app/actions/estado-resultados";

export const SEDES_VENTAS = [{ id: 2, nombre: "Fonavi" }, { id: 3, nombre: "Centro" }, { id: 1, nombre: "Atelier" }];

export type FilaMes = { mes: string; enCurso: boolean; sedes: Record<number, number | null>; grupo: number | null };

export function armarFilas(d: DatosEstadoResultados): FilaMes[] {
  const mesHoy = d.hoy.slice(0, 7);
  return d.meses.map(({ mes, sedes }) => {
    // Lo vendido hasta el último día cargado: lo contado hasta el Excel más lo que Byte ya trae después.
    const venta = (id: number) => {
      const s = sedes.find((x) => x.businessId === id);
      return s && s.ventas !== null ? s.ventas + (s.ventasPosteriores ?? 0) : null;
    };
    const valores = Object.fromEntries(SEDES_VENTAS.map((s) => [s.id, venta(s.id)])) as Record<number, number | null>;
    const hay = SEDES_VENTAS.some((s) => valores[s.id] !== null);
    // Lo que las cafeterías le compraron a Atelier ya está en la venta de Atelier: en el grupo se cuenta una vez.
    const interno = valores[1] !== null ? sedes.filter((s) => s.businessId !== 1).reduce((t, s) => t + s.compraAtelier, 0) : 0;
    const grupo = hay ? SEDES_VENTAS.reduce((t, s) => t + (valores[s.id] ?? 0), 0) - interno : null;
    return { mes, enCurso: mes >= mesHoy, sedes: valores, grupo };
  });
}

