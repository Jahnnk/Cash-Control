"use client";

import { useState, useEffect } from "react";
import { getBudgetDashboard } from "@/app/actions/budgets";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, TrendingUp, TrendingDown, Percent, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

type BudgetCategory = {
  id: string;
  name: string;
  percentage: number;
  costType: string;
  hasTrafficLight: boolean;
  thresholdGreen: number;
  thresholdYellow: number;
  description: string;
  spent: number;
  budgetSoles: number;
  consumedPct: number;
  color: "green" | "yellow" | "red";
};

type DashboardData = {
  grossIncome: number;
  totalSpent: number;
  totalOperativo: number;
  totalObligaciones: number;
  spentPct: number;
  utilidad: number;
  operativos: BudgetCategory[];
  obligaciones: BudgetCategory[];
  alerts: BudgetCategory[];
};

const DONUT_COLORS = [
  "#004C40", "#098B5F", "#22C55E", "#EAB308", "#F97316",
  "#DC2626", "#8B5CF6", "#3B82F6", "#EC4899", "#6B7280",
  "#14B8A6", "#A855F7", "#F59E0B", "#06B6D4",
];

const TYPE_LABELS: Record<string, string> = {
  fijo: "Fijo",
  semi_fijo: "Semi-fijo",
  variable: "Variable",
};

const TYPE_COLORS: Record<string, string> = {
  fijo: "bg-blue-100 text-blue-700",
  semi_fijo: "bg-purple-100 text-purple-700",
  variable: "bg-gray-100 text-gray-700",
};

const SEMAFORO: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
};

function getCurrentMonth() {
  return new Date().toISOString().substring(0, 7);
}

export function BudgetDashboard() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getBudgetDashboard(month).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [month]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Presupuesto</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (!data) return null;

  const noData = data.grossIncome === 0;

  // Donut chart data
  const donutData = data.operativos
    .filter((c) => c.spent > 0)
    .map((c) => ({ name: c.name, value: c.spent }));
  if (data.utilidad > 0) {
    donutData.push({ name: "Utilidad", value: data.utilidad });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Presupuesto</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2">
            <AlertTriangle className="w-4 h-4" /> Categorías en riesgo
          </div>
          <div className="flex flex-wrap gap-2">
            {data.alerts.map((a) => (
              <span
                key={a.id}
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  a.color === "red" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {a.name}: {a.consumedPct}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-primary-light" />}
          label="Ingresos brutos"
          value={formatCurrency(data.grossIncome)}
          accent="primary"
        />
        <SummaryCard
          icon={<TrendingDown className="w-5 h-5 text-red-600" />}
          label="Total gastado"
          value={formatCurrency(data.totalSpent)}
          accent="red"
        />
        <SummaryCard
          icon={<Percent className="w-5 h-5 text-amber-600" />}
          label="% gastado"
          value={noData ? "—" : `${data.spentPct}%`}
          accent="amber"
        />
        <SummaryCard
          icon={<DollarSign className="w-5 h-5 text-primary-light" />}
          label="Utilidad estimada"
          value={formatCurrency(data.utilidad)}
          accent={data.utilidad >= 0 ? "primary" : "red"}
        />
      </div>

      {noData && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Sin datos suficientes de ingresos para este período. Los porcentajes se mostrarán cuando haya ingresos registrados.
        </div>
      )}

      {/* Operativos — Progress Bars */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Gastos Operativos</h2>
          <p className="text-xs text-gray-500">Tope total operativo: {data.operativos.reduce((s, c) => s + c.percentage, 0)}% — Utilidad objetivo: {100 - data.operativos.reduce((s, c) => s + c.percentage, 0)}%</p>
        </div>
        <div className="divide-y divide-gray-100">
          {data.operativos.map((cat) => (
            <div key={cat.id} className="px-6 py-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLORS[cat.costType]}`}>
                    {TYPE_LABELS[cat.costType]}
                  </span>
                </div>
                <div className="text-sm text-right">
                  <span className={`font-bold ${
                    cat.color === "red" ? "text-red-600" : cat.color === "yellow" ? "text-amber-600" : "text-gray-900"
                  }`}>
                    {noData ? "—" : `${cat.consumedPct}%`}
                  </span>
                  <span className="text-gray-400 mx-1">de</span>
                  <span className="text-gray-600">{cat.percentage}%</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-3 mb-1.5">
                <div
                  className={`h-3 rounded-full transition-all ${SEMAFORO[cat.color]}`}
                  style={{ width: `${Math.min(100, cat.consumedPct)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {formatCurrency(cat.spent)} gastado
                </span>
                <span>
                  Presupuesto: {cat.budgetSoles > 0 ? formatCurrency(cat.budgetSoles) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Obligaciones */}
      {data.obligaciones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Obligaciones</h2>
            <p className="text-xs text-gray-500">Sin tope — solo tracking de montos reales</p>
          </div>
          <div className="divide-y divide-gray-100">
            {data.obligaciones.map((cat) => (
              <div key={cat.id} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLORS[cat.costType]}`}>
                    {TYPE_LABELS[cat.costType]}
                  </span>
                </div>
                <span className="text-sm font-bold text-gray-700">
                  {cat.spent > 0 ? formatCurrency(cat.spent) : "S/0.00"}
                </span>
              </div>
            ))}
          </div>
          <div className="px-6 py-3 bg-gray-50 flex items-center justify-between font-semibold text-sm">
            <span>Total obligaciones</span>
            <span>{formatCurrency(data.totalObligaciones)}</span>
          </div>
        </div>
      )}

      {/* Donut Chart */}
      {donutData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Distribución del gasto</h2>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={2}
                dataKey="value"
              >
                {donutData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "primary" | "red" | "amber";
}) {
  const borderColor =
    accent === "primary" ? "border-l-primary-light" : accent === "amber" ? "border-l-amber-500" : "border-l-red-500";
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${borderColor} p-5`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
