/**
 * El propósito de Yayi's, en una línea discreta bajo el título del Panel de
 * Sede (pedido de Jahnn, 13-oct-2026): que cada administrador lo vea al
 * entrar y recuerde por qué hacemos lo que hacemos, sin quitarle espacio a
 * lo que tiene que hacer. Colores de la pieza del propósito: verde de la
 * marca y el dorado (oscurecido para que se lea sobre fondo claro).
 */

import { HouseHeart } from "lucide-react";

export const PROPOSITO = {
  inicio: "Hacer sentir en casa a cada cliente, con productos hechos con",
  destacado: "ingredientes honestos, tiempo y dedicación.",
};

export function Proposito({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs leading-snug text-primary/70 ${className}`}>
      <HouseHeart className="mt-px h-3.5 w-3.5 shrink-0 text-primary-light/80" aria-hidden />
      <span>
        <span className="sr-only">Nuestro propósito: </span>
        {PROPOSITO.inicio} <span className="font-medium text-[#A07722]">{PROPOSITO.destacado}</span>
      </span>
    </p>
  );
}
