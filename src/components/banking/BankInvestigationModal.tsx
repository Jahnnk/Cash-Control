"use client";

/**
 * Panel/modal de investigación de diferencia bancaria.
 *
 * Fase 2 de conciliación bancaria — solo Atelier (el card que lo
 * abre ya está gated a Atelier).
 *
 * Estructura:
 *   Header:    "Investigar diferencia" + cierre
 *   Resumen:   monto firmado + interpretación + rango de búsqueda
 *   Candidatos: lista rankeada con acción por fila ("Registrar ↗" /
 *               "Ver lista ↗")
 *   Footer:    "Marcar como resuelto" (verde) | "Aceptar diferencia"
 *
 * Las acciones de candidatos navegan a /atelier/registro con query
 * params (?tipo=ingreso&prefill_amount=29.45&prefill_method=yape_plin)
 * que `registro/page.tsx` pasa a RegistroForm como props iniciales.
 *
 * El status del check NO se actualiza automáticamente cuando se
 * registra un movimiento — Jahnn debe presionar "Marcar como
 * resuelto" explícitamente.
 */
import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { X, AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  investigateDifference,
  updateCheckStatus,
  type InvestigationResult,
  type Candidate,
} from "@/app/actions/bank-real-checks";

export function BankInvestigationModal({
  open,
  onClose,
  onResolved,
}: {
  open: boolean;
  onClose: () => void;
  /** Se llama tras marcar como resolved/accepted exitoso. */
  onResolved: () => void | Promise<void>;
}) {
  const router = useRouter();
  const params = useParams<{ negocio?: string }>();
  const negocio = params?.negocio ?? "atelier";
  const [data, setData] = useState<InvestigationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al abrir
    setLoading(true);
    setError(null);
    investigateDifference()
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error inesperado");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  function handleCandidateAction(c: Candidate) {
    const action = c.suggestedAction;
    if (!action) return;
    if (action.type === "create_income" || action.type === "create_expense") {
      const tipo = action.type === "create_income" ? "ingreso" : "gasto";
      const qs = new URLSearchParams({
        tipo,
        prefill_amount: String(action.prefilledData.amount),
      });
      if (action.prefilledData.paymentMethod) {
        qs.set("prefill_method", action.prefilledData.paymentMethod);
      }
      router.push(`/${negocio}/registro?${qs.toString()}`);
      onClose();
      return;
    }
    if (action.type === "view_movements") {
      // Por ahora no soportamos filtro de fecha en /registro — abrimos
      // simplemente la página de reportes con el rango. Es el "ver
      // lista" más usable que tenemos hoy.
      const qs = new URLSearchParams({
        tab: "semanal",
        desde: action.prefilledData.startDate,
        hasta: action.prefilledData.endDate,
      });
      router.push(`/${negocio}/reportes?${qs.toString()}`);
      onClose();
      return;
    }
  }

  function handleMarkStatus(newStatus: "resolved" | "accepted") {
    if (!data?.checkId) return;
    setError(null);
    startTransition(async () => {
      const r = await updateCheckStatus(data.checkId!, newStatus);
      if (!r.success) {
        setError(r.error);
        return;
      }
      await onResolved();
      onClose();
    });
  }

  const diff = data?.difference ?? 0;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const interpretacion =
    diff > 0
      ? "Banco real tiene MÁS dinero que el sistema → probablemente falta registrar un ingreso."
      : diff < 0
        ? "Banco real tiene MENOS dinero que el sistema → probablemente falta registrar un egreso."
        : "Las cifras cuadran.";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !pending && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Investigar diferencia
          </h3>
          <button
            onClick={() => !pending && onClose()}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            disabled={pending}
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="p-12 flex items-center justify-center text-gray-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Buscando candidatos...
          </div>
        )}

        {!loading && data && (
          <div className="p-6 space-y-5">
            {/* Resumen */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-sm text-amber-900 font-medium">Diferencia</span>
                <span className="text-2xl font-semibold" style={{ color: "#854F0B" }}>
                  {sign}{formatCurrency(Math.abs(diff))}
                </span>
              </div>
              <p className="text-xs text-amber-800 mb-2">{interpretacion}</p>
              {data.searchStartDate && data.searchEndDate && (
                <p className="text-[11px] text-amber-700">
                  {data.lastCleanDate
                    ? `Último día cuadrado/resuelto: ${formatDate(data.lastCleanDate)} · `
                    : "Sin historial cuadrado previo · "}
                  buscando entre <strong>{formatDate(data.searchStartDate)}</strong> y{" "}
                  <strong>{formatDate(data.searchEndDate)}</strong>
                </p>
              )}
            </div>

            {/* Candidatos */}
            {data.candidates.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">
                Sin candidatos por el momento. La diferencia podría estar fuera del rango analizado.
              </p>
            ) : (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">
                  Candidatos ({data.candidates.length})
                </h4>
                {data.candidates.map((c, i) => (
                  <CandidateCard key={i} candidate={c} onAction={() => handleCandidateAction(c)} />
                ))}
              </div>
            )}

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!loading && data?.checkId && (
          <div className="flex flex-col sm:flex-row gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => handleMarkStatus("resolved")}
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Marcar como resuelto
            </button>
            <button
              onClick={() => handleMarkStatus("accepted")}
              disabled={pending}
              className="flex-1 inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50"
            >
              Aceptar diferencia
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  onAction,
}: {
  candidate: Candidate;
  onAction: () => void;
}) {
  const bgByType: Record<Candidate["type"], string> = {
    exact_match: "bg-emerald-50 border-emerald-200",
    missing_income_hint: "bg-blue-50 border-blue-200",
    missing_expense_hint: "bg-orange-50 border-orange-200",
    date_range_review: "bg-gray-50 border-gray-200",
  };
  const labelByType: Record<Candidate["type"], string> = {
    exact_match: "Coincidencia exacta",
    missing_income_hint: "Sugerencia",
    missing_expense_hint: "Sugerencia",
    date_range_review: "Período acotado",
  };
  const actionLabel = (() => {
    if (!candidate.suggestedAction) return null;
    if (candidate.suggestedAction.type === "create_income") return "Registrar ingreso";
    if (candidate.suggestedAction.type === "create_expense") return "Registrar egreso";
    return "Ver lista";
  })();

  return (
    <div className={`rounded-lg border ${bgByType[candidate.type]} p-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-gray-600 uppercase tracking-wide">
              {labelByType[candidate.type]}
            </span>
            <span className="text-[10px] text-gray-400">#{candidate.rank}</span>
          </div>
          <h5 className="text-sm font-medium text-gray-900 mb-0.5">{candidate.title}</h5>
          <p className="text-xs text-gray-600">{candidate.description}</p>
          {candidate.matches && candidate.matches.length > 0 && (
            <ul className="mt-2 space-y-1">
              {candidate.matches.slice(0, 3).map((m) => (
                <li key={m.id} className="text-[11px] text-gray-700 flex items-center gap-2">
                  <span className={m.kind === "income" ? "text-emerald-700" : "text-red-600"}>
                    {m.kind === "income" ? "+" : "−"}{formatCurrency(m.amount)}
                  </span>
                  <span className="text-gray-500">·</span>
                  <span>{formatDate(m.date)}</span>
                  <span className="text-gray-500">·</span>
                  <span className="truncate">{m.label}</span>
                </li>
              ))}
              {candidate.matches.length > 3 && (
                <li className="text-[11px] text-gray-500">
                  …y {candidate.matches.length - 3} más
                </li>
              )}
            </ul>
          )}
        </div>
        {actionLabel && (
          <button
            onClick={onAction}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded"
          >
            {actionLabel}
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
