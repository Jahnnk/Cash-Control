import { GrupoProductosClient } from "@/app/grupo/productos/grupo-productos-client";

export const dynamic = "force-dynamic";

const SEDE: Record<string, number> = { atelier: 1, fonavi: 2, centro: 3 };

/**
 * Productos de una sede = Grupo → Productos con la sede fija (un solo cerebro, decisión de
 * Jahnn, 8-oct-2026). Antes era la «Inteligencia Comercial» vieja (Portfolio Health, Star/Plow
 * horse, Board Package), que conocía el costo de ~49% de lo vendido y podía contradecir a
 * «¿Dónde ganamos plata?» y «Candidatos a reemplazo». Sus datos y su motor (lib/portfolio)
 * siguen intactos; solo dejó de mostrarse.
 */
export default async function ProductosSedePage({ params }: { params: Promise<{ negocio: string }> }) {
  const { negocio } = await params;
  return <GrupoProductosClient sedeFija={SEDE[negocio] ?? 1} />;
}
