"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { WeeklyReport } from "./weekly-report";
import { MonthlyReport } from "./monthly-report";
import { ReconciliationSection } from "./reconciliation-section";
import { ExportModal } from "./export-modal";

type Tab = "semanal" | "mensual" | "conciliacion";

const VALID_TABS: Tab[] = ["semanal", "mensual", "conciliacion"];

function ReportesContent() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  // Redirecciones suaves para links viejos:
  //   - antigüedad → conciliacion (Ola 1)
  //   - ultimos7   → semanal (Ola 3, ahora con edit inline en filas <7 días)
  const initialTab: Tab =
    rawTab === "antigüedad" || rawTab === "antiguedad" || rawTab === "ultimos7"
      ? rawTab === "ultimos7" ? "semanal" : "conciliacion"
      : (VALID_TABS.includes(rawTab as Tab) ? (rawTab as Tab) : "semanal");
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [showExport, setShowExport] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: "semanal", label: "Semanal" },
    { key: "mensual", label: "Mensual" },
    { key: "conciliacion", label: "Conciliación" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <button
          onClick={() => setShowExport(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light flex items-center gap-2 text-sm font-medium"
        >
          <Download className="w-4 h-4" /> Exportar reporte
        </button>
      </div>
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}

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
