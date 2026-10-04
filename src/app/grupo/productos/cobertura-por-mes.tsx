"use client";

/**
 * "¿Qué meses tiene cada sede y cuál falta subir?" dentro de «Subir Reportes
 * Gerencia». Pedido de Jahnn, 4-oct-2026: antes de soltar archivos, ver por
 * sede qué meses de mayor rotación están completos, cuáles tienen días
 * sueltos y cuáles no tienen nada. El estado de cada mes sale de
 * celdaCobertura (lib/productos/cobertura-rotacion.ts), la misma regla de la
 * grilla de «Cargas de Byte».
 */

import { celdaCobertura, type CeldaCobertura, type PeriodoCargado } from "@/lib/productos/cobertura-rotacion";

/** El primer mes con reportes de productos del sistema. */
export const PRIMER_MES_PRODUCTOS = "2026-04";

const ORDEN = [
  { id: 2, nombre: "Fonavi" },
  { id: 3, nombre: "Centro" },
  { id: 1, nombre: "Atelier" },
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const corto = (m: string) => MESES_CORTOS[Number(m.slice(5, 7)) - 1];
const largo = (m: string) => MESES_LARGOS[Number(m.slice(5, 7)) - 1];

/** De abril al mes en curso. */
export function mesesDesdeAbril(hoy: string): string[] {
  const out: string[] = [];
  let [y, m] = PRIMER_MES_PRODUCTOS.split("-").map(Number);
  const fin = hoy.slice(0, 7);
  while (`${y}-${String(m).padStart(2, "0")}` <= fin) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) { y += 1; m = 1; } else m += 1;
  }
  return out;
}

type Tono = "ok" | "faltan" | "vacio";
const tonoDe = (c: CeldaCobertura): Tono => (c.estado === "completo" || c.estado === "en-curso" ? "ok" : c.estado === "parcial" ? "faltan" : "vacio");

const CLASES: Record<Tono, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  faltan: "bg-amber-50 text-amber-900 ring-amber-300",
  vacio: "bg-red-50 text-red-700 ring-red-200",
};
const MARCA: Record<Tono, string> = { ok: "✓", faltan: "!", vacio: "✕" };

/** Lo que falta subir de una sede, en palabras ("agosto (faltan 30 y 31 ago) · julio (sin reporte)"). */
export function faltaDeSede(celdas: CeldaCobertura[], hoy: string): string[] {
  return celdas.flatMap((c) => {
    if (c.estado === "completo" || c.estado === "en-curso") return [];
    const enCurso = c.month === hoy.slice(0, 7);
    if (c.estado === "vacio") return [enCurso ? `${largo(c.month)} (en curso, del 1 a ayer)` : `${largo(c.month)} (sin reporte)`];
    return [`${largo(c.month)} (faltan ${c.faltan ?? "días"})`];
  });
}

export function CoberturaPorMes({ periodos, hoy, sedeElegida }: { periodos: PeriodoCargado[]; hoy: string; sedeElegida: number | null }) {
  const meses = mesesDesdeAbril(hoy);
  const filas = ORDEN.map((s) => {
    const celdas = meses.map((m) => celdaCobertura(periodos.filter((p) => p.businessId === s.id), m, hoy));
    return { ...s, celdas, falta: faltaDeSede(celdas, hoy) };
  });
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
      <div>
        <div className="text-xs font-semibold text-gray-700">Qué meses tiene cada sede <span className="font-normal text-gray-500">(ventas por producto · mayor rotación)</span></div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
          <span><span className="text-emerald-700 font-medium">✓</span> completo</span>
          <span><span className="text-amber-700 font-medium">!</span> faltan días</span>
          <span><span className="text-red-600 font-medium">✕</span> sin reporte</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {filas.map((f) => (
          <div key={f.id} className={`rounded-lg px-2.5 py-2 ${f.id === sedeElegida ? "bg-white ring-1 ring-primary/40" : ""}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="w-14 shrink-0 text-xs font-semibold text-gray-900">{f.nombre}</span>
              <div className="flex flex-wrap gap-1.5">
                {f.celdas.map((c) => {
                  const t = tonoDe(c);
                  return (
                    <span key={c.month} title={`${largo(c.month)}: ${t === "ok" ? "completo" : t === "faltan" ? `faltan ${c.faltan ?? "días"}` : "sin reporte"}`}
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${CLASES[t]}`}>
                      {corto(c.month)} <span aria-hidden>{MARCA[t]}</span>
                      <span className="sr-only">{t === "ok" ? "completo" : t === "faltan" ? "faltan días" : "sin reporte"}</span>
                    </span>
                  );
                })}
              </div>
            </div>
            <p className={`mt-1.5 pl-[4.25rem] text-[11px] leading-snug ${f.falta.length === 0 ? "text-emerald-700" : "text-gray-600"}`}>
              {f.falta.length === 0 ? "Al día: no falta ningún mes." : <><strong className="text-gray-800">Falta subir:</strong> {f.falta.join(" · ")}</>}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
