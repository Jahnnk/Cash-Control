"use client";

/**
 * Grupo → Reportes. Fase 2 (23-oct-2026, «la epifanía» de Jahnn): el mes en el orden de sus 8 puntos, en 4 secciones —
 * 1 Ventas (Byte, por sede y grupo) · 2 Del sol vendido a la utilidad (costos variables y fijos, EBITDA como termómetro,
 * regla 33-33-33 y Profit First; plegado el estado de resultados y el cuadre con el Excel). El 1-nov-2026 salieron lo repetido
 * («Para el contador») y Productos (vive solo en Grupo → Productos); el flujo de caja, Profit First y el punto de equilibrio
 * pasaron al Dashboard. Arriba: hasta cuándo hay datos y lo que se genera para la
 * reunión (deck y reporte ejecutivo). El estado de los datos va en una sola línea plegada (1-nov-2026).
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { KpiDeckButton } from "@/components/kpi-deck-button";
import { semanaDeLaReunion } from "@/lib/kpis/semana-reunion";
import { GenerateReportModal } from "@/app/[negocio]/reportes/generate-report-modal";
import { EstadoDatos } from "./estado-datos";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { SelectorMes } from "../dashboard/selector-mes";
import { SemaforoMes } from "../dashboard/semaforo-mes";
import { ConciliacionMes } from "./conciliacion-mes";
import { EgresosPorTipoSeccion } from "./egresos-por-tipo";
import { EstadoResultados } from "./estado-resultados";
import { VentasMeses } from "./ventas-meses";
import { VentasPorDia } from "./ventas-por-dia";
import { CascadaSol } from "./cascada-sol";
import { CajaExcel } from "../dashboard/caja-excel";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

type Props = {
  selectedMonth: string;
  mesActual: string;
  frescura: FrescuraGrupo | null;
  cifras: SeisCifras | null;
  /** Llegó desde el Dashboard con una sede (o el Grupo) elegida: el detalle por día viene abierto. */
  ventasDia?: { sede: number | null } | null;
};

export function GrupoReportesClient({ selectedMonth, mesActual, frescura, cifras, ventasDia = null }: Props) {
  const [showEirs, setShowEirs] = useState(false);
  const hoyLima = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  // La reunión de los lunes mira la ÚLTIMA semana cerrada (dom→sáb), no la que recién empieza (19-oct-2026).
  const semana = semanaDeLaReunion(hoyLima);
  const periodo = nombreMes(selectedMonth);
  return (
    <div className="space-y-5 max-w-6xl min-w-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Reportes</h1>
          <SelectorMes mes={selectedMonth} mesActual={mesActual} ruta="/grupo/reportes" />
        </div>
        {/* Lo que se genera para la reunión. El reporte ejecutivo es el MISMO generador de las
            sedes, arrancando en "Grupo Yayi's" (un solo lugar para todos — jul-2026). Los KPIs
            de la semana se VEN en Dashboard → Equipo. */}
        <div className="flex flex-wrap items-center gap-2">
          <KpiDeckButton defaultStart={semana.start} defaultEnd={semana.end} />
          <button
            onClick={() => setShowEirs(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Reporte ejecutivo
          </button>
        </div>
      </header>

      {/* Hasta cuándo hay datos y lo que falta subir: una línea discreta; el detalle se abre al tocarla (1-nov-2026). */}
      <EstadoDatos frescura={frescura} start={semana.start} end={semana.end} />

      {/* Fase 2 (23-oct-2026): los 8 puntos de Jahnn en 4 secciones, en el orden del sol vendido.
          1 · Ventas (punto 1). */}
      <VentasMeses mes={selectedMonth} periodo={periodo} />
      <VentasPorDia mes={selectedMonth} sedeInicial={ventasDia?.sede ?? null} abierta={ventasDia !== null} />

      {/* 2 · Del sol vendido a la utilidad (puntos 2 a 7): la cascada, y plegado el detalle y el cuadre con el Excel.
          Arriba, si esas cifras son confiables (controles de fiabilidad, 24-oct-2026). */}
      <SemaforoMes mes={selectedMonth} />
      <CascadaSol cifras={cifras} periodo={periodo} />
      <div className="space-y-3">
        <EstadoResultados cifras={cifras} mes={selectedMonth} periodo={periodo} />
        <ConciliacionMes cifras={cifras} periodo={periodo} />
        {/* La pestaña «Resumen fijo vs variable» de Jahnn: lo que salió, en cinco tipos, y su puente a las seis cifras (25-oct-2026). */}
        <EgresosPorTipoSeccion mes={selectedMonth} periodo={periodo} />
        {/* Lo que Kelly escribe al pie de cada hoja Ing&Gtos, leído bien: el destino de «Ver cómo cuadra con el Excel» del Dashboard. */}
        <CajaExcel cifras={cifras} periodo={periodo} />
      </div>

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
