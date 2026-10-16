"use client";

/**
 * El pastel de la regla 33-33-33 (pedido de Jahnn, 15-oct-2026): el anillo de afuera (delgado y
 * claro) es la regla —tres partes iguales— y el de adentro (grueso) es cómo va de verdad: costos
 * variables, costos fijos y EBITDA. Donde el de adentro se pasa o se queda corto respecto del de
 * afuera se ve a simple vista qué parte falla. En el centro, el EBITDA. Lo usan Reportes (por sede)
 * y el dashboard (el del Grupo). Números y reglas: src/lib/regla-33.ts.
 */

import { partesDelPastel, type FilaRegla, type Termometro } from "@/lib/regla-33";

const pct = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;

export const ESTILO_TERMOMETRO: Record<Termometro, { chip: string; texto: string }> = {
  fragil: { chip: "bg-red-50 text-red-700 ring-red-200", texto: "text-red-700" },
  en_camino: { chip: "bg-amber-50 text-amber-800 ring-amber-200", texto: "text-amber-700" },
  eficiente: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-200", texto: "text-emerald-700" },
};

export const PARTES = {
  costos: { vivo: "stroke-amber-400", claro: "stroke-amber-200", punto: "bg-amber-400", nombre: "Costos variables" },
  fijos: { vivo: "stroke-slate-400", claro: "stroke-slate-200", punto: "bg-slate-400", nombre: "Costos fijos" },
  ebitda: { vivo: "stroke-emerald-600", claro: "stroke-emerald-200", punto: "bg-emerald-600", nombre: "EBITDA" },
} as const;

type Fila = Pick<FilaRegla, "costos" | "fijos" | "ebitda" | "termometro">;

export function PastelRegla({ f, className = "h-36 w-36" }: { f: Fila; className?: string }) {
  if (!f.costos || !f.fijos || !f.ebitda) return null;
  const real = partesDelPastel(f.costos.pct, f.fijos.pct, f.ebitda.pct);
  const regla = partesDelPastel(f.costos.metaPct, f.fijos.metaPct, f.ebitda.metaPct);
  const t = f.termometro;
  const anillo = (partes: ReturnType<typeof partesDelPastel>, r: number, ancho: number, tono: "vivo" | "claro") =>
    partes.filter((x) => x.largo > 0).map((x) => (
      <circle
        key={`${tono}-${x.clave}`} cx={60} cy={60} r={r} fill="none" strokeWidth={ancho} pathLength={100}
        className={PARTES[x.clave][tono]}
        // Un huequito entre partes (0.7%) para que se lean separadas.
        strokeDasharray={`${Math.max(0, x.largo * 100 - 0.7)} 100`} strokeDashoffset={-x.desde * 100}
        transform="rotate(-90 60 60)"
      />
    ));
  return (
    <svg viewBox="0 0 120 120" className={`${className} shrink-0`} role="img"
      aria-label={`De cada 100 soles vendidos: ${f.costos.pct.toFixed(0)} en costos variables, ${f.fijos.pct.toFixed(0)} en costos fijos y ${f.ebitda.pct.toFixed(0)} de EBITDA. La regla pide un tercio cada uno.`}>
      {anillo(regla, 54, 4, "claro")}
      {anillo(real, 38, 18, "vivo")}
      <text x={60} y={58} textAnchor="middle" className={`fill-current text-[17px] font-bold tabular-nums ${t ? ESTILO_TERMOMETRO[t].texto : ""}`}>{pct(f.ebitda.pct)}</text>
      <text x={60} y={71} textAnchor="middle" className="fill-gray-500 text-[8px]">de EBITDA</text>
    </svg>
  );
}
