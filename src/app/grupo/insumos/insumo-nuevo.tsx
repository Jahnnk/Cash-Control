"use client";

/** Grupo → Insumos → «Insumo nuevo»: uno que no está en el Excel (ej. jengibre en polvo), con su precio desde hoy. */

import { useState } from "react";
import { crearInsumoNuevo } from "@/app/actions/nueva-receta";

type Origen = "Atelier" | "Cafetería";
type Unidad = "kg" | "l" | "und";

export function InsumoNuevo({ origen, nombreInicial, onCerrar, onCreado }: {
  origen: Origen;
  nombreInicial: string;
  onCerrar: () => void;
  onCreado: (nombre: string) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [unidad, setUnidad] = useState<Unidad>("kg");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crear = async () => {
    setGuardando(true);
    setError(null);
    const r = await crearInsumoNuevo({ origen, nombre, unidad, precio: Number(precio.replace(",", ".")) });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    await onCreado(r.insumo.nombre);
  };

  const porUnidad = unidad === "l" ? "litro" : unidad === "und" ? "unidad" : "kg";
  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-emerald-50/40 p-4">
      <div className="text-sm font-semibold text-gray-900">Insumo nuevo · {origen === "Atelier" ? "compra Atelier" : "compran las cafeterías"}</div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <label className="text-[11px] text-gray-500">Nombre
          <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej. Jengibre en polvo"
            className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="text-[11px] text-gray-500">Se compra por
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}
            className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
            <option value="kg">kg</option><option value="l">litro</option><option value="und">unidad</option>
          </select>
        </label>
        <label className="text-[11px] text-gray-500">Precio por {porUnidad} (S/)
          <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="ej. 12.00"
            onKeyDown={(e) => { if (e.key === "Enter") void crear(); }}
            className="mt-0.5 block w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
        </label>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={guardando} onClick={() => void crear()}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-light disabled:opacity-50">
          {guardando ? "Creando…" : "Crear insumo"}
        </button>
        <button type="button" onClick={onCerrar} className="px-3 py-1.5 text-xs text-gray-600">Cancelar</button>
      </div>
      <p className="text-[11px] text-gray-500">Después ábrelo para elegir su categoría.</p>
    </div>
  );
}
