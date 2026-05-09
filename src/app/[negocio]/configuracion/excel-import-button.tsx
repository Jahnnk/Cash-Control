"use client";

import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { ExcelImportModal } from "./excel-import-modal";

/**
 * Botón "Importar desde Excel" — abre el modal con businessId derivado
 * del prop `negocio` (que viene de la URL en el page server-component).
 * Disponible para los 3 negocios.
 */
export function ExcelImportButton({ negocio }: { negocio: string }) {
  const [open, setOpen] = useState(false);
  const negocioLabel = negocio.charAt(0).toUpperCase() + negocio.slice(1);
  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Importar desde Excel
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Sube el archivo .xlsx de Kelly para importar todos los movimientos del mes en {negocioLabel}.
              Los manuales del mismo rango se archivan (recuperables).
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-700 inline-flex items-center gap-2 shrink-0"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Importar
        </button>
      </div>
      <ExcelImportModal negocio={negocio} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
