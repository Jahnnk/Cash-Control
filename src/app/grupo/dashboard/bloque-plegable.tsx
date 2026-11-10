"use client";

/**
 * Fila plegable de «Movimiento de dinero» (pedido de Jahnn, 10-nov-2026: la sección 2 ocupaba demasiado).
 * Cerrada ocupa UNA línea con el título y la cifra que importa; abierta muestra el detalle. Empieza cerrada.
 */

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const TONOS = { sky: "bg-sky-50/60", violet: "bg-violet-50/60", amber: "bg-amber-50/60" } as const;

export function BloquePlegable({ tono, icono, titulo, cifra, children }: {
  tono: keyof typeof TONOS;
  icono: ReactNode;
  titulo: ReactNode;
  /** Lo que se ve con el bloque cerrado: la cifra de la fila. */
  cifra?: ReactNode;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <div className={`mt-2 rounded-2xl ${TONOS[tono]}`}>
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-primary"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-gray-600">{icono}<span className="truncate">{titulo}</span></span>
        <span className="flex shrink-0 items-center gap-2">
          {cifra && <b className="text-base font-semibold tabular-nums text-gray-900">{cifra}</b>}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>
      {abierto && <div id={id} className="px-4 pb-4">{children}</div>}
    </div>
  );
}
