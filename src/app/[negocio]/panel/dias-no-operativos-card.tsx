"use client";

/**
 * Días que no cuentan para la meta — el control de dirección.
 *
 * Pedido de Jahnn (22-ago-2026), por el corte de luz en Centro: poder
 * "pausar" un día para que no baje el ticket promedio del equipo.
 *
 * Dos caras según quién mira, a propósito:
 *
 *  · DIRECCIÓN ve el formulario: fecha + motivo, y puede deshacer.
 *  · EL ADMINISTRADOR solo ve la lista, y solo si hay algo marcado. No
 *    puede tocarla: esto mueve el bono, y quien lo cobra no puede sacar
 *    sus propios días flojos. Pero SÍ tiene que verla — es la manera de
 *    que Chari sepa que su día ya quedó cubierto y deje de preocuparse.
 *
 * Si no hay nada pausado y no eres dirección, la tarjeta no se dibuja:
 * un panel lleno de controles que no usas es ruido.
 */

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2, Trash2 } from "lucide-react";
import {
  getDiasPausados, marcarDiaNoOperativo, quitarDiaNoOperativo,
  type DiasPausadosSede,
} from "@/app/actions/dias-no-operativos";
import { MAX_MOTIVO_DIA } from "@/lib/incentivos/dias-no-operativos";
import { getToday } from "@/lib/utils";
import { conReintento } from "@/lib/con-reintento";

/** "mié 19 de agosto" — la fecha como la diría una persona. */
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-PE", {
    weekday: "short", day: "numeric", month: "long", timeZone: "UTC",
  });
}

export function DiasNoOperativosCard({
  onCambio,
}: {
  /** Para que el panel recalcule el ticket sin recargar la página. */
  onCambio?: () => void;
}) {
  const [data, setData] = useState<DiasPausadosSede | null>(null);
  const [fecha, setFecha] = useState(getToday());
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setData(await conReintento(() => getDiasPausados()));
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- fetch al montar */
    void cargar();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [cargar]);

  async function marcar() {
    setGuardando(true);
    setError(null);
    const r = await marcarDiaNoOperativo({ fecha, motivo });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    setMotivo("");
    await cargar();
    onCambio?.();
  }

  async function quitar(f: string) {
    setGuardando(true);
    const r = await quitarDiaNoOperativo({ fecha: f });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    await cargar();
    onCambio?.();
  }

  if (!data?.visible) return null;
  if (!data.puedeMarcar && data.dias.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <CalendarOff className="w-4 h-4 text-sky-600" />
        <h3 className="text-sm font-semibold text-gray-900">Días que no cuentan para la meta</h3>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {data.puedeMarcar
          ? "Cortes de luz, feriados o cierres imprevistos. El día deja de afectar el ticket promedio y el piso de tráfico — la venta que sí hubo se mantiene en los reportes."
          : "Dirección marcó estos días como no operativos: no afectan su ticket promedio."}
      </p>

      {data.puedeMarcar && (
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <label className="text-xs text-gray-600">
            Día
            <input
              type="date"
              value={fecha}
              max={getToday()}
              onChange={(e) => setFecha(e.target.value)}
              className="block border border-gray-300 rounded-lg px-2 py-1.5 text-xs mt-0.5"
            />
          </label>
          <label className="text-xs text-gray-600 flex-1 min-w-[200px]">
            Motivo
            <input
              type="text"
              value={motivo}
              maxLength={MAX_MOTIVO_DIA}
              placeholder="Corte de luz, feriado, cierre por mantenimiento…"
              onChange={(e) => setMotivo(e.target.value)}
              className="block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs mt-0.5"
            />
          </label>
          <button
            onClick={marcar}
            disabled={guardando || motivo.trim() === ""}
            className="px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-light rounded-lg disabled:opacity-40"
          >
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "No contar este día"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {data.dias.length === 0 ? (
        <p className="text-xs text-gray-400">Ningún día marcado.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.dias.map((d) => (
            <li key={d.fecha} className="flex items-center gap-2 py-1.5 text-xs">
              <span className="font-medium text-gray-800 w-40 shrink-0">{fechaLarga(d.fecha)}</span>
              <span className="text-gray-600 flex-1">{d.motivo}</span>
              <span className="text-gray-400">{d.marcadoPor}</span>
              {data.puedeMarcar && (
                <button
                  onClick={() => quitar(d.fecha)}
                  disabled={guardando}
                  title="Volver a contar este día"
                  className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
