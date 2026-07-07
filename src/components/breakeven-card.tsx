"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getBreakevenMonth } from "@/app/actions/breakeven";
import type { BreakevenResult, BreakevenEstado } from "@/lib/breakeven";

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** ["2026-04","2026-05","2026-06"] → "promedio abr–jun". */
function refLabel(months: string[]): string {
  const short = (m: string) => MES_CORTO[Number(m.slice(5, 7)) - 1] ?? m;
  if (months.length === 1) return `mes de ${short(months[0])}`;
  return `promedio ${short(months[0])}–${short(months[months.length - 1])}`;
}

const ESTADO_META: Record<BreakevenEstado, { label: string; chip: string; bar: string }> = {
  superado:  { label: "✅ Superado",   chip: "bg-emerald-50 border-emerald-200 text-emerald-800", bar: "bg-emerald-500" },
  en_camino: { label: "🟡 En camino",  chip: "bg-amber-50 border-amber-200 text-amber-800",       bar: "bg-amber-400" },
  en_riesgo: { label: "🔴 En riesgo",  chip: "bg-red-50 border-red-200 text-red-800",             bar: "bg-red-500" },
  sin_datos: { label: "Sin datos",     chip: "bg-gray-50 border-gray-200 text-gray-500",          bar: "bg-gray-300" },
};

/** Contenido de la tarjeta (reutilizado por sede y por grupo). */
export function BreakevenBody({
  r,
  isCurrent,
  compact = false,
}: {
  r: BreakevenResult;
  isCurrent: boolean;
  compact?: boolean;
}) {
  const meta = ESTADO_META[r.estado];
  const pct = r.avancePct !== null ? Math.min(r.avancePct, 100) : 0;

  if (r.estado === "sin_datos") {
    return (
      <div className="text-xs text-gray-500">
        Aún no se puede calcular: {r.warnings[0] ?? "faltan ventas o costos fijos clasificados este mes."}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-2xl font-black text-gray-900">
            {r.breakEven !== null ? formatCurrency(r.breakEven) : "—"}
          </span>
          <span className="text-[11px] text-gray-500 ml-1.5">de venta al mes para no perder</span>
        </div>
        <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 border ${meta.chip}`}>{meta.label}</span>
      </div>

      {r.breakEven !== null && (
        <>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full ${meta.bar}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-gray-500">
            Vendido: <strong className="text-gray-800">{formatCurrency(r.ventas)}</strong> ({r.avancePct}%)
            {isCurrent && r.estado !== "superado" && r.diaEstimadoCruce !== null && (
              <> · al ritmo actual se cruza el <strong className="text-gray-800">día {r.diaEstimadoCruce}</strong></>
            )}
            {isCurrent && r.estado === "en_riesgo" && r.diaEstimadoCruce === null && r.ventasProyectadas !== null && (
              <> · proyección {formatCurrency(r.ventasProyectadas)}: <strong className="text-red-700">no alcanza este mes</strong></>
            )}
          </div>
        </>
      )}

      {r.breakEven !== null && (
        <div className="text-[11px] text-gray-400">
          Fijos {formatCurrency(r.fijos)}{r.referenceMonths ? ` (referencia: ${refLabel(r.referenceMonths)})` : ""} · variables {r.varRatio !== null ? `${Math.round(r.varRatio * 100)}%` : "—"} de las ventas
          {!compact && (
            <> → cada sol vendido deja {r.contributionMargin !== null ? `S/${r.contributionMargin.toFixed(2)}` : "—"} para cubrir fijos</>
          )}.
        </div>
      )}

      {r.warnings.map((w) => (
        <div key={w} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          {w}
        </div>
      ))}
    </div>
  );
}

/**
 * Tarjeta "Punto de equilibrio del mes" del dashboard de sede.
 * ¿Cuánto hay que vender este mes para no perder plata — y vamos a llegar?
 */
export function BreakevenCard({ month }: { month: string }) {
  const [state, setState] = useState<{ r: BreakevenResult; isCurrent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getBreakevenMonth(month);
      if (!alive) return;
      if (res.ok) { setState({ r: res.data, isCurrent: res.isCurrent }); setError(null); }
      else { setState(null); setError(res.error); }
    })();
    return () => { alive = false; };
  }, [month]);

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
        <Scale className="w-3.5 h-3.5" />
        Punto de equilibrio del mes
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {error ? (
          <div className="text-xs text-gray-500">{error}</div>
        ) : !state ? (
          <div className="text-xs text-gray-400">Calculando…</div>
        ) : (
          <BreakevenBody r={state.r} isCurrent={state.isCurrent} />
        )}
      </div>
    </section>
  );
}
