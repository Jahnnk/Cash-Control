"use client";

/**
 * «Necesita tu atención» (UX, 8-oct-2026): lo que pide una acción de Jahnn, ordenado por urgencia,
 * cada cosa con su botón. Se ven 4; el resto queda a un toque («Ver N más»). Sin nada pendiente,
 * la tarjeta lo dice en una línea. Reglas: lib/grupo/atencion.ts.
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { VISIBLES, type Atencion } from "@/lib/grupo/atencion";

export function AtencionCard({ items, onIr }: { items: Atencion[]; onIr: (href: string) => boolean }) {
  const [todas, setTodas] = useState(false);
  const visibles = todas ? items : items.slice(0, VISIBLES);

  return (
    <section className="bg-white rounded-3xl border border-gray-200/80 p-5 sm:p-6 min-w-0" aria-labelledby="atencion-titulo">
      <h2 id="atencion-titulo" className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
        {items.length ? `Necesita tu atención · ${items.length}` : "Necesita tu atención"}
      </h2>

      {items.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-gray-700">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          Todo en orden. No hay nada que pida una acción tuya hoy.
        </div>
      ) : (
        <ul className="mt-3 -mx-2">
          {visibles.map((a) => (
            <li key={a.id}>
              <Link
                href={a.href.startsWith("#") ? "/grupo/dashboard" : a.href}
                onClick={(e) => { if (onIr(a.href)) e.preventDefault(); }}
                className="group flex items-start gap-3 rounded-xl px-2 py-3 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span aria-hidden className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.nivel === "alto" ? "bg-red-500" : "bg-amber-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 leading-snug">{a.titulo}</span>
                  <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{a.detalle}</span>
                </span>
                <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-primary mt-0.5 opacity-80 group-hover:opacity-100">
                  {a.accion}<ChevronRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {items.length > VISIBLES && (
        <button type="button" onClick={() => setTodas(!todas)} className="mt-1 text-xs font-medium text-gray-500 hover:text-gray-800">
          {todas ? "Ver menos" : `Ver ${items.length - VISIBLES} más`}
        </button>
      )}
    </section>
  );
}
