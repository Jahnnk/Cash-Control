"use client";

/**
 * Piezas visuales de las pantallas de productos (rediseño del 22-sep-2026).
 *
 * Jahnn: "el diseño deja mucho que desear, está todo amontonado, en el top 10
 * por mes no se ven los nombres completos". Principios de este rediseño:
 *   · Aire: tarjetas con p-5/p-6 y filas de 12px de alto útil, no tablas prensadas.
 *   · Nombres completos siempre (se parten en dos líneas antes que cortarse).
 *   · Las proporciones se VEN (barras), los números se alinean (tabular-nums).
 *   · El color de cada familia es el mismo en todas las vistas.
 */

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Un color por familia, el mismo en todas las pantallas. */
export const COLOR_FAMILIA: Record<string, string> = {
  "Postres y pastelería": "#098B5F",
  "Sánguches, platos y desayunos": "#C8893B",
  "Empanadas": "#C9674A",
  "Jugos, batidos y bebidas frías": "#3F8DAE",
  "Panes y masa madre": "#9C8358",
  "Café e infusiones": "#6E5140",
  "Otros (extras y retail)": "#B6BCB8",
};

export const colorFamilia = (f: string) => COLOR_FAMILIA[f] ?? "#B6BCB8";

export function Seccion({ titulo, subtitulo, acciones, children, className = "" }: {
  titulo?: ReactNode; subtitulo?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-200/80 p-4 sm:p-6 min-w-0 ${className}`}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            {titulo && <h3 className="text-[15px] font-semibold text-gray-900 leading-tight">{titulo}</h3>}
            {subtitulo && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{subtitulo}</p>}
          </div>
          {acciones && <div className="shrink-0">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Sección plegable: cerrada hasta que se la pide (regla de Jahnn, 24-sep-2026:
 * orden visual — lo nuevo no se abre solo). Cerrada muestra el título y un
 * resumen corto para saber si vale la pena abrirla.
 */
export function SeccionDesplegable({ titulo, subtitulo, resumen, children, abiertaAlInicio = false, onAbrir, className = "" }: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Lo que se ve con la sección cerrada (ej. conteos). */
  resumen?: ReactNode;
  children: ReactNode;
  abiertaAlInicio?: boolean;
  /** Se llama la primera vez que se abre (para cargar datos recién ahí si hace falta). */
  onAbrir?: () => void;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  const id = useId();
  return (
    <section className={`bg-white rounded-2xl border border-gray-200/80 min-w-0 ${className}`}>
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={id}
        onClick={() => { if (!abierta) onAbrir?.(); setAbierta(!abierta); }}
        className="w-full text-left flex items-start justify-between gap-3 p-4 sm:p-6 rounded-2xl hover:bg-gray-50/60 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-gray-900 leading-tight">{titulo}</h3>
          {subtitulo && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{subtitulo}</p>}
          {/* Cerrada: el resumen dice si vale la pena abrirla; abierta, el detalle ya lo muestra. */}
          {resumen && !abierta && <div className="mt-2.5">{resumen}</div>}
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary mt-0.5">
          {abierta ? "Cerrar" : "Abrir"}
          <ChevronDown className={`w-4 h-4 transition-transform ${abierta ? "rotate-180" : ""}`} />
        </span>
      </button>
      {abierta && <div id={id} className="px-4 sm:px-6 pb-4 sm:pb-6">{children}</div>}
    </section>
  );
}

export function Kpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 px-4 py-4 sm:px-5 min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{etiqueta}</div>
      <div className="text-xl sm:text-2xl font-semibold text-gray-900 tabular-nums mt-1.5 leading-none break-words">{valor}</div>
      {detalle && <div className="text-xs text-gray-500 mt-2">{detalle}</div>}
    </div>
  );
}

export function Segmentado<T extends string | number>({ opciones, valor, onChange, tamano = "md", lleno = false }: {
  opciones: { valor: T; etiqueta: ReactNode; deshabilitado?: boolean }[];
  valor: T;
  onChange: (v: T) => void;
  tamano?: "sm" | "md";
  /** Ocupa todo el ancho y reparte los botones (en el celular). */
  lleno?: boolean;
}) {
  const pad = `${tamano === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}${lleno ? " flex-1" : ""}`;
  return (
    <div className={`${lleno ? "flex w-full sm:w-auto sm:inline-flex" : "inline-flex"} max-w-full overflow-x-auto rounded-xl bg-gray-100 p-1 gap-1`}>
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          disabled={o.deshabilitado}
          onClick={() => onChange(o.valor)}
          className={`${pad} rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            o.valor === valor ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}

type Tono = "verde" | "rojo" | "ambar" | "gris" | "azul" | "marca";

const TONOS: Record<Tono, string> = {
  verde: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  rojo: "bg-red-50 text-red-800 ring-red-200",
  ambar: "bg-amber-50 text-amber-900 ring-amber-200",
  gris: "bg-gray-100 text-gray-600 ring-gray-200",
  azul: "bg-sky-50 text-sky-800 ring-sky-200",
  marca: "bg-primary-50 text-primary ring-primary-100",
};

export function Pastilla({ children, tono = "gris" }: { children: ReactNode; tono?: Tono }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${TONOS[tono]}`}>
      {children}
    </span>
  );
}

/** Variación en %, coloreada: ≥ +15% verde, ≤ −15% rojo (la regla del informe). */
export function Variacion({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-gray-400">—</span>;
  const tono: Tono = v >= 15 ? "verde" : v <= -15 ? "rojo" : "gris";
  return <Pastilla tono={tono}>{v > 0 ? "+" : ""}{v}%</Pastilla>;
}

export function Barra({ pct, color = "#098B5F", alto = "h-1.5" }: { pct: number; color?: string; alto?: string }) {
  return (
    <div className={`${alto} w-full rounded-full bg-gray-100 overflow-hidden`}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

export function PuntoFamilia({ familia }: { familia: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorFamilia(familia) }} />;
}

/** El número de puesto, en un círculo. */
export function Puesto({ n, destacado = false }: { n: number; destacado?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold tabular-nums shrink-0 ${
      destacado ? "bg-primary text-white" : "bg-gray-100 text-gray-600"
    }`}>
      {n}
    </span>
  );
}

export const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
export const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

export function fechaCorta(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;
}

export function nombreMes(month: string, corto = false): string {
  const i = Number(month.slice(5, 7)) - 1;
  return corto ? MESES_CORTOS[i] : MESES_LARGOS[i];
}
