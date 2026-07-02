"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { Download, Sparkles } from "lucide-react";
import { GenerateReportModal } from "./generate-report-modal";
import { WeeklyReport } from "./weekly-report";
import { MonthlyReport } from "./monthly-report";
import { DailyMovementsReport } from "./daily-movements-report";
import { ReconciliationSection } from "./reconciliation-section";
import { ExportModal } from "./export-modal";

type Tab = "semanal" | "mensual" | "movimientos" | "conciliacion";

const VALID_TABS: Tab[] = ["semanal", "mensual", "movimientos", "conciliacion"];

function ReportesContent() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  // Redirecciones suaves para links viejos:
  //   - antigüedad → conciliacion (Ola 1)
  //   - ultimos7   → semanal (Ola 3, ahora con edit inline en filas <7 días)
  const initialTab: Tab =
    rawTab === "antigüedad" || rawTab === "antiguedad" || rawTab === "ultimos7"
      ? rawTab === "ultimos7" ? "semanal" : "conciliacion"
      : (VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "movimientos");
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showExport, setShowExport] = useState(false);
  const [showEirs, setShowEirs] = useState(false);
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? "atelier";
  const activeUnitId = negocio === "fonavi" ? 2 : negocio === "centro" ? 3 : 1;

  const tabs: { key: Tab; label: string }[] = [
    { key: "semanal", label: "Semanal" },
    { key: "mensual", label: "Mensual" },
    { key: "movimientos", label: "Movimientos diarios" },
    // Slug interno "conciliacion" intacto (deep-links del Dashboard);
    // solo cambia la etiqueta visible (Fase B — naming).
    { key: "conciliacion", label: "Cuadre Byte ↔ banco" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <div className="flex items-center gap-2">
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

      {activeTab === "semanal" && <WeeklyReport />}
      {activeTab === "mensual" && <MonthlyReport />}
      {activeTab === "movimientos" && <DailyMovementsReport />}
      {activeTab === "conciliacion" && <ReconciliationSection />}
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
