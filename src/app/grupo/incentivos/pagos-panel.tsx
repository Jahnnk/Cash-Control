"use client";

import { useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { guardarExcepcionBono, quitarExcepcionBono } from "@/app/actions/bono-excepciones";
import { formatCurrency } from "@/lib/utils";
import type { PagoSede } from "@/lib/incentives/reporte-bonos-tipos";
import { COLOR_SEDE } from "@/lib/incentives/reporte-bonos";

const ORIGEN: Record<string, string> = { reloj: "reloj", registrada: "registradas", horario: "horario", contrato: "contrato" };

/**
 * Lo que se reparte en una sede y a quién: la vista previa de lo que Kelly
 * va a transferir. Son las mismas cifras del reporte (PDF y Excel).
 */
export function PagoSedePanel({
  pago, elegido, onElegir, onCambioExcepciones,
}: {
  pago: PagoSede;
  /** A quién se le suma el premio al mejor vendedor ahora (null = a nadie). */
  elegido: string | null;
  onElegir: (nombre: string | null) => void;
  /** Se llama después de guardar o quitar una excepción, para volver a calcular. */
  onCambioExcepciones: () => void;
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

        <QuienNoCobra pago={pago} bloqueado={acta} onCambio={onCambioExcepciones} />

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

/** Mes siguiente de uno YYYY-MM, sumando n meses. */
function sumarMeses(month: string, n: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Quién NO cobra este mes y por qué, con los botones para decidirlo: la regla
 * automática solo deja afuera el mes de ingreso (periodo de prueba); aquí la
 * dirección puede excluir a alguien por más meses o hacer que cobre alguien
 * que la regla dejó fuera.
 */
function QuienNoCobra({ pago, bloqueado, onCambio }: { pago: PagoSede; bloqueado: boolean; onCambio: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [dni, setDni] = useState("");
  const [motivo, setMotivo] = useState("Periodo de prueba");
  const [meses, setMeses] = useState(1);

  const hayAlgo = pago.excluidos.length > 0 || pago.incluidosPorExcepcion.length > 0;
  if (!hayAlgo && (bloqueado || !pago.excepcionesDisponibles)) {
    return pago.excepcionesDisponibles || bloqueado ? null : <SinTabla />;
  }

  async function ejecutar(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setOcupado(true);
    setError(null);
    const r = await fn();
    setOcupado(false);
    if (!r.ok) { setError(r.error); return; }
    setAbierto(false);
    onCambio();
  }

  const quitar = (id: number) => ejecutar(() => quitarExcepcionBono(id));
  const cobra = (e: PagoSede["excluidos"][number]) =>
    ejecutar(() => guardarExcepcionBono({ businessId: pago.businessId, dni: e.dni, accion: "incluir", desdeMes: pago.month, hastaMes: pago.month, motivo: "Cobra por decisión de la dirección" }));
  const excluir = () => {
    return ejecutar(() => guardarExcepcionBono({
      businessId: pago.businessId, dni, accion: "excluir", desdeMes: pago.month,
      hastaMes: sumarMeses(pago.month, meses - 1), motivo,
    }));
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 space-y-2">
      <div className="text-xs font-semibold text-gray-700">Quién no cobra este mes</div>
      {!hayAlgo && <div className="text-xs text-gray-500">Todos los del equipo cobran.</div>}
      {pago.excluidos.map((e) => (
        <div key={e.dni} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-900">{e.name}</span>
          <span className="text-gray-600">— {e.motivo}{e.origen === "manual" ? " (decidido por la dirección)" : ""}</span>
          {!bloqueado && pago.excepcionesDisponibles && (
            <button
              disabled={ocupado}
              onClick={() => (e.origen === "manual" && e.reglaId ? quitar(e.reglaId) : cobra(e))}
              className="ml-auto text-primary underline disabled:opacity-50"
            >
              {e.origen === "manual" ? "Quitar exclusión" : "Sí cobra"}
            </button>
          )}
        </div>
      ))}
      {pago.incluidosPorExcepcion.map((i) => (
        <div key={i.dni} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-900">{i.name}</span>
          <span className="text-gray-600">— cobra por decisión de la dirección ({i.motivo})</span>
          {!bloqueado && <button disabled={ocupado} onClick={() => quitar(i.reglaId)} className="ml-auto text-primary underline disabled:opacity-50">Quitar</button>}
        </div>
      ))}

      {!bloqueado && !pago.excepcionesDisponibles && <SinTabla />}
      {!bloqueado && pago.excepcionesDisponibles && (
        abierto ? (
          <div className="flex flex-wrap items-end gap-2 text-xs pt-1">
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Persona</span>
              <select value={dni} onChange={(e) => setDni(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
                <option value="">Elige…</option>
                {pago.lines.filter((l) => l.dni).map((l) => <option key={l.dni} value={l.dni!}>{l.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Motivo</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 bg-white w-44" />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">Por cuántos meses (desde este)</span>
              <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
                {[1, 2, 3, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? "mes" : "meses"}</option>)}
              </select>
            </label>
            <button disabled={ocupado || !dni} onClick={excluir} className="px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-50">Guardar</button>
            <button onClick={() => setAbierto(false)} className="px-2 py-1.5 text-gray-500">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setAbierto(true)} className="text-xs text-primary underline">Dejar a alguien sin bono (ej. en prueba)…</button>
        )
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}

function SinTabla() {
  return (
    <div className="text-[11px] text-amber-700 flex gap-1.5">
      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
      Para decidir quién cobra o no cobra por varios meses falta crear una tabla (se hace una sola vez). Mientras tanto solo rige la regla automática: quien ingresó después del día 1 no cobra ese mes.
    </div>
  );
}
