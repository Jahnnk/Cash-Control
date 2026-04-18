"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WeeklyReport } from "./weekly-report";
import { MonthlyReport } from "./monthly-report";
import { DebtAgingReport } from "./debt-aging-report";
import { Last7DaysReport } from "./last7-days-report";
import { ReconciliationSection } from "./reconciliation-section";

type Tab = "semanal" | "mensual" | "ultimos7" | "conciliacion" | "antigüedad";

const VALID_TABS: Tab[] = ["semanal", "mensual", "ultimos7", "conciliacion", "antigüedad"];

function ReportesContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "semanal";
  const [activeTab, setActiveTab] = useState<Tab>(
    VALID_TABS.includes(initialTab) ? initialTab : "semanal"
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "semanal", label: "Semanal" },
    { key: "mensual", label: "Mensual" },
    { key: "ultimos7", label: "Últimos 7 días" },
    { key: "conciliacion", label: "Conciliación" },
    { key: "antigüedad", label: "Antigüedad de deuda" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>

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
      {activeTab === "ultimos7" && <Last7DaysReport />}
      {activeTab === "conciliacion" && <ReconciliationSection />}
      {activeTab === "antigüedad" && <DebtAgingReport />}
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
