"use client";

import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { ExcelImportModal } from "@/app/[negocio]/configuracion/excel-import-modal";

type Sede = "atelier" | "fonavi" | "centro";

/**
 * Import central de los Excel de Kelly (solo dirección, desde Grupo).
 * Opción A decidida con Jahnn (jul-2026): la sede se ELIGE antes de
 * abrir el modal — botones explícitos, nada de adivinar de qué sede es
 * el archivo (los Excel son idénticos en formato y un import en la
 * sede equivocada sería un incidente de datos silencioso). La sede
 * viaja explícita hasta las actions (sedeCentral). Desde jul-2026
 * Kelly también lleva Atelier: sus registros especiales (clientes B2B,
 * préstamos socio, compartidos) están PROTEGIDOS del archivado.
 */
export function KellyImportCard() {
  const [sede, setSede] = useState<Sede | null>(null);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            Importar Excel de Kelly
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Sin salir del Grupo: elige la sede del archivo y suéltalo. Mismo import de siempre
            (idempotente por mes) — solo cambia dónde lo subes.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSede("atelier")}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" /> Excel de Atelier
          </button>
          <button
            onClick={() => setSede("fonavi")}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" /> Excel de Fonavi
          </button>
          <button
            onClick={() => setSede("centro")}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 rounded-lg"
          >
            <Upload className="w-3.5 h-3.5" /> Excel de Centro
          </button>
        </div>
      </div>

      {sede !== null && (
        <ExcelImportModal
          negocio={sede}
          sedeCentral={sede}
          open={true}
          onClose={() => setSede(null)}
        />
      )}
    </section>
  );
}
