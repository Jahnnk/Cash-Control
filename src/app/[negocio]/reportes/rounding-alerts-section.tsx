"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, Check } from "lucide-react";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  getRoundingAlerts,
  markRoundingAlertReviewed,
  type RoundingAlertRow,
} from "@/app/actions/rounding-alerts";

export function RoundingAlertsSection({ month }: { month: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<RoundingAlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar/cambiar mes
    setLoading(true);
    getRoundingAlerts({ status: "pending", month }).then((rows) => {
      setAlerts(rows);
      setLoading(false);
    });
  }, [month]);

  function markOK(id: string) {
    const note = prompt("Nota para esta alerta (opcional):", "OK") ?? "OK";
    startTransition(async () => {
      const r = await markRoundingAlertReviewed(id, note);
      if (r.success) {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        router.refresh();
      }
    });
  }

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-amber-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">
              Alertas a revisar ({alerts.length})
            </h3>
            <p className="text-xs text-gray-500">
              Diferencias entre QuipuPOS y Cuentas que no son propinas
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-amber-100 divide-y divide-gray-100">
          {alerts.map((a) => (
            <div key={a.id} className="px-6 py-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-sm">
              <div className="sm:col-span-2 font-medium">{formatDateShort(a.date)}</div>
              <div className="sm:col-span-1">
                <span className={`text-xs px-2 py-0.5 rounded ${a.payment_method === "yape_plin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                  {a.payment_method === "yape_plin" ? "Yape" : "POS"}
                </span>
              </div>
              <div className="sm:col-span-3 text-xs text-gray-600">
                QuipuPOS {formatCurrency(a.amount_quipupos ?? 0)} ·{" "}
                Cuentas {formatCurrency(a.amount_cuentas ?? 0)}
              </div>
              <div className="sm:col-span-1 text-right font-medium" style={{ color: a.difference > 0 ? "#10b981" : "#dc2626" }}>
                {a.difference > 0 ? "+" : ""}{formatCurrency(a.difference)}
              </div>
              <div className="sm:col-span-3 text-xs text-gray-700 truncate">{a.note_text ?? "—"}</div>
              <div className="sm:col-span-2 text-right">
                <button
                  onClick={() => markOK(a.id)}
                  disabled={pending}
                  className="text-xs text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> Marcar OK
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
