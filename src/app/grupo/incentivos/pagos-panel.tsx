"use client";

import { AlertTriangle, Lock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PagoSede } from "@/lib/incentives/reporte-bonos-tipos";
import { COLOR_SEDE } from "@/lib/incentives/reporte-bonos";

const ORIGEN: Record<string, string> = { reloj: "reloj", registrada: "registradas", horario: "horario" };

/**
 * Lo que se reparte en una sede y a quién: la vista previa de lo que Kelly
 * va a transferir. Son las mismas cifras del reporte (PDF y Excel).
 */
export function PagoSedePanel({
  pago, elegido, onElegir,
}: {
  pago: PagoSede;
  /** A quién se le suma el premio al mejor vendedor ahora (null = a nadie). */
  elegido: string | null;
  onElegir: (nombre: string | null) => void;
}) {
  const color = COLOR_SEDE[pago.businessId]?.color ?? "#004C40";
  const acta = pago.fuente === "acta";
  const avisos = [...pago.blockers.map((b) => `Pendiente: ${b}`), ...pago.warnings];

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-white" style={{ backgroundColor: color }}>
        <div className="font-bold">{pago.sede}</div>
        <div className="text-sm">
          {pago.nivel ? `Nivel alcanzado: ${pago.nivel}` : "Sin nivel de ticket"} ·{" "}
          <strong>A repartir {formatCurrency(pago.totalBonos)}</strong>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {acta && (
          <div className="text-xs text-gray-600 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Mes liquidado: son las cifras del acta, no se pueden cambiar aquí.
          </div>
        )}

        {!pago.nivel && !acta && (
          <p className="text-xs text-gray-500">
            Sin nivel de ticket no hay bono este mes. Abajo se ve lo que se habría repartido con las horas de cada persona.
          </p>
        )}

        {pago.nivel && !acta && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
            <span className="font-medium">Premio al mejor vendedor ({formatCurrency(pago.premioDelNivel)}):</span>
            <select
              value={elegido ?? ""}
              onChange={(e) => onElegir(e.target.value || null)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 bg-white text-xs"
            >
              <option value="">Sin premio</option>
              {pago.equipo.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {pago.mejorVendedor.sugeridoByte && (
              <span className="text-gray-500">
                Byte sugiere a {pago.mejorVendedor.sugeridoByte.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())}
              </span>
            )}
          </label>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-1.5 font-medium">Colaborador</th>
                <th className="py-1.5 font-medium">DNI</th>
                <th className="py-1.5 font-medium text-right">Horas del bono</th>
                <th className="py-1.5 font-medium text-right">Bono</th>
                <th className="py-1.5 font-medium text-right">Premio</th>
                <th className="py-1.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {pago.lines.map((l) => (
                <tr key={l.name} className="border-b border-gray-50">
                  <td className="py-1.5 text-gray-900">{l.name}</td>
                  <td className="py-1.5 text-gray-500">{l.dni ?? <span className="text-amber-600">sin DNI</span>}</td>
                  <td className="py-1.5 text-right text-gray-600">
                    {l.jornada === "administrador"
                      ? "monto fijo"
                      : l.horasMes !== null
                        ? `${l.horasMes} h (${l.horasReales ? (l.origenHoras ? ORIGEN[l.origenHoras] : "Planilla") : "contrato"})`
                        : "tabla fija"}
                  </td>
                  <td className="py-1.5 text-right">{formatCurrency(l.bono)}</td>
                  <td className="py-1.5 text-right">{l.premioMv > 0 ? formatCurrency(l.premioMv) : "—"}</td>
                  <td className="py-1.5 text-right font-semibold text-gray-900">{formatCurrency(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="py-2 text-right font-semibold text-gray-700">Total a repartir en {pago.sede}</td>
                <td className="py-2 text-right font-bold" style={{ color }}>{formatCurrency(pago.totalBonos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {avisos.length > 0 && (
          <ul className="space-y-1">
            {avisos.map((a) => (
              <li key={a} className="text-[11px] text-amber-700 flex gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {a}</li>
            ))}
          </ul>
        )}
        {pago.sincronizadoEn && (
          <div className="text-[11px] text-gray-400">
            Equipo y horas comprobados contra Planilla el{" "}
            {new Date(pago.sincronizadoEn).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short", hour12: false })}.
          </div>
        )}
      </div>
    </div>
  );
}
