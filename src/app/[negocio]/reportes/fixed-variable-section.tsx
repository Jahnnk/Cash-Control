"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { getFixedVariableMonth, type FixedVariableMonth } from "@/app/actions/fixed-variable-report";
import { formatCurrency } from "@/lib/utils";
import type { FVGroup } from "@/lib/fixed-variable";

/**
 * Sección "Egresos fijos vs variables" del reporte mensual.
 * Fijo + Variable + Sin clasificar = egresos operativos (base EBITDA);
 * el No-operativo (exclusión canónica) se muestra aparte.
 */
export function FixedVariableSection({ month }: { month: string }) {
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? "";
  const [data, setData] = useState<FixedVariableMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getFixedVariableMonth(month)
      .then(setData)
      .finally(() => setLoading(false));
  }, [month]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  const groups: { key: string; label: string; group: FVGroup; bar: string; text: string }[] = [
    { key: "fijo", label: "Fijos", group: data.fijo, bar: "bg-sky-500", text: "text-sky-700" },
    { key: "variable", label: "Variables", group: data.variable, bar: "bg-emerald-500", text: "text-emerald-700" },
    { key: "sin", label: "Sin clasificar", group: data.sinClasificar, bar: "bg-amber-400", text: "text-amber-700" },
  ];
  const visibleGroups = groups.filter((g) => g.group.total > 0 || g.key !== "sin");

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Egresos fijos vs variables</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Sobre los egresos operativos de {data.monthLabel} (los que entran al EBITDA) · Total: <strong>{formatCurrency(data.operativeTotal)}</strong>
        </p>
      </div>

      <div className="p-6 space-y-4">
        {data.operativeTotal === 0 ? (
          <div className="text-sm text-gray-500 text-center py-4">Sin egresos operativos este mes.</div>
        ) : (
          <>
            {/* Barra apilada Fijo / Variable / Sin clasificar */}
            <div className="h-4 w-full rounded-full overflow-hidden flex bg-gray-100">
              {groups.map((g) =>
                g.group.pctOfOperative > 0 ? (
                  <div
                    key={g.key}
                    className={g.bar}
                    style={{ width: `${g.group.pctOfOperative}%` }}
                    title={`${g.label}: ${formatCurrency(g.group.total)} (${g.group.pctOfOperative}%)`}
                  />
                ) : null,
              )}
            </div>

            {/* Tarjetas por grupo con detalle desplegable */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {visibleGroups.map((g) => (
                <div key={g.key} className="border border-gray-200 rounded-lg">
                  <button
                    onClick={() => setOpenGroup(openGroup === g.key ? null : g.key)}
                    className="w-full p-3 text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${g.text} flex items-center gap-1`}>
                        <span className={`w-2 h-2 rounded-full ${g.bar}`} />
                        {g.label}
                      </span>
                      {openGroup === g.key ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                    </div>
                    <div className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(g.group.total)}</div>
                    <div className="text-[11px] text-gray-500">{g.group.pctOfOperative}% de los operativos</div>
                  </button>
                  {openGroup === g.key && (
                    <div className="border-t border-gray-100 px-3 py-2 space-y-1">
                      {g.group.detail.length === 0 ? (
                        <div className="text-[11px] text-gray-400">Sin categorías este mes.</div>
                      ) : (
                        g.group.detail.map((d) => (
                          <div key={d.category} className="flex justify-between text-[11px]">
                            <span className="text-gray-600 truncate">{d.category}</span>
                            <span className="text-gray-900 font-medium ml-2">{formatCurrency(d.total)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Aviso de monto sin clasificar */}
        {data.sinClasificar.total > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <strong>{formatCurrency(data.sinClasificar.total)} sin clasificar</strong> ({data.sinClasificar.detail.map((d) => d.category).join(", ")}).
              No cuentan como fijo ni variable hasta asignarles grupo en{" "}
              <Link href={`/${negocio}/configuracion`} className="underline font-medium">Configuración → Categorías</Link>.
            </div>
          </div>
        )}

        {/* No-operativo aparte (exclusión canónica del EBITDA) */}
        {data.noOperativo.total > 0 && (
          <div className="text-[11px] text-gray-500 border-t border-gray-100 pt-3">
            Fuera del análisis — <strong>No operativo / financiero</strong> (excluido del EBITDA):{" "}
            {data.noOperativo.detail.map((d) => `${d.category} ${formatCurrency(d.total)}`).join(" · ")}{" "}
            = <strong className="text-gray-700">{formatCurrency(data.noOperativo.total)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
