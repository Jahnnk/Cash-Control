"use client";

/**
 * Grupo → Reportes (rediseño UX, 8-oct-2026): arriba, hasta cuándo hay datos y las dos cosas que se
 * generan para la reunión (el deck y el reporte ejecutivo); debajo, los cuatro reportes del mes,
 * todos plegados y cada uno con su conclusión a la vista. Se quitó el «Comparativo financiero del
 * mes» (saldo BCP / entró / salió): repetía el margen de caja de «Los dos márgenes» y mostraba el
 * saldo de HOY aunque se mirara un mes pasado; la liquidez vive en Sistema de Dirección.
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
import { MotoresEbitda } from "./motores-ebitda";
import type { Motores } from "@/lib/motores-ebitda";
import { ProfitFirst } from "./profit-first";
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

      {/* Lo real de las tres sedes en 6 meses: ventas → EBITDA → ganancia (Fase 2, 16-oct-2026). */}
      <EstadoResultados cifras={cifras} mes={selectedMonth} periodo={periodo} />
      {/* La conciliación que Jahnn hizo a mano con setiembre, ahora sola (16-oct-2026). */}
      <ConciliacionMes cifras={cifras} periodo={periodo} />
      <DosMargenes cifras={cifras} periodo={periodo} />
      {/* Los cuatro motores: cuál frena el EBITDA (15-oct-2026). */}
      <MotoresEbitda motores={motores} periodo={periodo} />
      {/* El EBITDA como termómetro: la regla del 33-33-33 de la asesoría (15-oct-2026). */}
      <Regla33 cifras={cifras} periodo={periodo} />
      {/* Profit First: apartar el 25% de la venta primero (15-oct-2026). */}
      <ProfitFirst cifras={cifras} periodo={periodo} />
      <FlujoDeCaja flujo={flujo} periodo={periodo} />
      {/* El piso de cada sede, como lo enseña el libro (5-oct-2026). */}
      <PuntoEquilibrio mes={selectedMonth} periodo={periodo} />

      {/* Lo que antes repetía el Resumen del Dashboard (19-oct-2026): las seis cifras, el resultado según el Excel y el
          tablero de rentabilidad. Plegado: es para el contador, no para el día a día. */}
      <SeccionDesplegable
        titulo="Para el contador"
        subtitulo="Las seis cifras, el resultado según el Excel y el tablero de rentabilidad (EBITDA)."
      >
        <div className="space-y-8">
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
