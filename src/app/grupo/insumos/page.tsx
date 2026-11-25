"use client";

/**
 * Grupo → Insumos (fase 1, pedido de Jahnn, 24-nov-2026: «de aquí parte todo»). Solo dirección: el middleware
 * cierra /grupo al resto y cada action re-verifica. Reemplaza a «Precios de insumos» y trae «Conectar insumos de
 * Producción», que antes vivían en Recetas y costos.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getInsumos, guardarFichaInsumo, type DatosInsumos } from "@/app/actions/insumos";
import { archivarInsumo, guardarPrecioInsumo } from "@/app/actions/precios-insumos";
import type { AccionesFicha } from "./ficha";
import { InsumosVista, aplicarCambio } from "./vista";
import { ConectarInsumos } from "./conectar-insumos";

export default function InsumosPage() {
  const [datos, setDatos] = useState<DatosInsumos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await getInsumos();
    if (r.ok) { setDatos(r.datos); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  const acciones: AccionesFicha = useMemo(() => {
    const parchar = (origen: string, sku: string, c: Parameters<typeof aplicarCambio>[1]) =>
      setDatos((d) => d && { ...d, insumos: d.insumos.map((x) => (x.origen === origen && x.sku === sku ? aplicarCambio(x, c) : x)) });
    return {
      // Categoría, crítico, nombre y presentación son del insumo: el servidor los guarda también en su pareja.
      guardarFicha: async (i, cambio) => {
        const r = await guardarFichaInsumo({ origen: i.origen, sku: i.sku, ...cambio });
        if (!r.ok) return r.error;
        parchar(i.origen, i.sku, cambio);
        if (r.pareja && i.pareja) parchar(i.pareja.origen, i.pareja.sku, cambio);
        return null;
      },
      // El precio es de cada lado; con «ambos» se guarda el mismo en la pareja.
      guardarPrecio: async (i, precio, ambos) => {
        const hoy = datos?.hoy ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
        const r = await guardarPrecioInsumo({ origen: i.origen, sku: i.sku, precio });
        if (!r.ok) return r.error;
        parchar(i.origen, i.sku, { precio, hoy });
        const otro = i.origen === "Atelier" ? "las cafeterías" : "Atelier";
        if (ambos && i.pareja) {
          const r2 = await guardarPrecioInsumo({ origen: i.pareja.origen, sku: i.pareja.sku, precio });
          if (!r2.ok) return `Se guardó aquí, pero no en ${otro}: ${r2.error}`;
          const p = i.pareja;
          setDatos((d) => d && { ...d, insumos: d.insumos.map((x) =>
            x.origen === p.origen && x.sku === p.sku ? { ...aplicarCambio(x, { precio, hoy }), pareja: x.pareja ? { ...x.pareja, precio } : null }
            : x.origen === i.origen && x.sku === i.sku && x.pareja ? { ...x, pareja: { ...x.pareja, precio } } : x) });
        } else if (i.pareja) {
          const p = i.pareja;
          setDatos((d) => d && { ...d, insumos: d.insumos.map((x) => (x.origen === p.origen && x.sku === p.sku && x.pareja ? { ...x, pareja: { ...x.pareja, precio } } : x)) });
        }
        setAviso(`${i.nombre}: precio guardado${ambos && i.pareja ? ` aquí y en ${otro}` : ""}. Los costos de las recetas y de la carta ya usan el precio nuevo.`);
        return null;
      },
      archivar: async (i, archivar) => {
        const r = await archivarInsumo({ origen: i.origen, sku: i.sku, archivar });
        if (!r.ok) return r.error;
        parchar(i.origen, i.sku, { archivado: archivar });
        setAviso(`${i.nombre}: ${archivar ? "archivado" : "vuelve a la lista"}.`);
        return null;
      },
    };
  }, [datos?.hoy]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Insumos y packaging</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Todo lo que se compra para preparar y servir: la base de las recetas. Aquí se cambian precios, se dice cómo se compra cada cosa, se ordena por categoría y se marcan los críticos. Lo que cambias vale en todo el sistema, sin tocar el Excel.
        </p>
      </div>

      {aviso && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span className="flex-1">{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-emerald-700" aria-label="Cerrar aviso">✕</button>
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">{error}</div>
      ) : !datos ? (
        <div className="space-y-3" aria-hidden>
          <div className="h-10 w-80 animate-pulse rounded-xl bg-gray-200/60" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((k) => <div key={k} className="h-24 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />)}</div>
          {[0, 1, 2, 3, 4].map((k) => <div key={k} className="h-12 animate-pulse rounded-2xl border border-gray-200/80 bg-white" />)}
        </div>
      ) : (
        <InsumosVista datos={datos} acciones={acciones} onCreado={cargar} />
      )}

      <ConectarInsumos />
    </div>
  );
}
