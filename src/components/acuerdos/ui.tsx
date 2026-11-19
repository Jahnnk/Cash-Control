"use client";

/**
 * Piezas visuales de Acuerdos y tareas (rediseño 19-nov-2026, inspirado en Asana, Trello y Monday, con el
 * estilo del panel actual): avatar del responsable, fecha con color de urgencia, etiqueta de área, círculo
 * para marcar cumplido y la «batería» de estados.
 */

import { Check } from "lucide-react";
import { AREA_LABEL, diasRestantes, estaAbierto, type Area, type EstadoGuardado, type Resumen } from "@/lib/acuerdos";

/** Un color fijo por persona (el mismo en el avatar, la carga del equipo y el cronograma). */
const PALETA = ["#059669", "#0284C7", "#7C3AED", "#D97706", "#E11D48", "#0F766E", "#4F46E5", "#EA580C"];
export function colorPersona(clave: string): string {
  let h = 0;
  for (const ch of clave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

/** Iniciales con el color de la persona. */
export function Avatar({ nombre, clave, tam = "sm" }: { nombre: string; clave: string; tam?: "sm" | "md" }) {
  const ini = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  const t = tam === "md" ? "w-8 h-8 text-xs" : "w-6 h-6 text-[10px]";
  return <span title={nombre} style={{ backgroundColor: colorPersona(clave) }} className={`${t} inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0`}>{ini}</span>;
}

const AREA_COLOR: Record<Area, string> = {
  marketing: "bg-pink-50 text-pink-700",
  administracion: "bg-sky-50 text-sky-700",
  operaciones: "bg-emerald-50 text-emerald-700",
  finanzas: "bg-violet-50 text-violet-700",
  calidad: "bg-amber-50 text-amber-800",
};

export function AreaTag({ area }: { area: Area }) {
  return <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${AREA_COLOR[area]}`}>{AREA_LABEL[area]}</span>;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export const diaCorto = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

/** La fecha límite como la mira una persona: «Hoy», «Mañana», «vie», «24 nov»; roja si venció. */
export function FechaChip({ fecha, hoy, estado }: { fecha: string; hoy: string; estado: EstadoGuardado }) {
  const d = diasRestantes(fecha, hoy);
  const abierto = estaAbierto(estado);
  const texto = !abierto ? diaCorto(fecha)
    : d < 0 ? `Venció ${diaCorto(fecha)}`
      : d === 0 ? "Hoy" : d === 1 ? "Mañana"
        : d < 7 ? DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()] : diaCorto(fecha);
  const color = !abierto ? "text-gray-400" : d < 0 ? "text-red-700 font-semibold" : d <= 1 ? "text-amber-700 font-medium" : "text-gray-600";
  return <span className={`text-[11px] whitespace-nowrap ${color}`}>{texto}</span>;
}

/** El círculo de Asana: un toque y queda cumplido (o «por confirmar», si lo confirma la dirección). */
export function Circulo({ estado, puede, onClick, ocupado }: { estado: EstadoGuardado; puede: boolean; onClick: () => void; ocupado?: boolean }) {
  const hecho = estado === "cumplido";
  const espera = estado === "por_confirmar";
  return (
    <button type="button" disabled={!puede || ocupado} onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={hecho ? "Cumplido" : espera ? "Esperando confirmación" : "Marcar cumplido"}
      title={hecho ? "Cumplido" : espera ? "Esperando confirmación" : puede ? "Marcar cumplido" : ""}
      className={`group/c w-5 h-5 shrink-0 rounded-full border-[1.5px] inline-flex items-center justify-center transition-colors ${
        hecho ? "bg-emerald-600 border-emerald-600 text-white"
          : espera ? "bg-amber-100 border-amber-500 text-amber-600"
            : puede ? "border-gray-300 text-transparent hover:border-emerald-600 hover:text-emerald-600" : "border-gray-200 text-transparent"
      } ${ocupado ? "opacity-50" : ""}`}>
      <Check className="w-3 h-3" strokeWidth={3} />
    </button>
  );
}

const TRAMOS: { k: keyof Pick<Resumen, "aTiempo" | "tarde" | "vencidos" | "enPlazo">; color: string; label: string }[] = [
  { k: "aTiempo", color: "bg-emerald-600", label: "A tiempo" },
  { k: "tarde", color: "bg-amber-400", label: "Tarde" },
  { k: "vencidos", color: "bg-red-600", label: "Vencido" },
  { k: "enPlazo", color: "bg-gray-300", label: "En plazo" },
];

/** La «batería» de Monday: una barra partida por estado. */
export function Bateria({ r, alto = "h-2.5" }: { r: Resumen; alto?: string }) {
  const total = r.aTiempo + r.tarde + r.vencidos + r.enPlazo;
  if (!total) return <div className={`${alto} w-full rounded-full bg-gray-100`} />;
  return (
    <div className={`${alto} w-full rounded-full bg-gray-100 overflow-hidden flex`} title={TRAMOS.map((t) => `${t.label}: ${r[t.k]}`).join(" · ")}>
      {TRAMOS.map((t) => (r[t.k] ? <div key={t.k} className={t.color} style={{ width: `${(r[t.k] / total) * 100}%` }} /> : null))}
    </div>
  );
}

export function LeyendaBateria() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
      {TRAMOS.map((t) => <span key={t.k} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${t.color}`} />{t.label}</span>)}
    </div>
  );
}
