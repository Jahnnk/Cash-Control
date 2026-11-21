"use client";

/** Grupo → Precios de compra (21-nov-2026). Solo dirección (y la llave de lectura): el middleware cierra /grupo al resto. */

import { useCallback, useEffect, useState } from "react";
import { getProveedores, type DatosProveedores } from "@/app/actions/proveedores";
import { PreciosCompraVista } from "./vista";

export default function PreciosCompraPage() {
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

  if (error) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">{error}</div>;
  if (!datos) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-12 w-72 animate-pulse rounded-xl bg-gray-200/60" />
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />)}
      </div>
    );
  }
  return <PreciosCompraVista datos={datos} onCambio={() => void cargar()} />;
}
