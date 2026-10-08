"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { formatCurrency } from "@/lib/utils";
import type { BusinessSummary } from "@/app/actions/grupo";
import { GroupKpisSection } from "../dashboard/group-kpis-section";
import { GenerateReportModal } from "@/app/[negocio]/reportes/generate-report-modal";
import { BandaFrescura } from "@/components/banda-frescura";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { SelectorMes } from "../dashboard/selector-mes";
import { VentaAGanancia } from "./venta-a-ganancia";
import { FlujoDeCaja } from "./flujo-de-caja";
import { DosMargenes } from "./dos-margenes";
import { PuntoEquilibrio } from "./punto-equilibrio";
import type { FlujoCaja } from "@/app/actions/flujo-caja";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

type Props = {
  selectedMonth: string;
  mesActual: string;
  isCurrentMonth: boolean;
  summaries: BusinessSummary[];
  frescura: FrescuraGrupo | null;
  cifras: SeisCifras | null;
  flujo: FlujoCaja | null;
};

export function GrupoReportesClient({ selectedMonth, mesActual, isCurrentMonth, summaries, frescura, cifras, flujo }: Props) {
  const [showEirs, setShowEirs] = useState(false);
  return (
    <div className="space-y-6">
      {/* LO PRIMERO: hasta cuándo tenemos datos. Va antes del título
          porque un reporte generado sobre datos a medias es peor que no
          generarlo — es la lección del reporte de agosto. */}
      {frescura && <BandaFrescura frescura={frescura} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes del Grupo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Comparativo {isCurrentMonth ? "del mes en curso" : `de ${nombreMes(selectedMonth)}`}
          </p>
        </div>
        <SelectorMes mes={selectedMonth} mesActual={mesActual} ruta="/grupo/reportes" />
        {/* El MISMO generador de las sedes, arrancando en "Grupo Yayi's".
            Desde aquí también se puede elegir cualquier sede — un solo
            lugar para todos los reportes ejecutivos (pedido de Jahnn,
            jul-2026). */}
        <button
          onClick={() => setShowEirs(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
        >
          <Sparkles className="w-4 h-4" />
          Generar Reporte Ejecutivo
        </button>
      </div>

      {/* Reporte de KPIs de la reunión: aquí se GENERA el deck (con rango
          personalizado). El dashboard solo muestra la salud. */}
      <GroupKpisSection />

      <VentaAGanancia cifras={cifras} periodo={nombreMes(selectedMonth)} />
      <FlujoDeCaja flujo={flujo} periodo={nombreMes(selectedMonth)} />
      <DosMargenes cifras={cifras} periodo={nombreMes(selectedMonth)} />
      {/* El piso de cada sede, como lo enseña el libro (5-oct-2026). */}
      <PuntoEquilibrio mes={selectedMonth} periodo={nombreMes(selectedMonth)} />

      <div>
        <h2 className="text-sm font-semibold text-gray-700">Comparativo financiero del mes</h2>
      </div>
      <DataTable
        rowKey={(r) => r.code}
        data={summaries}
        columns={[
          { key: "name", header: "Negocio", cellClassName: "font-medium" },
          { key: "bankBalance", header: "Saldo BCP", align: "right", render: (r) => formatCurrency(r.bankBalance) },
          { key: "monthlyIncome", header: "Entró (caja)", align: "right", cellClassName: "text-primary-light", render: (r) => formatCurrency(r.monthlyIncome) },
          { key: "monthlyExpenses", header: "Salió (caja)", align: "right", cellClassName: "text-red-600", render: (r) => formatCurrency(r.monthlyExpenses) },
          {
            key: "margin",
            header: "Margen de caja",
            align: "right",
            render: (r) => (
              <span className={`font-semibold ${r.margin >= 0 ? "text-primary-light" : "text-red-600"}`}>
                {formatCurrency(r.margin)}
              </span>
            ),
          },
        ]}
      />

      {showEirs && (
        <GenerateReportModal
          isAtelier={true}
          activeUnitId={1}
          initialScope="grupo"
          onClose={() => setShowEirs(false)}
        />
      )}
    </div>
  );
}
