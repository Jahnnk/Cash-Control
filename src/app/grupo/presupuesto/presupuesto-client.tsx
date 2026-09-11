"use client";

import { PieChart } from "lucide-react";
import { BandaFrescura } from "@/components/banda-frescura";
import type { FrescuraGrupo } from "@/lib/frescura-datos";
import type { PanelGasto } from "@/app/actions/puedo-gastar";
import { PanelGastoCard } from "./panel-gasto";

export function PresupuestoClient({
  panel, error, frescura,
}: {
  panel: PanelGasto | null;
  error: string | null;
  frescura: FrescuraGrupo | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" />
          Presupuesto del Grupo
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Cuánta plata hay, cuánto entra y si alcanza para un gasto que no estaba previsto.
        </p>
      </div>

      {/* La cobertura manda: decidir un gasto con datos a medias es
          peor que no decidirlo. */}
      {frescura && <BandaFrescura frescura={frescura} />}

      {error && (
        <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {panel && <PanelGastoCard inicial={panel} />}
    </div>
  );
}
