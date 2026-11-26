"use client";

/**
 * Grupo → Recetas y costos: dos tarjetas, «Recetas Atelier» y «Recetas Cafeterías» (pedido de Jahnn, 26-nov-2026,
 * con un dibujo). Un clic abre sus recetas debajo; otro clic en la misma la cierra. Empieza cerrado (orden visual:
 * plegado por defecto), salvo que se llegue con ?editar= (abrir una receta de Atelier desde otra pantalla) o ?recetas=.
 */

import { useEffect, useState } from "react";
import { ChefHat, Coffee } from "lucide-react";
import { RecetasClient } from "./recetas-client";
import { RecetasCafeteria } from "./recetas-cafeteria";

type Vista = "atelier" | "cafeterias";

const TARJETAS: { valor: Vista; titulo: string; texto: string; icono: typeof ChefHat }[] = [
  { valor: "atelier", titulo: "Recetas Atelier", texto: "Panes, pastelería, empanadas y sus sub-recetas.", icono: ChefHat },
  { valor: "cafeterias", titulo: "Recetas Cafeterías", texto: "Sánguches, bebidas y desayunos de Fonavi y Centro.", icono: Coffee },
];

export function SelectorRecetas() {
  const [vista, setVista] = useState<Vista | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const pedida = p.get("recetas");
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- leer la URL una vez al llegar */
    if (pedida === "atelier" || pedida === "cafeterias") setVista(pedida); else if (p.get("editar")) setVista("atelier");
  }, []);

  const elegir = (v: Vista) => {
    const nueva = vista === v ? null : v;
    setVista(nueva);
    const url = new URL(window.location.href);
    if (nueva) url.searchParams.set("recetas", nueva); else url.searchParams.delete("recetas");
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {TARJETAS.map(({ valor, titulo, texto, icono: Icono }) => {
          const activa = vista === valor;
          return (
            <button key={valor} type="button" onClick={() => elegir(valor)} aria-pressed={activa}
              className={`flex items-center gap-4 rounded-2xl border px-5 py-5 text-left transition-colors ${
                activa ? "border-primary bg-primary-50/60 ring-1 ring-primary" : "border-gray-200/80 bg-white hover:border-primary/40 hover:bg-gray-50"
              }`}>
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${activa ? "bg-primary text-white" : "bg-primary-50 text-primary"}`}>
                <Icono className="h-6 w-6" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-gray-900">{titulo}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{texto}</span>
                <span className="block text-xs font-medium text-primary mt-1">{activa ? "Cerrar" : "Abrir"}</span>
              </span>
            </button>
          );
        })}
      </div>
      {vista === "atelier" && <RecetasClient />}
      {vista === "cafeterias" && <RecetasCafeteria abiertaDesdeInicio />}
    </div>
  );
}
