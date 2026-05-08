"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Coffee, Banknote, Smartphone, ArrowDownToLine, Tag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { saveByteSales, getByteSales, type ByteSalesData } from "@/app/actions/byte-sales";

/**
 * Resumen Byte B2C — Fonavi y Centro (cafeterías).
 *
 * Reemplaza al "Resumen Byte" tipo B2B usado en Atelier.
 * 4 métodos de pago: Efectivo, POS, Yape/Plin, Transferencia.
 * + Descuentos (info) como referencia (no afecta totales).
 */
export function ResumenByteB2C({ date }: { date: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [efectivo, setEfectivo] = useState("");
  const [pos, setPos] = useState("");
  const [yapePlin, setYapePlin] = useState("");
  const [transferencia, setTransferencia] = useState("");
  const [descuentos, setDescuentos] = useState("");

  // Cargar valores existentes al montar / cambiar fecha.
  // setState dentro del effect es intencional (sync inicial con backend),
  // mismo patrón ya tolerado en useBankBalance / useCashBalance.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setSaved(false);
    setError(null);
    getByteSales(date).then((d) => {
      setEfectivo(d.efectivo > 0 ? String(d.efectivo) : "");
      setPos(d.pos > 0 ? String(d.pos) : "");
      setYapePlin(d.yape_plin > 0 ? String(d.yape_plin) : "");
      setTransferencia(d.transferencia > 0 ? String(d.transferencia) : "");
      setDescuentos(d.descuentos_info > 0 ? String(d.descuentos_info) : "");
      setLoading(false);
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [date]);

  function n(s: string): number {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : 0;
  }

  const efectivoN = n(efectivo);
  const posN = n(pos);
  const yapePlinN = n(yapePlin);
  const transferenciaN = n(transferencia);
  const descuentosN = n(descuentos);

  const totalVentas = efectivoN + posN + yapePlinN + transferenciaN;
  const aCajaEfectivo = efectivoN;
  const aCuentaBCP = posN + yapePlinN + transferenciaN;

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const data: ByteSalesData = {
        efectivo: efectivoN,
        pos: posN,
        yape_plin: yapePlinN,
        transferencia: transferenciaN,
        descuentos_info: descuentosN,
      };
      const r = await saveByteSales(date, data);
      if (!r.success) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-light/50";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Coffee className="w-4 h-4 text-primary-light" />
          Resumen Byte — Ventas
        </h3>
        <p className="text-xs text-gray-500">
          Registra las ventas del día por método de pago. Cada cliente paga al instante (cafetería B2C).
        </p>
      </div>

      {loading ? (
        <div className="text-center text-sm text-gray-500 py-6 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando ventas del día...
        </div>
      ) : (
        <>
          {/* Grid 2x2 con 4 métodos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldB2C
              icon={<Banknote className="w-4 h-4 text-emerald-600" />}
              label="Efectivo"
              hint="Caja física"
              value={efectivo}
              onChange={setEfectivo}
            />
            <FieldB2C
              icon={<ArrowDownToLine className="w-4 h-4 text-blue-600" />}
              label="POS"
              hint="A BCP"
              value={pos}
              onChange={setPos}
            />
            <FieldB2C
              icon={<Smartphone className="w-4 h-4 text-purple-600" />}
              label="Yape/Plin"
              hint="A BCP"
              value={yapePlin}
              onChange={setYapePlin}
            />
            <FieldB2C
              icon={<ArrowDownToLine className="w-4 h-4 text-blue-600" />}
              label="Transferencia"
              hint="A BCP"
              value={transferencia}
              onChange={setTransferencia}
            />
          </div>

          {/* Descuentos (info) */}
          <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Tag className="w-4 h-4 text-amber-600 shrink-0" />
                <label className="text-sm font-medium text-gray-700">Descuentos (info)</label>
              </div>
              <input
                type="number" step="0.01" min="0"
                value={descuentos}
                onChange={(e) => setDescuentos(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} max-w-[160px]`}
              />
              <span className="text-[11px] text-gray-500">
                no afecta totales, solo informativo
              </span>
            </div>
          </div>

          {/* Total + desglose */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-gray-700">TOTAL VENTAS DEL DÍA</span>
              <span className="text-2xl font-bold text-gray-900">{formatCurrency(totalVentas)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
              <div className="flex items-baseline justify-between text-gray-600">
                <span>→ A caja efectivo</span>
                <span className="font-medium text-emerald-700">{formatCurrency(aCajaEfectivo)}</span>
              </div>
              <div className="flex items-baseline justify-between text-gray-600">
                <span>→ A cuenta BCP</span>
                <span className="font-medium text-blue-700">{formatCurrency(aCuentaBCP)}</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-emerald-700">✓ Guardado</span>}
            <button
              onClick={handleSave}
              disabled={pending}
              className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {pending ? "Guardando..." : "Guardar Resumen Byte"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FieldB2C({
  icon, label, hint, value, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
        {icon}
        {label}
        <span className="text-[10px] text-gray-400 font-normal ml-auto">{hint}</span>
      </label>
      <input
        type="number" step="0.01" min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-light/50"
      />
    </div>
  );
}
