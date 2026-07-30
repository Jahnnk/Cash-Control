"use client";

import Link from "next/link";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import type { TodayAction } from "@/lib/grupo/today-actions";

/**
 * "¿Qué debo hacer hoy?" — máximo tres frases, en imperativo, cada una
 * con el número que la justifica y un clic a donde se resuelve.
 * Sin nada pendiente muestra el estado en calma, no una lista vacía.
 */

const DOT: Record<TodayAction["severity"], string> = {
  critico: "bg-red-500",
  atencion: "bg-amber-500",
  info: "bg-slate-300",
};

export function TodayActionsCard({ actions }: { actions: TodayAction[] }) {
  if (actions.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-6">
        <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400">Hoy</div>
        <div className="mt-4 flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" strokeWidth={2} />
          <span className="text-sm font-medium text-gray-900">Nada pendiente</span>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">Datos al día y ninguna sede en alerta.</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-6">
      <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-gray-400">
        Hoy · {actions.length} {actions.length === 1 ? "cosa" : "cosas"}
      </div>
      <ul className="mt-4 space-y-1">
        {actions.map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              className="group flex items-start gap-3 -mx-2 px-2 py-2.5 rounded-lg transition-colors hover:bg-gray-50"
            >
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${DOT[a.severity]}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900 leading-snug">{a.title}</span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{a.detail}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
