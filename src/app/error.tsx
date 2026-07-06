"use client";

/**
 * Pantalla de error global. Sin este archivo, cualquier error no
 * controlado muestra la pantalla técnica de Next.js en inglés —
 * ininteligible para quien usa la app. Aquí: mensaje claro en español
 * y un botón para reintentar (la mayoría de errores de red o de BD
 * dormida se resuelven reintentando).
 */

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Queda en los logs de Vercel para diagnóstico.
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="text-4xl mb-3">😕</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">
          Algo salió mal
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Ocurrió un error inesperado al cargar esta pantalla. Suele ser
          temporal (la conexión o la base de datos tardaron en responder).
          Reintenta; si sigue fallando, avísale a Jahnn.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: "#004C40" }}
        >
          <RefreshCcw className="w-4 h-4" />
          Reintentar
        </button>
        {error.digest && (
          <p className="mt-4 text-[11px] text-gray-400">
            Código de referencia: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
