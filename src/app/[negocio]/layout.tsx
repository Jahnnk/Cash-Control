import { notFound } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { isValidBusinessCode, getBusinessByCode } from "@/lib/businesses";

/**
 * Layout de /[negocio]/...  — solo para los 3 negocios reales.
 * /grupo/... usa src/app/grupo/layout.tsx (consolidado, lógica distinta).
 *
 * - 404 si el code no es atelier/fonavi/centro o si está inactivo en BD.
 * - Persiste cookie del negocio activo (para acciones que no reciben
 *   el code por param).
 * - Monta Sidebar adaptativo + main con offset lg:ml-64.
 */
export default async function NegocioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ negocio: string }>;
}) {
  const { negocio } = await params;

  if (!isValidBusinessCode(negocio)) notFound();
  const b = await getBusinessByCode(negocio);
  if (!b) notFound();
  // La cookie + header se setean en middleware.ts (Next 16 prohíbe modificar
  // cookies desde server components fuera de server actions / route handlers).

  return (
    <>
      <Sidebar />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 pt-16 lg:p-8 lg:pt-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </>
  );
}
