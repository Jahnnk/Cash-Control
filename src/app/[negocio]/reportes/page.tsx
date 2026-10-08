"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { Download, Sparkles } from "lucide-react";
import { GenerateReportModal } from "./generate-report-modal";
import { MonthlyReport } from "./monthly-report";
import { DailyMovementsReport } from "./daily-movements-report";
import { ExportModal } from "./export-modal";

/**
 * Reportes de una sede (UX, 8-oct-2026, decisión de Jahnn: «dejar solo lo vivo»). Quedan dos
 * pestañas: «El mes» y «Movimientos». Se ocultaron Semanal, Cuadre BCP y Cuadre Byte ↔ banco:
 * dependían del cierre diario de Byte y del saldo del banco anotados a mano, que nadie llena
 * desde agosto (todo entra con el Excel). El equilibrio y el flujo viven en Grupo → Reportes.
 */
type Tab = "mensual" | "movimientos";

function ReportesContent() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const initialTab: Tab = rawTab === "movimientos" ? "movimientos" : "mensual";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showExport, setShowExport] = useState(false);
  const [showEirs, setShowEirs] = useState(false);
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? "atelier";
  const activeUnitId = negocio === "fonavi" ? 2 : negocio === "centro" ? 3 : 1;

  const tabs: { key: Tab; label: string }[] = [
    { key: "mensual", label: "El mes" },
    { key: "movimientos", label: "Movimientos" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowEirs(true)}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light flex items-center gap-2 text-sm font-medium"
            title="Reporte Ejecutivo mensual: análisis, riesgos, oportunidades y plan de acción"
          >
            <Sparkles className="w-4 h-4" /> Generar Reporte
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium"
            title="Exportación clásica de datos (movimientos del mes)"
          >
            <Download className="w-4 h-4" /> Exportar datos
          </button>
        </div>
      </div>
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {showEirs && (
        <GenerateReportModal
          isAtelier={activeUnitId === 1}
          activeUnitId={activeUnitId}
          onClose={() => setShowEirs(false)}
        />
      )}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-max py-2.5 px-4 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-white text-primary shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "mensual" && <MonthlyReport />}
      {activeTab === "movimientos" && <DailyMovementsReport />}
    </div>
  );
}

export default function ReportesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>}>
      <ReportesContent />
    </Suspense>
  );
}
