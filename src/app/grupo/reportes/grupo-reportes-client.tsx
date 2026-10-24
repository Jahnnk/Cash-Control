"use client";

/**
 * Grupo → Reportes. Fase 2 (23-oct-2026, «la epifanía» de Jahnn): el mes en el orden de sus 8 puntos, en 4 secciones —
 * 1 Ventas (Byte, por sede y grupo) · 2 Del sol vendido a la utilidad (costos variables y fijos, EBITDA como termómetro,
 * regla 33-33-33 y Profit First; plegado el estado de resultados y el cuadre con el Excel) · 3 Productos (potenciar y
 * reemplazar) · 4 Para el contador (todo lo técnico, plegado). Arriba: hasta cuándo hay datos y lo que se genera para la
 * reunión (deck y reporte ejecutivo).
 */

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { KpiDeckButton } from "@/components/kpi-deck-button";
import { semanaDeLaReunion } from "@/lib/kpis/semana-reunion";
import { EstadoDatosReunion } from "@/components/estado-datos-reunion";
import { GenerateReportModal } from "@/app/[negocio]/reportes/generate-report-modal";
import { BandaFrescura } from "@/components/banda-frescura";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import type { SeisCifras } from "@/app/actions/seis-cifras";
import { SelectorMes } from "../dashboard/selector-mes";
import { FlujoDeCaja } from "./flujo-de-caja";
import { DosMargenes } from "./dos-margenes";
import { ConciliacionMes } from "./conciliacion-mes";
import { EstadoResultados } from "./estado-resultados";
import { Regla33 } from "./regla-33";
import { SemaforoMes } from "@/app/grupo/dashboard/semaforo-mes";
import { MotoresEbitda } from "./motores-ebitda";
import type { Motores } from "@/lib/motores-ebitda";
import { ProfitFirst } from "./profit-first";
import { VentasMeses } from "./ventas-meses";
import { CascadaSol } from "./cascada-sol";
import { ProductosDecision } from "./productos-decision";
import { PuntoEquilibrio } from "./punto-equilibrio";
import type { FlujoCaja } from "@/app/actions/flujo-caja";
import type { GroupBreakeven } from "@/app/actions/breakeven";
import { SeccionDesplegable } from "@/components/productos/ui";
import { CajaExcel } from "../dashboard/caja-excel";
import { SeisCifrasPanel } from "../dashboard/seis-cifras-panel";
import { TableroEbitda } from "../dashboard/tablero-ebitda";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

type Props = {
  selectedMonth: string;
  mesActual: string;
  frescura: FrescuraGrupo | null;
  cifras: SeisCifras | null;
  flujo: FlujoCaja | null;
  motores: Motores[] | null;
  breakeven: GroupBreakeven | null;
};

export function GrupoReportesClient({ selectedMonth, mesActual, frescura, cifras, flujo, motores, breakeven }: Props) {
  const [showEirs, setShowEirs] = useState(false);
  const hoyLima = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  // La reunión de los lunes mira la ÚLTIMA semana cerrada (dom→sáb), no la que recién empieza (19-oct-2026).
  const semana = semanaDeLaReunion(hoyLima);
  const periodo = nombreMes(selectedMonth);
  return (
    <div className="space-y-5 max-w-6xl min-w-0">
      {/* LO PRIMERO: hasta cuándo tenemos datos. Va antes del título
          porque un reporte generado sobre datos a medias es peor que no
          generarlo — es la lección del reporte de agosto. */}
      {frescura && <BandaFrescura frescura={frescura} />}

      {/* Lo que suben los administradores para la semana de la reunión: KPIs diarios, Byte y archivos del sábado. */}
      <EstadoDatosReunion start={semana.start} end={semana.end} />

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

      {/* Fase 2 (23-oct-2026): los 8 puntos de Jahnn en 4 secciones, en el orden del sol vendido.
          1 · Ventas (punto 1). */}
      <VentasMeses mes={selectedMonth} periodo={periodo} />

      {/* 2 · Del sol vendido a la utilidad (puntos 2 a 7): la cascada, y plegado el detalle y el cuadre con el Excel.
          Arriba, si esas cifras son confiables (controles de fiabilidad, 24-oct-2026). */}
      <SemaforoMes mes={selectedMonth} />
      <CascadaSol cifras={cifras} periodo={periodo} />
      <div className="space-y-3">
        <EstadoResultados cifras={cifras} mes={selectedMonth} periodo={periodo} />
        <ConciliacionMes cifras={cifras} periodo={periodo} />
      </div>

      {/* 3 · Productos (punto 8): qué potenciar y qué reemplazar. */}
      <ProductosDecision mes={selectedMonth} />

      {/* 4 · Para el contador: todo lo técnico, plegado (antes eran 8 secciones sueltas). */}
      <SeccionDesplegable
        titulo="Para el contador"
        subtitulo="Los márgenes, los motores del EBITDA, la regla 33-33-33 y Profit First en detalle, el flujo de caja, el punto de equilibrio, las seis cifras y el resultado según el Excel."
      >
        <div className="space-y-4">
          <DosMargenes cifras={cifras} periodo={periodo} />
          <MotoresEbitda motores={motores} periodo={periodo} />
          <SemaforoMes mes={selectedMonth} />
          <Regla33 cifras={cifras} periodo={periodo} />
          <ProfitFirst cifras={cifras} periodo={periodo} />
          <FlujoDeCaja flujo={flujo} periodo={periodo} />
          <PuntoEquilibrio mes={selectedMonth} periodo={periodo} />
          <SeisCifrasPanel cifras={cifras} periodo={periodo} />
          <CajaExcel cifras={cifras} periodo={periodo} mesesHref={`/grupo/reportes?mes=${selectedMonth}`} />
          <TableroEbitda cifras={cifras} breakeven={breakeven} motores={motores} selectedMonth={selectedMonth} isCurrentMonth={selectedMonth === mesActual} periodo={periodo} />
        </div>
      </SeccionDesplegable>

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
