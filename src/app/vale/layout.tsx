import type { Metadata } from "next";
import { DOMINIO_VALES } from "@/lib/vales";

/**
 * Fija la dirección base de las páginas públicas del vale. Next arma la URL de la imagen de la vista previa
 * (WhatsApp) con el dominio que Vercel le dé por defecto, que puede no ser el real: `cash-control.vercel.app`
 * da 404 (AGENTS.md). Con esto la imagen siempre apunta al dominio de producción.
 */
export const metadata: Metadata = { metadataBase: new URL(DOMINIO_VALES) };

export default function ValeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
