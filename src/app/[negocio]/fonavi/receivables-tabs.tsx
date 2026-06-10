"use client";

import { useState } from "react";
import type { ReceivableRow } from "@/app/actions/fonavi-receivables";
import { FonaviClient, type DebtorInfo } from "./fonavi-client";

/**
 * Pestañas Fonavi | Centro dentro de un solo ítem de menú ("Por cobrar").
 * Cada pestaña es la pantalla completa e independiente de su local
 * (decisión de Jahnn: secciones separadas, sin mezclar — pero sin llenar
 * el menú de botones). El chip muestra cuántas cuentas pendientes tiene
 * cada local para ver de un vistazo dónde hay deuda.
 */
export function ReceivablesTabs({
  fonaviReceivables,
  centroReceivables,
}: {
  fonaviReceivables: ReceivableRow[];
  centroReceivables: ReceivableRow[];
}) {
  const [active, setActive] = useState<2 | 3>(2);

  const tabs: { debtor: DebtorInfo; rows: ReceivableRow[] }[] = [
    { debtor: { id: 2, name: "Fonavi" }, rows: fonaviReceivables },
    { debtor: { id: 3, name: "Centro" }, rows: centroReceivables },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 max-w-md">
        {tabs.map(({ debtor, rows }) => {
          const pending = rows.filter((r) => r.status !== "collected").length;
          return (
            <button
              key={debtor.id}
              onClick={() => setActive(debtor.id)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                active === debtor.id ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {debtor.name}
              {pending > 0 && (
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-semibold ${
                  active === debtor.id ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-600"
                }`}>
                  {pending}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map(({ debtor, rows }) =>
        active === debtor.id ? (
          <FonaviClient key={debtor.id} initialReceivables={rows} debtor={debtor} />
        ) : null,
      )}
    </div>
  );
}
