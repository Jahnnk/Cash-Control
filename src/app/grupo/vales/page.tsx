"use client";

/**
 * Grupo → Vales de consumo (23-nov-2026, pedido de Jahnn). Antes vivía en el menú de cada cafetería, pero solo
 * Jahnn emite vales y lo hace una vez por semana: ahora es un acceso directo de la dirección. Se elige la sede
 * arriba (?sede=fonavi|centro); el resto es la misma pantalla de siempre.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ValesVista } from "@/components/vales/vales-vista";

const SEDES = [["fonavi", "Fonavi"], ["centro", "Centro"]] as const;

function Contenido() {
  const router = useRouter();
  const q = useSearchParams();
  const sede = q.get("sede") === "centro" ? "centro" : "fonavi";
  return (
    <div className="space-y-4">
      <div className="max-w-2xl mx-auto grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="radiogroup" aria-label="Sede">
        {SEDES.map(([id, nombre]) => (
          <button
            key={id} role="radio" aria-checked={sede === id}
            onClick={() => router.replace(`/grupo/vales?sede=${id}`, { scroll: false })}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${sede === id ? "bg-[#004C40] text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
          >
            {nombre}
          </button>
        ))}
      </div>
      <ValesVista key={sede} sede={sede} />
    </div>
  );
}

export default function ValesGrupoPage() {
  return (
    <Suspense fallback={<div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando…</div>}>
      <Contenido />
    </Suspense>
  );
}
