import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getBusinessTheme } from "@/lib/business-theme";

export const dynamic = "force-dynamic";

/**
 * Pantalla amigable cuando un rol intenta acceder a un scope que no
 * le corresponde. El middleware redirige acá con ?scope=<scope>
 * para personalizar el mensaje.
 */
export default async function AccesoDenegadoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const scope = typeof sp.scope === "string" ? sp.scope : "";
  const theme = getBusinessTheme(scope);
  const scopeName = theme?.label ?? "esa sección";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
          Esta sección no está disponible
        </h1>
        <p className="text-gray-500 mt-3 text-base">
          {scopeName === "esa sección"
            ? "Tu usuario no tiene acceso a esta sección."
            : <><span className="font-medium text-gray-700">{scopeName}</span> no está disponible para tu usuario.</>}
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Si crees que esto es un error, contacta a Jahnn.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/select-business"
            className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Volver a mis negocios
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cambiar usuario
          </Link>
        </div>
      </div>
    </div>
  );
}
