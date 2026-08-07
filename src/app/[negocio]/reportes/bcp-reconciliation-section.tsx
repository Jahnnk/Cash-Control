"use client";

/**
 * Pantalla "Cuadre BCP" — nació de la auditoría de las socias (ago-2026).
 *
 * Responde UNA pregunta: ¿lo registrado en el sistema coincide con lo que
 * hizo la cuenta del banco este mes? Antes había que armarlo a mano en
 * Excel día por día.
 *
 * Lo primero que se ve es la prueba del saldo, porque es la que no admite
 * discusión: el saldo lo copia Jahnn del BCP cada mañana. Los campos para
 * pegar los totales del extracto son opcionales y no se guardan — sirven
 * para comparar en el momento, que es lo que se hace en una auditoría.
 */

import { useState, useEffect, useCallback } from "react";
import { getBcpReconciliation, type BcpReconciliation } from "@/app/actions/bcp-reconciliation";
import { formatCurrency, formatDateShort } from "@/lib/utils";

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  const l = new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

/** Fila comparativa: cifra del sistema vs. la que el usuario pega del extracto. */
function Comparar({
  etiqueta, ayuda, sistema, valor, onChange,
}: {
  etiqueta: string; ayuda: string; sistema: number;
  valor: string; onChange: (v: string) => void;
}) {
  const n = parseFloat(valor.replace(/,/g, ""));
  const hay = valor.trim() !== "" && !Number.isNaN(n);
  const dif = hay ? Math.round((n - sistema) * 100) / 100 : null;
  const cuadra = dif !== null && Math.abs(dif) < 0.005;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 sm:gap-3 sm:items-center py-3 border-b border-gray-100 last:border-0">
      <div>
        <div className="text-sm font-medium text-gray-900">{etiqueta}</div>
        <div className="text-[11px] text-gray-500">{ayuda}</div>
      </div>
      <div className="text-sm tabular-nums text-gray-900 sm:w-32 sm:text-right font-medium">
        {formatCurrency(sistema)}
      </div>
      <div className="sm:w-36">
        <input
          type="text" inputMode="decimal" value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tu extracto"
          aria-label={`${etiqueta} según el extracto`}
          className="w-full px-2.5 py-1.5 text-sm text-right tabular-nums border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
      </div>
      <div className="sm:w-32 sm:text-right text-sm tabular-nums font-semibold">
        {dif === null ? (
          <span className="text-gray-300">—</span>
        ) : cuadra ? (
          <span className="text-emerald-700">Cuadra ✓</span>
        ) : (
          <span className={dif > 0 ? "text-amber-700" : "text-red-600"}>
            {dif > 0 ? "+" : "−"}{formatCurrency(Math.abs(dif))}
          </span>
        )}
      </div>
    </div>
  );
}

export function BcpReconciliationSection() {
  const [month, setMonth] = useState(() => lastMonths(1)[0]);
  const [data, setData] = useState<BcpReconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [extIng, setExtIng] = useState("");
  const [extEgr, setExtEgr] = useState("");

  const cargar = useCallback(async (m: string) => {
    setLoading(true);
    try {
      setData(await getBcpReconciliation(m));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void cargar(month); }, [month, cargar]);
  useEffect(() => { setExtIng(""); setExtEgr(""); }, [month]);

  const meses = lastMonths(14);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Cuadre con el extracto del BCP</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Compara lo registrado contra lo que hizo la cuenta. El efectivo no entra: nunca aparece en un extracto.
          </p>
        </div>
        <select
          value={month} onChange={(e) => setMonth(e.target.value)}
          aria-label="Mes a revisar"
          className="ml-auto px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {meses.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {loading || !data ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
          Calculando…
        </div>
      ) : (
        <>
          {/* La prueba del saldo — lo primero que debe leerse */}
          {(() => {
            const sinBase = data.saldoInicial === null || data.saldoFinal === null;
            const ok = !sinBase && data.diasConDescuadre.length === 0;
            const tono = sinBase
              ? { borde: "border-gray-200", fondo: "bg-gray-50", texto: "text-gray-700" }
              : ok
              ? { borde: "border-emerald-200", fondo: "bg-emerald-50", texto: "text-emerald-800" }
              : { borde: "border-amber-200", fondo: "bg-amber-50", texto: "text-amber-800" };
            return (
              <div className={`rounded-xl border ${tono.borde} ${tono.fondo} p-4`}>
                <div className={`text-sm font-semibold ${tono.texto}`}>
                  {sinBase
                    ? "Sin saldo anterior para comparar"
                    : ok
                    ? `Los ${data.diasVerificados} días del mes cuadran con el saldo del banco`
                    : `${data.diasConDescuadre.length} día(s) no cuadran con el saldo del banco`}
                </div>
                <p className="text-[11px] text-gray-600 mt-0.5 mb-3">
                  {sinBase
                    ? "Falta el saldo del BCP anterior a este mes. Sin ese punto de partida no se puede probar la cadena."
                    : ok
                    ? "Cada día: saldo anterior + lo que entró − lo que salió = saldo anotado. Si cuadra, no falta ningún movimiento."
                    : "Revisa los días de abajo: ahí falta o sobra un movimiento."}
                </p>

                {!sinBase && (
                  <div className="bg-white/70 rounded-lg border border-white p-3 text-sm space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-600">
                        Saldo al {data.saldoInicialFecha ? formatDateShort(data.saldoInicialFecha) : "inicio"}
                      </span>
                      <span className="tabular-nums">{formatCurrency(data.saldoInicial!)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-600">+ Entró al banco</span>
                      <span className="tabular-nums text-emerald-700">{formatCurrency(data.ingresos)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-600">− Salió del banco</span>
                      <span className="tabular-nums text-red-600">{formatCurrency(data.egresos)}</span>
                    </div>
                    <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 font-semibold">
                      <span>
                        = Saldo al {data.saldoFinalFecha ? formatDateShort(data.saldoFinalFecha) : "cierre"}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(data.saldoInicial! + data.variacionSistema)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 text-[12px]">
                      <span className="text-gray-500">Saldo real anotado del BCP</span>
                      <span className={`tabular-nums font-semibold ${ok ? "text-emerald-700" : "text-amber-700"}`}>
                        {formatCurrency(data.saldoFinal!)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Comparar contra el extracto */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Compara con tu extracto</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Escribe los totales de tu estado de cuenta y mira la diferencia. No se guardan.
              </p>
            </div>
            <div className="px-4">
              <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                <span />
                <span className="w-32 text-right">Sistema</span>
                <span className="w-36 text-right">Extracto</span>
                <span className="w-32 text-right">Diferencia</span>
              </div>
              <Comparar
                etiqueta="Entró al banco"
                ayuda="Incluye préstamos recibidos y reembolsos; no es lo mismo que las ventas del mes."
                sistema={data.ingresos} valor={extIng} onChange={setExtIng}
              />
              <Comparar
                etiqueta="Salió del banco"
                ayuda="Monto completo de cada cargo, incluidas devoluciones de préstamos y la parte de otras sedes."
                sistema={data.egresos} valor={extEgr} onChange={setExtEgr}
              />
            </div>
            <p className="px-4 py-3 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">
              Si estas cifras no cuadran pero los días de arriba sí, lo más probable es que al extracto le
              falte un movimiento en la suma, o que el banco lo haya fechado en otro mes.
            </p>
          </div>

          {/* Movimientos sin explicar */}
          {(data.sinDescripcion.ingresos > 0 || data.sinDescripcion.egresos > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Movimientos sin explicar</h3>
              <p className="text-[11px] text-gray-500 mt-0.5 mb-2">
                Están bien registrados, pero no dicen de qué son. Es lo primero que preguntan al auditar.
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {data.sinDescripcion.ingresos > 0 && (
                  <span className="text-gray-700">
                    <strong className="tabular-nums">{data.sinDescripcion.ingresos}</strong> ingresos sin descripción
                    <span className="text-gray-500"> · {formatCurrency(data.sinDescripcion.ingresosMonto)}</span>
                  </span>
                )}
                {data.sinDescripcion.egresos > 0 && (
                  <span className="text-gray-700">
                    <strong className="tabular-nums">{data.sinDescripcion.egresos}</strong> egresos sin concepto claro
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Día por día */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Día por día</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Para comparar contra el extracto sin buscar. Los días marcados no cuadran con el saldo.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2 text-left font-semibold">Fecha</th>
                    <th className="px-4 py-2 text-right font-semibold">Entró</th>
                    <th className="px-4 py-2 text-right font-semibold">Salió</th>
                    <th className="px-4 py-2 text-right font-semibold">Saldo esperado</th>
                    <th className="px-4 py-2 text-right font-semibold">Saldo del BCP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => {
                    const mal = d.descuadre !== null && Math.abs(d.descuadre) > 0.005;
                    return (
                      <tr key={d.date} className={`border-t border-gray-100 ${mal ? "bg-amber-50" : ""}`}>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {formatDateShort(d.date)}
                          {mal && (
                            <span className="ml-2 text-[10px] font-semibold text-amber-700">
                              {d.descuadre! > 0 ? "+" : "−"}{formatCurrency(Math.abs(d.descuadre!))}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                          {d.ingresos ? formatCurrency(d.ingresos) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-red-600">
                          {d.egresos ? formatCurrency(d.egresos) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                          {d.saldoEsperado === null ? <span className="text-gray-300">—</span> : formatCurrency(d.saldoEsperado)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {d.saldoReal === null ? <span className="text-gray-300">sin anotar</span> : formatCurrency(d.saldoReal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                    <td className="px-4 py-2.5">Total del mes</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{formatCurrency(data.ingresos)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{formatCurrency(data.egresos)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {data.variacionSistema >= 0 ? "+" : "−"}{formatCurrency(Math.abs(data.variacionSistema))}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {data.variacionReal === null ? "—" : (
                        <span className={Math.abs(data.variacionReal - data.variacionSistema) < 0.005 ? "text-emerald-700" : "text-amber-700"}>
                          {data.variacionReal >= 0 ? "+" : "−"}{formatCurrency(Math.abs(data.variacionReal))}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
