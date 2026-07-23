"use client";

import { useEffect, useState } from "react";
import { PiggyBank, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getCapitalInjections, type CapitalInjections, type CapitalItem } from "@/app/actions/capital";

/**
 * Capital inyectado — responde de un golpe "¿cuánto he metido yo al
 * negocio y cuánto entró que no es venta?" (Jahnn, jul-2026). Los
 * montos ya están EXCLUIDOS de ventas/EBITDA/equilibrio por diseño;
 * esta tarjeta solo los reúne. Se oculta sola si no hay nada.
 */
export function CapitalCard() {
  const [data, setData] = useState<CapitalInjections | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await getCapitalInjections();
      if (r.ok) setData(r.data);
    })();
  }, []);

  if (!data) return null;
  const hayAlgo = data.totalTuyo > 0 || data.ventaActivos.total > 0;
  if (!hayAlgo) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
        <PiggyBank className="w-3.5 h-3.5" />
        Capital inyectado (no es venta — no infla ningún indicador)
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div>
            <div className="text-[11px] uppercase text-gray-500">Aporte de capital reconocido</div>
            <div className="text-xl font-black text-gray-900">{formatCurrency(data.totalTuyo)}</div>
            <div className="text-[11px] text-gray-500">Aportes + préstamos + financiamiento</div>
            {/* Acuerdo de socios jul-2026: TODO lo puesto por Jahnn se
                reconoce como aporte de capital (aumenta su participación).
                Es un acuerdo de acta — los saldos internos (préstamos,
                devoluciones, cuadre) NO cambian por esto. */}
            <div className="text-[11px] text-primary font-medium mt-0.5">
              ✓ Reconocido como aporte de capital en acta de socios (jul-2026)
            </div>
          </div>
          {/* Aportes y Préstamos socio quedan FUERA del resumen superior
              (pedido de Jahnn, jul-2026): con el acuerdo de socios, todo
              se reconoce como aporte de capital y mostrar los subtotales
              "no se devuelven" / "pendiente" confundía. El desglose sigue
              vivo en "Ver detalle movimiento por movimiento". */}
          {data.ventaActivos.total > 0 && (
            <div>
              <div className="text-[11px] uppercase text-gray-500">Venta de activos</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(data.ventaActivos.total)}</div>
              <div className="text-[11px] text-gray-500">Congeladora, equipos…</div>
            </div>
          )}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {open ? "Ocultar detalle" : "Ver detalle movimiento por movimiento"}
        </button>

        {open && (
          <div className="mt-2 space-y-3">
            {([
              ["Aportes de socios", data.aportes.items],
              ["Préstamos socio", data.socio.items],
              ["Financiamiento recibido", data.financiamiento.items],
              ["Venta de activos", data.ventaActivos.items],
            ] as [string, CapitalItem[]][])
              .filter(([, items]) => items.length > 0)
              .map(([titulo, items]) => (
                <div key={titulo}>
                  <div className="text-[11px] font-semibold uppercase text-gray-400 mb-1">{titulo}</div>
                  {items.map((it, i) => (
                    <div key={`${it.date}-${i}`} className="flex items-baseline justify-between text-xs border-t border-gray-100 py-1.5 gap-3">
                      <span className="text-gray-500 shrink-0">{formatDate(it.date)}</span>
                      <span className="text-gray-700 flex-1 truncate" title={it.note}>{it.note || "—"}</span>
                      <span className="font-medium text-gray-900 shrink-0">{formatCurrency(it.amount)}</span>
                    </div>
                  ))}
                </div>
              ))}
            <div className="text-[11px] text-gray-400">
              Las devoluciones de préstamos se gestionan en Préstamos socio; los aportes y clasificaciones,
              en el feed de Movimientos (Registro).
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
