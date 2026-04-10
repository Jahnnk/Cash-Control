"use client";

import { useState } from "react";
import { WeeklyReport } from "./weekly-report";
import { MonthlyReport } from "./monthly-report";
import { DebtAgingReport } from "./debt-aging-report";

export default function ReportesPage() {
  const [activeTab, setActiveTab] = useState<"semanal" | "mensual" | "antigüedad">("semanal");

  const tabs = [
    { key: "semanal" as const, label: "Semanal" },
    { key: "mensual" as const, label: "Mensual" },
    { key: "antigüedad" as const, label: "Antigüedad de deuda" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
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
      {activeTab === "antigüedad" && <DebtAgingReport />}
    </div>
  );
}
