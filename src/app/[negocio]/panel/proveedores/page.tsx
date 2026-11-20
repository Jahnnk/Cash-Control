"use client";

/**
 * /[sede]/panel/proveedores · Proveedores y precios (20-nov-2026). Vive bajo /panel para que el administrador de
 * la sede pueda entrar (su acceso es solo el Panel de Sede).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProveedores, type DatosProveedores } from "@/app/actions/proveedores";
import { ProveedoresVista } from "./proveedores-vista";

const NOMBRE: Record<string, string> = { atelier: "Atelier", fonavi: "Fonavi", centro: "Centro" };

export default function ProveedoresPage() {
  const { negocio } = useParams<{ negocio: string }>();
  const [datos, setDatos] = useState<DatosProveedores | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await getProveedores();
    if (r.ok) { setDatos(r.datos); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  return (
    <div className="space-y-4">
      <Link href={`/${negocio}/panel`} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Panel de Sede
      </Link>
      {error ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">{error}</div>
      ) : !datos ? (
        <div className="space-y-4" aria-hidden>
          <div className="h-12 w-72 animate-pulse rounded-xl bg-gray-200/60" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />)}
          </div>
        </div>
      ) : (
        <ProveedoresVista datos={datos} sedeLabel={NOMBRE[negocio] ?? negocio} onCambio={() => void cargar()} />
      )}
    </div>
  );
}
