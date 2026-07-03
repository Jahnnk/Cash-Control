"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, Upload, Database, CheckCircle2, CircleDashed } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  getProductDataStatus,
  type ProductDataStatus,
} from "@/app/actions/product-sales-import";
import { ImportSalesModal } from "./import-sales-modal";

/**
 * PIC · Inteligencia Comercial — Fase 0: el cimiento de datos.
 * Esta página muestra el estado del Business Knowledge Engine (catálogo
 * sincronizado + meses de ventas importados con su calidad) y permite
 * importar el reporte mensual de Byte. Las fases siguientes montan aquí
 * el cerebro: veredictos por producto, Health Score y recomendaciones.
 */
export default function ProductosPage() {
  const [status, setStatus] = useState<ProductDataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(await getProductDataStatus());
    setLoading(false);
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const monthLabel = (m: string) => {
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
    const s = d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            Inteligencia Comercial
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            El Director Comercial digital de Yayi&apos;s. Fase actual:{" "}
            <span className="font-medium text-gray-700">cimiento de datos</span> — catálogo con
            costos + ventas por producto. Con 1 mes cargado se activan los análisis de carta;
            con 3, las tendencias.
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
        >
          <Upload className="w-3.5 h-3.5" />
          Importar ventas del mes (Byte)
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          Cargando...
        </div>
      ) : (
        <>
          {/* Estado del cimiento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                <Database className="w-4 h-4 text-primary" />
                Catálogo con costos (pricing-engine)
              </div>
              {status && status.catalog.total > 0 ? (
                <div className="text-sm text-gray-700">
                  <span className="text-2xl font-bold text-gray-900">{status.catalog.active}</span>{" "}
                  productos activos ({status.catalog.total} en total)
                  <div className="text-xs text-gray-500 mt-1">
                    Costos y márgenes objetivo congelados hasta{" "}
                    {status.catalog.latestSnapshotMonth ? monthLabel(status.catalog.latestSnapshotMonth) : "—"}.
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  Sin catálogo sincronizado para esta sede todavía.
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
                {status && status.months.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <CircleDashed className="w-4 h-4 text-gray-400" />
                )}
                Ventas por producto
              </div>
              <div className="text-sm text-gray-700">
                <span className="text-2xl font-bold text-gray-900">{status?.months.length ?? 0}</span>{" "}
                mes{(status?.months.length ?? 0) === 1 ? "" : "es"} importado{(status?.months.length ?? 0) === 1 ? "" : "s"}
                <div className="text-xs text-gray-500 mt-1">
                  Fuente: reporte de Byte &ldquo;Productos con mayor rotación&rdquo;, un archivo por mes.
                </div>
              </div>
            </div>
          </div>

          {/* Meses importados */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
              Meses cargados
            </div>
            {!status || status.months.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                Aún no hay ventas por producto. Sube el reporte de Byte del último mes cerrado
                para encender la inteligencia.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase text-gray-500 bg-gray-50">
                    <th className="text-left px-4 py-2 font-medium">Mes</th>
                    <th className="text-right px-4 py-2 font-medium">Productos</th>
                    <th className="text-right px-4 py-2 font-medium">Match catálogo</th>
                    <th className="text-right px-4 py-2 font-medium">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {status.months.map((m) => {
                    const pct = m.products ? Math.round((m.matched / m.products) * 100) : 0;
                    return (
                      <tr key={m.month} className="border-t border-gray-100">
                        <td className="px-4 py-2 font-medium text-gray-900">{monthLabel(m.month)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{m.products}</td>
                        <td className={`px-4 py-2 text-right font-medium ${pct >= 80 ? "text-emerald-600" : pct >= 40 ? "text-amber-600" : "text-gray-500"}`}>
                          {m.matched}/{m.products} ({pct}%)
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(m.totalRevenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showImport && (
        <ImportSalesModal onClose={() => setShowImport(false)} onImported={load} />
      )}
    </div>
  );
}
